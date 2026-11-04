(function () {
  "use strict";

  const endpoint = "https://www.ghostwireclothing.com/api/interactions";
  const sampleInterval = 30;
  const maxSamples = 200;
  let active = false;
  let startedAt;
  let samples;
  let droppedSamples;
  let lastPosition;
  let pending;
  let timer;
  window.mouseTrackingResult = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (pending) {
      append(pending);
      pending = null;
    }
  }

  function append(point) {
    const previous = samples[samples.length - 1];
    const dt = previous ? point.t - previous.t : 0;
    // Never estimate speed across an idle gap or a resume anchor.
    point.speed = previous && dt > 0 && point.kind !== "resume" && previous.kind !== "resume" ?
      Math.hypot(point.x - previous.x, point.y - previous.y) * 1000 / dt : null;
    samples.push(point);
    if (samples.length > maxSamples) {
      samples.shift();
      droppedSamples += 1;
    }
  }

  function position(x, y) {
    if (lastPosition && x === lastPosition.x && y === lastPosition.y) return;
    const point = { x, y, t: performance.now() - startedAt, kind: "move" };
    if (lastPosition && point.t - lastPosition.t > sampleInterval) {
      flush();
      append({ x: lastPosition.x, y: lastPosition.y, t: point.t, kind: "resume" });
      append(point);
    } else {
      const previous = samples[samples.length - 1];
      if (!previous || point.t - previous.t >= sampleInterval) {
        flush();
        append(point);
      } else {
        pending = point;
        if (timer == null) timer = setTimeout(flush, sampleInterval - (point.t - previous.t));
      }
    }
    lastPosition = { x, y, t: point.t };
  }

  function upload(payload) {
    const json = JSON.stringify(payload);
    try {
      if (typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon(endpoint, new Blob([json], { type: "application/json" }))) return;
    } catch (error) {
      // Unsupported or rejected beacons still get a keepalive attempt.
    }
    try {
      Promise.resolve(fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true
      })).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
      }).catch(function (error) {
        console.warn("[MouseTracking] Upload failed:", error);
      });
    } catch (error) {
      console.warn("[MouseTracking] Upload failed:", error);
    }
  }

  function onMove(event) {
    if (active && event.pointerType === "mouse") position(event.clientX, event.clientY);
  }

  function onClick(event) {
    // Keyboard activation has detail=0; touch/pen clicks are not mouse paths.
    if (!active || event.detail === 0 || (event.pointerType && event.pointerType !== "mouse")) return;
    position(event.clientX, event.clientY);
    flush();
    const target = event.target instanceof Element ? event.target : null;
    const link = target && target.closest("a[href], area[href]");
    const payload = {
      type: "mouse_tracking",
      version: 1,
      timestamp: new Date().toISOString(),
      thumbmark: window.thumbmarkResult?.thumbmark || null,
      coordinateSpace: "viewport_css_pixels",
      speedUnit: "css_pixels_per_second",
      sampleIntervalMs: sampleInterval,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      click: {
        x: event.clientX,
        y: event.clientY,
        t: performance.now() - startedAt,
        button: event.button,
        tagName: target ? target.tagName.toLowerCase() : null,
        // Resolve links even when a nested image/span was clicked. Bound payload size.
        href: link ? link.href.slice(0, 2048) : null
      },
      samples: samples.slice(),
      droppedSamples
    };
    window.mouseTrackingResult = payload;
    upload(payload);
    samples = [];
    droppedSamples = 0;
  }

  function reset() {
    clearTimeout(timer);
    timer = null;
    samples = [];
    droppedSamples = 0;
    lastPosition = null;
    pending = null;
  }

  function start() {
    if (active) return;
    reset();
    startedAt = performance.now();
    window.mouseTrackingResult = null;
    active = true;
  }

  document.addEventListener("pointermove", onMove, { passive: true, capture: true });
  document.addEventListener("click", onClick, { capture: true });
  // Avoid joining paths across focus changes or different viewport dimensions.
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") reset();
  });
  window.addEventListener("pageshow", start);
  window.addEventListener("pagehide", function () {
    active = false;
    reset();
    window.mouseTrackingResult = null;
  });
  start();
})();