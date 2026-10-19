(function () {
  "use strict";

  let active = false;
  let revision = 0;
  let loading;
  window.thumbmarkResult = null;

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
      window.thumbmarkResult = response;
      if (response.error && response.error.length) {
        console.warn("[ThumbmarkJS] Component warnings:", response.error);
      }
      console.log("[ThumbmarkJS]", response);
      await uploadClientHints(response);
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
