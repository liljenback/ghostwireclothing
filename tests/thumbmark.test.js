const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/thumbmark.js"), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function webglContext({ renderer = "test-renderer", debugInfo = true } = {}) {
  return {
    MAX_TEXTURE_SIZE: 3379,
    MAX_RENDERBUFFER_SIZE: 34024,
    MAX_VIEWPORT_DIMS: 3386,
    isContextLost: () => false,
    getExtension(name) {
      assert.equal(name, "WEBGL_debug_renderer_info");
      return debugInfo ? { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 } : null;
    },
    getSupportedExtensions: () => debugInfo ?
      ["WEBGL_debug_renderer_info", "OES_texture_float"] : ["OES_texture_float"],
    getParameter(parameter) {
      switch (parameter) {
        case 37445: return "test-vendor";
        case 37446: return renderer;
        case 3379: return 16384;
        case 34024: return 8192;
        case 3386: return new Int32Array([16384, 8192]);
        default: throw new Error("Unexpected WebGL parameter: " + parameter);
      }
    }
  };
}

function setup({
  get, fetch: request, uploadTimeout, getContext = () => null, display = {},
  navigator = { webdriver: false }, pageContext = {}
} = {}) {
  const logs = [];
  const errors = [];
  const warnings = [];
  const requests = [];
  function element() {
    return { children: [],
      appendChild(child) { this.children.push(child); }, remove() {} };
  }
  const document = {
    head: element(),
    createElement: (tag) => tag === "canvas" ? { getContext } : element(),
    hasFocus: () => true,
    visibilityState: "visible",
    ...pageContext
  };
  const options = [];
  const window = {
    navigator,
    screen: {
      width: 1920, height: 1080, availWidth: 1920, availHeight: 1040,
      orientation: { type: "landscape-primary", angle: 0 }
    },
    innerWidth: 1280,
    innerHeight: 720,
    outerWidth: 1300,
    outerHeight: 800,
    devicePixelRatio: 1.25,
    ...display,
    listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; }
  };
  if (get) {
    window.ThumbmarkJS = { Thumbmark: class {
      constructor(config) { options.push(config); }
      get() { return get(); }
    } };
  }
  vm.runInNewContext(source, {
    document, window, clearTimeout, Error, AbortController,
    setTimeout: (callback, delay) => {
      if (delay === 10000 && uploadTimeout) {
        return uploadTimeout(callback);
      }
      return setTimeout(callback, delay);
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return request ? request(url, options) : { ok: true, status: 204, text: async () => "" };
    },
    console: {
      log: (...args) => logs.push(args),
      error: (...args) => errors.push(args),
      warn: (...args) => warnings.push(args)
    }
  });
  return { options, document, window, logs, errors, warnings, requests };
}

test("collects automatically without a consent API and does not duplicate the initial pageshow", async () => {
  let calls = 0;
  const page = setup({ get: async () => {
    calls++;
    return {
      thumbmark: "hash-one",
      components: { system: { browser: "<script>" } },
      version: "1.12.0",
      elapsed: {
        audio: 2.5,
        "_dispatch.webgl": 7,
        "_pipeline.dispatch": 19,
        "_pipeline.stringify": 0
      },
      info: { example: "preserved" },
      metadata: { run: "test" }
    };
  } });
  await tick();
  assert.equal(calls, 1);
  assert.equal(page.window.thumbmarkResult.thumbmark, "hash-one");
  assert.equal(page.logs[0][1], page.window.thumbmarkResult);
  assert.equal(page.logs.length, 2);
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "https://www.ghostwireclothing.com/api/client_hints");
  assert.equal(page.requests[0].options.method, "POST");
  assert.equal(page.requests[0].options.headers["Content-Type"], "application/json");
  const payload = JSON.parse(page.requests[0].options.body);
  assert.equal(page.requests[0].options.body, JSON.stringify(page.logs[0][1]));
  assert.equal(payload.elapsed.audio, 2.5);
  assert.equal(payload.elapsed["_dispatch.webgl"], 7);
  assert.equal(payload.elapsed["_pipeline.stringify"], 0);
  assert.equal(page.options[0].logging, false);
  assert.equal(page.options[0].collect_beacon, false);
  assert.deepEqual(Array.from(page.options[0].exclude), ["webrtc"]);
  page.window.listeners.pageshow();
  await tick();
  assert.equal(calls, 1);
  assert.equal(page.requests.length, 1);
  assert.equal(page.window.listeners["ghostwire:consent"], undefined);
});

test("clears results on navigation and collects again on back/forward cache restoration", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "restored", components: { system: {} } }) });
  await tick();
  assert.equal(page.window.thumbmarkResult.thumbmark, "restored");
  page.window.listeners.pagehide();
  assert.equal(page.window.thumbmarkResult, null);
  assert.equal(page.requests.length, 1);
  page.window.listeners.pageshow();
  await tick();
  assert.equal(page.window.thumbmarkResult.thumbmark, "restored");
  assert.equal(page.requests.length, 2);
});

test("adds raw WebGL signals to the payload without changing Thumbmark data or its hash", async () => {
  for (const renderer of [
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
    "ANGLE (Intel, Intel(R) UHD Graphics, OpenGL 4.1)",
    "Apple M1",
    "swiftshader"
  ]) {
    const original = {
      thumbmark: "original-hash",
      components: { webgl: { renderer: "library-renderer" }, custom: { existing: "preserved" } },
      elapsed: { webgl: 4 },
      info: { example: "preserved" }
    };
    const page = setup({
      get: async () => original,
      getContext: (type) => {
        assert.equal(type, "webgl");
        return webglContext({ renderer });
      }
    });
    await tick();
    const payload = JSON.parse(page.requests[0].options.body);
    assert.deepEqual(payload.components.custom.webgl, {
      supported: true,
      status: "success",
      vendor: "test-vendor",
      renderer,
      isSwiftShader: /swiftshader/i.test(renderer),
      isANGLE: /angle/i.test(renderer),
      capabilities: {
        status: "success",
        extensions: ["OES_texture_float", "WEBGL_debug_renderer_info"],
        limits: { maxTextureSize: 16384, maxRenderbufferSize: 8192, maxViewportDims: [16384, 8192] }
      }
    });
    assert.equal(payload.thumbmark, original.thumbmark);
    assert.deepEqual(payload.components.webgl, original.components.webgl);
    assert.equal(payload.components.custom.existing, "preserved");
    assert.deepEqual(payload.elapsed, original.elapsed);
    assert.deepEqual(payload.info, original.info);
    assert.equal(original.components.custom.webgl, undefined);
    assert.equal(page.requests[0].options.body, JSON.stringify(page.window.thumbmarkResult));
    assert.equal(page.logs[0][1], page.window.thumbmarkResult);
  }
});

test("uploads display dimensions alongside existing Thumbmark and custom WebGL signals", async () => {
  const original = {
    thumbmark: "display-hash",
    components: { screen: { resolution: "library-resolution" }, custom: { existing: true } }
  };
  const page = setup({ get: async () => original });
  await tick();
  const payload = JSON.parse(page.requests[0].options.body);
  assert.deepEqual(payload.components.custom.display, {
    screenWidth: 1920,
    screenHeight: 1080,
    availableWidth: 1920,
    availableHeight: 1040,
    viewportWidth: 1280,
    viewportHeight: 720,
    outerWidth: 1300,
    outerHeight: 800,
    devicePixelRatio: 1.25
  });
  assert.deepEqual(payload.components.screen, original.components.screen);
  assert.equal(payload.components.custom.existing, true);
  assert.deepEqual(payload.components.custom.webgl, { supported: false, status: "no_context" });
  assert.equal(payload.thumbmark, original.thumbmark);
  assert.equal(original.components.custom.display, undefined);
  assert.equal(page.requests[0].options.body, JSON.stringify(page.window.thumbmarkResult));
});

test("omits orientation information and refreshes display values on cache restoration", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "display-hash", components: { screen: {} } }),
    display: { screen: { width: 390, height: 844, availWidth: 390, availHeight: 844 } }
  });
  await tick();
  const initial = JSON.parse(page.requests[0].options.body).components.custom.display;
  assert.equal("orientation" in initial, false);
  assert.equal("orientationAngle" in initial, false);
  page.window.listeners.pagehide();
  page.window.innerWidth = 844;
  page.window.innerHeight = 390;
  page.window.screen.orientation = { type: "landscape-secondary", angle: 270 };
  page.document.visibilityState = "hidden";
  page.document.hasFocus = () => false;
  page.window.listeners.pageshow();
  await tick();
  const restored = JSON.parse(page.requests[1].options.body).components.custom.display;
  assert.equal(restored.viewportWidth, 844);
  assert.equal(restored.viewportHeight, 390);
  assert.equal("orientation" in restored, false);
  assert.equal("orientationAngle" in restored, false);
  assert.deepEqual(JSON.parse(page.requests[1].options.body).components.custom.pageContext, {
    hasFocus: false, visibilityState: "hidden"
  });
});

test("reports display collection errors without blocking other signals or the upload", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} } }),
    display: { screen: { get width() { throw new Error("Screen access blocked"); } } }
  });
  await tick();
  const payload = JSON.parse(page.requests[0].options.body);
  assert.deepEqual(payload.components.custom.display, { error: "Screen access blocked" });
  assert.deepEqual(payload.components.custom.webgl, { supported: false, status: "no_context" });
  assert.equal(payload.thumbmark, "available");
  assert.equal(page.warnings[0][0], "[ThumbmarkJS] Custom display collection failed:");
  assert.equal(page.errors.length, 0);
});

test("preserves true, false and unavailable webdriver values in the custom upload", async () => {
  for (const value of [true, false, undefined]) {
    const page = setup({
      get: async () => ({ thumbmark: "webdriver-hash", components: { system: {} } }),
      navigator: value === undefined ? {} : { webdriver: value }
    });
    await tick();
    const payload = JSON.parse(page.requests[0].options.body);
    assert.deepEqual(payload.components.custom.webdriver, { value: value ?? null });
    assert.equal(payload.thumbmark, "webdriver-hash");
    assert.deepEqual(payload.components.system, {});
    assert.deepEqual(payload.components.custom.webgl, { supported: false, status: "no_context" });
    assert.equal(payload.components.custom.display.screenWidth, 1920);
    assert.equal(page.requests[0].options.body, JSON.stringify(page.window.thumbmarkResult));
    assert.equal(page.warnings.length, 0);
  }
});

test("reports webdriver access errors without blocking the fingerprint upload", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} } }),
    navigator: { get webdriver() { throw new Error("Webdriver access blocked"); } }
  });
  await tick();
  const payload = JSON.parse(page.requests[0].options.body);
  assert.deepEqual(payload.components.custom.webdriver, {
    value: null, error: "Webdriver access blocked"
  });
  assert.equal(payload.thumbmark, "available");
  assert.equal(payload.components.custom.display.screenWidth, 1920);
  assert.equal(page.warnings[0][0], "[ThumbmarkJS] Custom webdriver collection failed:");
  assert.equal(page.errors.length, 0);
});

test("falls back to experimental WebGL and handles unavailable debug renderer information", async () => {
  const contexts = [];
  const page = setup({
    get: async () => ({ thumbmark: "fallback", components: { system: {} } }),
    getContext: (type) => {
      contexts.push(type);
      return type === "webgl" ? null : webglContext({ debugInfo: false });
    }
  });
  await tick();
  assert.deepEqual(contexts, ["webgl", "experimental-webgl"]);
  assert.deepEqual(JSON.parse(page.requests[0].options.body).components.custom.webgl, {
    supported: true, status: "unavailable_extension",
    vendor: null, renderer: null, isSwiftShader: false, isANGLE: false,
    capabilities: {
      status: "success",
      extensions: ["OES_texture_float"],
      limits: { maxTextureSize: 16384, maxRenderbufferSize: 8192, maxViewportDims: [16384, 8192] }
    }
  });
  assert.equal(page.warnings.length, 0);
});

test("reports unsupported WebGL without interrupting fingerprint uploads", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "no-webgl", components: { system: {} } })
  });
  await tick();
  assert.deepEqual(JSON.parse(page.requests[0].options.body).components.custom.webgl, {
    supported: false, status: "no_context"
  });
  assert.equal(page.warnings.length, 0);
});

test("reports WebGL exceptions separately and still uploads the Thumbmark result", async () => {
  for (const stage of ["context", "extension", "parameter"]) {
    const fail = () => { throw new Error("Blocked " + stage); };
    const page = setup({
      get: async () => ({ thumbmark: "available", components: { system: {} } }),
      getContext: stage === "context" ? fail : () => ({
        ...webglContext(),
        getExtension: stage === "extension" ? fail : () => ({
          UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446
        }),
        getParameter: fail
      })
    });
    await tick();
    const payload = JSON.parse(page.requests[0].options.body);
    assert.equal(payload.thumbmark, "available");
    assert.deepEqual(payload.components.custom.webgl, {
      supported: stage === "context" ? null : true, status: "error", error: "Blocked " + stage
    });
    assert.equal(page.warnings[0][0], "[ThumbmarkJS] Custom WebGL collection failed:");
    assert.equal(page.errors.length, 0);
  }
});

test("reports lost WebGL contexts as errors rather than unavailable renderer information", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} } }),
    getContext: () => ({ ...webglContext(), isContextLost: () => true })
  });
  await tick();
  const webgl = JSON.parse(page.requests[0].options.body).components.custom.webgl;
  assert.equal(webgl.status, "error");
  assert.equal(webgl.supported, true);
  assert.match(webgl.error, /context was lost/);
  assert.equal(page.warnings[0][0], "[ThumbmarkJS] Custom WebGL collection failed:");
});

test("capability failures preserve the successfully collected WebGL renderer", async () => {
  for (const stage of ["extensions", "limits", "lost-context"]) {
    let checks = 0;
    const gl = webglContext();
    if (stage === "extensions") gl.getSupportedExtensions = () => null;
    if (stage === "limits") {
      const getParameter = gl.getParameter;
      gl.getParameter = (parameter) => {
        if (parameter === gl.MAX_TEXTURE_SIZE) throw new Error("Limits blocked");
        return getParameter(parameter);
      };
    }
    if (stage === "lost-context") gl.isContextLost = () => ++checks === 3;
    const page = setup({
      get: async () => ({ thumbmark: "available", components: { system: {} } }),
      getContext: () => gl
    });
    await tick();
    const webgl = JSON.parse(page.requests[0].options.body).components.custom.webgl;
    assert.equal(webgl.status, "success");
    assert.equal(webgl.renderer, "test-renderer");
    assert.equal(webgl.capabilities.status, "error");
    assert.match(webgl.capabilities.error, /extensions could not be read|Limits blocked|context was lost/);
    assert.equal(page.warnings[0][0], "[ThumbmarkJS] Custom WebGL capabilities collection failed:");
    assert.equal(page.errors.length, 0);
  }
});

test("includes focus and visibility snapshots without treating unavailable values as false", async () => {
  for (const context of [
    { hasFocus: () => true, visibilityState: "visible" },
    { hasFocus: () => false, visibilityState: "hidden" },
    { hasFocus: undefined, visibilityState: undefined }
  ]) {
    const page = setup({
      get: async () => ({ thumbmark: "available", components: { system: {} } }),
      pageContext: context
    });
    await tick();
    assert.deepEqual(JSON.parse(page.requests[0].options.body).components.custom.pageContext, {
      hasFocus: context.hasFocus ? context.hasFocus() : null,
      visibilityState: context.visibilityState ?? null
    });
    assert.equal(page.warnings.length, 0);
  }
});

test("page context errors do not block other custom signals or uploads", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} } }),
    pageContext: { hasFocus: () => { throw new Error("Focus unavailable"); } }
  });
  await tick();
  const payload = JSON.parse(page.requests[0].options.body);
  assert.deepEqual(payload.components.custom.pageContext, { error: "Focus unavailable" });
  assert.equal(payload.components.custom.display.screenWidth, 1920);
  assert.deepEqual(payload.components.custom.webdriver, { value: false });
  assert.equal(page.warnings[0][0], "[ThumbmarkJS] Custom page context collection failed:");
  assert.equal(page.errors.length, 0);
});

test("navigation and restoration discard stale in-flight results", async () => {
  const resolves = [];
  const page = setup({ get: () => new Promise((resolve) => resolves.push(resolve)) });
  await tick();
  page.window.listeners.pagehide();
  page.window.listeners.pageshow();
  await tick();
  resolves[0]({ thumbmark: "stale", components: { system: {} } });
  await tick();
  assert.equal(page.window.thumbmarkResult, null);
  assert.equal(page.requests.length, 0);
  resolves[1]({ thumbmark: "fresh", components: { system: {} } });
  await tick();
  assert.equal(page.window.thumbmarkResult.thumbmark, "fresh");
  assert.equal(page.logs.length, 2);
  assert.equal(page.requests.length, 1);
});

test("navigation during CDN loading prevents stale collection; CDN errors are reported", async () => {
  const page = setup();
  assert.equal(page.document.head.children.length, 1);
  page.window.listeners.pagehide();
  let calls = 0;
  page.window.ThumbmarkJS = { Thumbmark: class { constructor() { calls++; } } };
  page.document.head.children[0].onload();
  await tick();
  assert.equal(calls, 0);
  assert.equal(page.requests.length, 0);
  const failed = setup();
  failed.document.head.children[0].onerror();
  await tick();
  assert.match(failed.errors[0][1].message, /Could not load ThumbmarkJS/);
  assert.equal(failed.errors.length, 1);
});

test("invalid responses log errors; component warnings are logged and retained in the result", async () => {
  const failed = setup({ get: async () => ({ thumbmark: "" }) });
  await tick();
  assert.equal(failed.window.thumbmarkResult, null);
  assert.equal(failed.requests.length, 0);
  assert.match(failed.errors[0][1].message, /no usable fingerprint/);
  const partial = setup({
    get: async () => ({ thumbmark: "partial", components: { system: {} },
      error: [{ type: "component_timeout", component: "audio" }] }) });
  await tick();
  assert.equal(partial.warnings[0][1][0].component, "audio");
  assert.equal(partial.window.thumbmarkResult.error[0].component, "audio");
  assert.equal(partial.requests[0].options.body, JSON.stringify(partial.window.thumbmarkResult));
});

test("HTTP and network failures preserve the fingerprint, report errors and do not retry", async () => {
  for (const failure of ["http", "network"]) {
    const page = setup({
      get: async () => ({ thumbmark: "available", components: { system: {} }, version: "1.12.0" }),
      fetch: async () => {
        if (failure === "network") throw new TypeError("Failed to fetch");
        return { ok: false, status: 503 };
      }
    });
    await tick();
    assert.equal(page.window.thumbmarkResult.thumbmark, "available");
    assert.equal(page.requests.length, 1);
    assert.equal(page.errors[0][0], "[ThumbmarkJS] Upload failed:");
    assert.match(page.errors[0][1].message, failure === "http" ? /HTTP 503/ : /Failed to fetch/);
    assert.equal(page.logs.length, 1);
  }
});

test("uploads time out without clearing the collected fingerprint", async () => {
  let expire;
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} }, version: "1.12.0" }),
    uploadTimeout: (callback) => { expire = callback; },
    fetch: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("Upload timed out")));
    })
  });
  await tick();
  expire();
  await tick();
  assert.equal(page.requests[0].options.signal.aborted, true);
  assert.equal(page.window.thumbmarkResult.thumbmark, "available");
  assert.match(page.errors[0][1].message, /Upload timed out/);
});

test("logs the entire backend JSON response, including additional server fields", async () => {
  const response = {
    thumbmark: "available",
    requestId: "request-one",
    enrichedFingerprint: "server-fingerprint",
    server: { ja4: "test-ja4", headers: { userAgent: "test-browser" } },
    extra: { futureField: true }
  };
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} }, version: "1.12.0" }),
    fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(response) })
  });
  await tick();
  assert.equal(page.logs[2][0], "[ThumbmarkJS] API response:");
  assert.deepEqual(JSON.parse(JSON.stringify(page.logs[2][1])), response);
  assert.equal(page.window.thumbmarkResult.thumbmark, "available");
  assert.equal(page.errors.length, 0);
});

test("invalid backend JSON is reported as a response error, not a failed upload", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "available", components: { system: {} }, version: "1.12.0" }),
    fetch: async () => ({ ok: true, status: 200, text: async () => "<html>Not JSON</html>" })
  });
  await tick();
  assert.equal(page.logs[1][0], "[ThumbmarkJS] Upload succeeded:");
  assert.equal(page.errors[0][0], "[ThumbmarkJS] API response could not be read:");
  assert.equal(page.window.thumbmarkResult.thumbmark, "available");
});
