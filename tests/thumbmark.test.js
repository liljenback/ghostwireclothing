const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/thumbmark.js"), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup({ get } = {}) {
  const logs = [];
  const errors = [];
  const warnings = [];
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
    document, window, setTimeout, clearTimeout, Error,
    console: {
      log: (...args) => logs.push(args),
      error: (...args) => errors.push(args),
      warn: (...args) => warnings.push(args)
    }
  });
  return { options, document, window, logs, errors, warnings };
}

test("collects automatically without a consent API and does not duplicate the initial pageshow", async () => {
  let calls = 0;
  const page = setup({ get: async () => {
    calls++;
    return { thumbmark: "hash-one", components: { system: { browser: "<script>" } } };
  } });
  await tick();
  assert.equal(calls, 1);
  assert.equal(page.window.thumbmarkResult.thumbmark, "hash-one");
  assert.equal(page.logs[0][1], page.window.thumbmarkResult);
  assert.equal(page.logs.length, 1);
  assert.equal(page.options[0].logging, false);
  assert.equal(page.options[0].collect_beacon, false);
  assert.deepEqual(Array.from(page.options[0].exclude), ["webrtc"]);
  page.window.listeners.pageshow();
  await tick();
  assert.equal(calls, 1);
  assert.equal(page.window.listeners["ghostwire:consent"], undefined);
});

test("clears results on navigation and collects again on back/forward cache restoration", async () => {
  const page = setup({
    get: async () => ({ thumbmark: "restored", components: { system: {} } }) });
  await tick();
  assert.equal(page.window.thumbmarkResult.thumbmark, "restored");
  page.window.listeners.pagehide();
  assert.equal(page.window.thumbmarkResult, null);
  page.window.listeners.pageshow();
  await tick();
  assert.equal(page.window.thumbmarkResult.thumbmark, "restored");
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
  resolves[1]({ thumbmark: "fresh", components: { system: {} } });
  await tick();
  assert.equal(page.window.thumbmarkResult.thumbmark, "fresh");
  assert.equal(page.logs.length, 1);
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
  assert.match(failed.errors[0][1].message, /no usable fingerprint/);
  const partial = setup({
    get: async () => ({ thumbmark: "partial", components: { system: {} },
      error: [{ type: "component_timeout", component: "audio" }] }) });
  await tick();
  assert.equal(partial.warnings[0][1][0].component, "audio");
  assert.equal(partial.window.thumbmarkResult.error[0].component, "audio");
});
