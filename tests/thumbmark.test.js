const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/thumbmark.js"), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup({ get, fetch: request, uploadTimeout } = {}) {
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
    createElement: element
  };
  const options = [];
  const window = {
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
  assert.deepEqual(payload, page.logs[0][1]);
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
  assert.deepEqual(JSON.parse(partial.requests[0].options.body), partial.window.thumbmarkResult);
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
