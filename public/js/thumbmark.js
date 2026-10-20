(function () {
  "use strict";

  let active = false;
  let revision = 0;
  let loading;
  window.thumbmarkResult = null;

  function getWebGLCapabilities(gl) {
    try {
      const extensions = gl.getSupportedExtensions();
      if (extensions === null) {
        throw new Error("WebGL supported extensions could not be read.");
      }
      const limits = {
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS))
      };
      if (gl.isContextLost()) {
        throw new Error("WebGL context was lost during capability collection.");
      }
      return { status: "success", extensions: extensions.sort(), limits };
    } catch (error) {
      console.warn("[ThumbmarkJS] Custom WebGL capabilities collection failed:", error);
      return { status: "error", error: String(error?.message ?? error) };
    }
  }

  function getWebGLFingerprint() {
    let supported = null;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return { supported: false, status: "no_context" };
      supported = true;
      if (gl.isContextLost()) {
        throw new Error("WebGL context was lost before renderer collection.");
      }

      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null;
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
      if (gl.isContextLost()) {
        throw new Error("WebGL context was lost during renderer collection.");
      }
      return {
        supported,
        status: debugInfo ? "success" : "unavailable_extension",
        vendor,
        renderer,
        isSwiftShader: /swiftshader/i.test(renderer || ""),
        isANGLE: /angle/i.test(renderer || ""),
        capabilities: getWebGLCapabilities(gl)
      };
    } catch (error) {
      console.warn("[ThumbmarkJS] Custom WebGL collection failed:", error);
      return { supported, status: "error", error: String(error?.message ?? error) };
    }
  }

  function getDisplaySignals() {
    try {
      const s = window.screen;
      return {
        screenWidth: s.width,
        screenHeight: s.height,
        availableWidth: s.availWidth,
        availableHeight: s.availHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio
      };
    } catch (error) {
      console.warn("[ThumbmarkJS] Custom display collection failed:", error);
      return { error: String(error.message || error) };
    }
  }

  function getWebdriverSignals() {
    try {
      return { value: window.navigator.webdriver ?? null };
    } catch (error) {
      console.warn("[ThumbmarkJS] Custom webdriver collection failed:", error);
      return { value: null, error: String(error.message || error) };
    }
  }

  function getPageContext() {
    try {
      return {
        hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : null,
        visibilityState: document.visibilityState ?? null
      };
    } catch (error) {
      console.warn("[ThumbmarkJS] Custom page context collection failed:", error);
      return { error: String(error?.message ?? error) };
    }
  }

  async function uploadClientHints(fingerprint) {
    const controller = new AbortController();
    const timeout = setTimeout(function () {
      controller.abort();
    }, 10000);
    try {
      const response = await fetch("https://www.ghostwireclothing.com/api/client_hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fingerprint),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("Client signals API returned HTTP " + response.status);
      }
      console.log("[ThumbmarkJS] Upload succeeded:", response.status);
      try {
        const body = await response.text();
        if (body.trim()) {
          console.log("[ThumbmarkJS] API response:", JSON.parse(body));
        }
      } catch (error) {
        console.error("[ThumbmarkJS] API response could not be read:", error);
      }
    } catch (error) {
      console.error("[ThumbmarkJS] Upload failed:", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  function loadThumbmark() {
    if (window.ThumbmarkJS && typeof window.ThumbmarkJS.Thumbmark === "function") {
      return Promise.resolve();
    }
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@thumbmarkjs/thumbmarkjs@1.12.0/dist/thumbmark.umd.js";
      script.integrity = "sha256-0T5eZ91joxOm1AzZJfJQY5kTKlz/Z1RdoYjbH2B6Fss=";
      script.crossOrigin = "anonymous";
      const timeout = setTimeout(function () {
        finish(new Error("ThumbmarkJS loading timed out. Refresh to retry."));
      }, 15000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        script.remove();
        if (error) reject(error);
        else resolve();
      }
      script.onload = function () {
        finish(window.ThumbmarkJS && typeof window.ThumbmarkJS.Thumbmark === "function" ?
          null : new Error("ThumbmarkJS loaded without its browser API."));
      };
      script.onerror = function () {
        finish(new Error("Could not load ThumbmarkJS. Check CDN access or content blockers and refresh."));
      };
      document.head.appendChild(script);
    }).finally(function () {
      loading = null;
    });
    return loading;
  }

  async function collect(currentRevision) {
    const isCurrent = function () {
      return currentRevision === revision;
    };
    try {
      await loadThumbmark();
      if (!isCurrent()) return;
      const tm = new window.ThumbmarkJS.Thumbmark({
        logging: false,
        collect_beacon: false,
        performance: true,
        timeout: 5000,
        exclude: ["webrtc"]
      });
      const response = await tm.get();
      if (!isCurrent()) return;
      if (!response || typeof response.thumbmark !== "string" || !response.thumbmark ||
          !response.components || typeof response.components !== "object" ||
          Object.keys(response.components).length === 0) {
        throw new Error("ThumbmarkJS returned no usable fingerprint or component data.");
      }
      const result = {
        ...response,
        components: {
          ...response.components,
          custom: {
            ...response.components.custom,
            webgl: getWebGLFingerprint(),
            display: getDisplaySignals(),
            webdriver: getWebdriverSignals(),
            pageContext: getPageContext()
          }
        }
      };
      window.thumbmarkResult = result;
      if (response.error && response.error.length) {
        console.warn("[ThumbmarkJS] Component warnings:", response.error);
      }
      console.log("[ThumbmarkJS]", result);
      await uploadClientHints(result);
    } catch (error) {
      if (isCurrent()) {
        window.thumbmarkResult = null;
        console.error("[ThumbmarkJS]", error);
      }
    }
  }

  function start() {
    if (active) return;
    active = true;
    revision += 1;
    window.thumbmarkResult = null;
    collect(revision);
  }

  window.addEventListener("pageshow", start);
  window.addEventListener("pagehide", function () {
    active = false;
    revision += 1;
    window.thumbmarkResult = null;
  });
  start();
})();
