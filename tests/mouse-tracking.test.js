const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/mouse-tracking.js"), "utf8");

function setup(options = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const beacons = [];
  const requests = [];
  function emitter(properties = {}) {
    const listeners = new Map();
    return Object.assign(properties, {
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      emit(name, event = {}) {
        for (const callback of listeners.get(name) || []) callback(event);
      }
    });
  }
  class Element {
    constructor(tagName = "SPAN", href = null) {
      this.tagName = tagName;
      this.link = href ? { href } : null;
    }
    closest() { return this.link; }
  }
  const window = emitter({ innerWidth: 1200, innerHeight: 800, thumbmarkResult: { thumbmark: "test-hash" } });
  const document = emitter({ visibilityState: "visible" });
  vm.runInNewContext(source, {
    window, document, Element, Blob, Date,
    performance: { now: () => now },
    navigator: {
      sendBeacon: options.noBeacon ? undefined : (url, body) => {
        if (options.throwBeacon) throw new Error("Unavailable");
        beacons.push({ url, body });
        return options.acceptBeacon !== false;
      }
    },
    fetch(url, request) {
      requests.push({ url, ...request });
      return Promise.resolve({ ok: true });
    },
    console: { warn() {} },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  function advance(time) {
    for (;;) {
      const entry = [...timers.entries()].filter(([, timer]) => timer.due <= time)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry) break;
      now = entry[1].due;
      timers.delete(entry[0]);
      entry[1].callback();
    }
    now = time;
  }
  return {
    window, document, beacons, requests, advance, timers,
    move(time, x, y, pointerType = "mouse") {
      advance(time);
      document.emit("pointermove", { clientX: x, clientY: y, pointerType });
    },
    click(time, x, y, overrides = {}) {
      advance(time);
      document.emit("click", {
        clientX: x, clientY: y, detail: 1, button: 0, pointerType: "mouse",
        target: new Element("SPAN", "https://example.com/product"), ...overrides
      });
      return JSON.parse(JSON.stringify(window.mouseTrackingResult));
    }
  };
}

test("click uploads bounded JSON with viewport, actual target and enclosing href", async () => {
  const page = setup();
  page.move(0, 10, 20);
  const payload = page.click(10, 10, 20);
  assert.equal(payload.type, "mouse_tracking");
  assert.equal(payload.thumbmark, "test-hash");
  assert.deepEqual(payload.viewport, { width: 1200, height: 800 });
  assert.equal(payload.click.tagName, "span");
  assert.equal(payload.click.href, "https://example.com/product");
  assert.equal(payload.samples.length, 1);
  assert.equal(page.beacons[0].url, "https://www.ghostwireclothing.com/api/interactions");
  assert.equal(page.beacons[0].body.type, "application/json");
  assert.deepEqual(JSON.parse(await page.beacons[0].body.text()), payload);
  assert.equal(page.requests.length, 0);
});

test("30 ms sampling retains subpixel trailing adjustments and computes speed", () => {
  const page = setup();
  page.move(0, 0, 0);
  page.move(10, 1, 0);
  page.move(20, 1.5, 0);
  page.advance(30);
  page.move(35, 1.75, 0);
  const payload = page.click(36, 1.75, 0);
  assert.deepEqual(payload.samples.map(p => [p.x, p.t]), [[0, 0], [1.5, 20], [1.75, 35]]);
  assert.equal(payload.samples[1].speed, 75);
  assert.ok(Math.abs(payload.samples[2].speed - 16.6666666667) < 0.0001);
  assert.equal(page.timers.size, 0);
});

test("stationary positions are omitted and resuming adds an anchor without invented speed", () => {
  const page = setup();
  page.move(0, 10, 20);
  page.move(100, 10, 20);
  page.move(1000, 11, 20);
  page.move(1020, 12, 20);
  const payload = page.click(1030, 12, 20);
  assert.deepEqual(payload.samples.map(p => [p.x, p.t, p.kind, p.speed]), [
    [10, 0, "move", null], [10, 1000, "resume", null],
    [11, 1000, "move", null], [12, 1020, "move", 50]
  ]);
});

test("keyboard, touch and pen events do not collect or upload mouse paths", () => {
  const page = setup();
  page.move(0, 20, 20, "touch");
  page.move(1, 20, 20, "pen");
  page.click(2, 20, 20, { pointerType: "touch" });
  page.click(3, 20, 20, { pointerType: "pen" });
  page.click(4, 0, 0, { detail: 0 });
  assert.equal(page.beacons.length, 0);
  const payload = page.click(5, 10, 10, { target: null });
  assert.equal(payload.samples.length, 1);
  assert.equal(payload.click.tagName, null);
  assert.equal(payload.click.href, null);
});

test("rejected, absent and throwing beacons fall back to keepalive JSON fetch", () => {
  for (const options of [{ acceptBeacon: false }, { noBeacon: true }, { throwBeacon: true }]) {
    const page = setup(options);
    const payload = page.click(0, 10, 10);
    assert.equal(page.requests.length, 1);
    assert.equal(page.requests[0].url, "https://www.ghostwireclothing.com/api/interactions");
    assert.equal(page.requests[0].keepalive, true);
    assert.equal(page.requests[0].method, "POST");
    assert.equal(page.requests[0].headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(page.requests[0].body), payload);
  }
});

test("buffers are capped and clicks clear the sent path", async () => {
  const page = setup();
  for (let i = 0; i < 250; i++) page.move(i * 30, i, 0);
  const payload = page.click(7500, 249, 0);
  assert.equal(payload.samples.length, 200);
  assert.equal(payload.droppedSamples, 50);
  assert.ok(page.beacons[0].body.size < 64000);
  assert.equal(page.click(7501, 249, 0).samples.length, 0);
});

test("pagehide clears pending data; pageshow restarts without duplicate handlers", () => {
  const page = setup();
  page.move(0, 10, 10);
  page.move(10, 11, 10);
  page.window.emit("pagehide");
  assert.equal(page.timers.size, 0);
  assert.equal(page.window.mouseTrackingResult, null);
  page.click(40, 11, 10);
  assert.equal(page.beacons.length, 0);
  page.window.emit("pageshow");
  page.window.emit("pageshow");
  const payload = page.click(50, 20, 20);
  assert.equal(payload.samples.length, 1);
  assert.equal(payload.samples[0].t, 10);
  assert.equal(page.beacons.length, 1);
});

test("blur, resize and hidden visibility discard stale paths", () => {
  for (const reason of ["blur", "resize", "hidden"]) {
    const page = setup();
    page.move(0, 10, 10);
    page.move(10, 11, 10);
    if (reason === "hidden") {
      page.document.visibilityState = "hidden";
      page.document.emit("visibilitychange");
    } else page.window.emit(reason);
    const payload = page.click(20, 12, 10);
    assert.equal(payload.samples.length, 1);
    assert.equal(payload.samples[0].x, 12);
  }
});