const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const styles = (read("public/css/bootstrap.css") + read("public/css/style.css"))
  .replace(/^@import[^;]+;/gm, "");
const chrome = process.env.CHROME_BIN || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
].find((file) => fs.existsSync(file));
const browserOptions = { skip: !chrome && "Chrome/Chromium unavailable; set CHROME_BIN" };

function runBrowser(check, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ghostwire-consultation-ui-"));
  try {
    const markup = read("public/fashion-consultation.html").match(/<body[^>]*>([\s\S]*?)<\/body>/)[1]
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    const file = path.join(directory, "consultation.html");
    fs.writeFileSync(file, `<!doctype html><html lang="en"><head>
      <meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head>
      <body class="sub_page consultation-page">${markup}<pre id="browser-result">PENDING</pre><script>
        ${options.now ? `const NativeDate = Date; window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [${JSON.stringify(options.now)}])); }
          static now() { return new NativeDate(${JSON.stringify(options.now)}).getTime(); }
        };` : ""}
        const requests = [];
        let response = { status: 201, ok: true, json: async () => ({
          success: true, status: "request_received", durationMinutes: 20,
          ticketId: "GW-1793000000000-12345678-1234-4234-8234-123456789012"
        }) };
        window.fetch = async (url, options) => {
          requests.push({ url, options, body: JSON.parse(options.body) });
          return response;
        };
        ${options.noScript ? "" : read("public/js/fashion-consultation.js")}
        const form = document.querySelector("[data-consultation-form]");
        const summary = form.querySelector("#consultation-error-summary");
        const result = form.querySelector("#consultation-result");
        function expect(condition, message) { if (!condition) throw new Error(message); }
        function field(name) { return form.elements.namedItem(name); }
        function set(name, value) {
          field(name).value = value;
          field(name).dispatchEvent(new Event("input", { bubbles: true }));
          field(name).dispatchEvent(new Event("change", { bubbles: true }));
        }
        async function waitFor(check) {
          for (let i = 0; i < 100; i++) {
            if (check()) return;
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          throw new Error("Browser state did not settle");
        }
        function fill() {
          set("timezone", "UTC");
          set("date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
          set("time", "10:20");
          set("name", " Style Visitor ");
          set("email", " visitor@example.com ");
          set("reason", " Help choosing an outfit for an event. ");
        }
        function submit() { form.querySelector('[type="submit"]').click(); }
        async function settled() { await waitFor(() => form.getAttribute("aria-busy") !== "true"); }
        (async () => {
          try { await (${check.toString()})(); document.getElementById("browser-result").textContent = "PASS"; }
          catch (error) { document.getElementById("browser-result").textContent = "FAIL: " + error.stack; }
        })();
      </script></body></html>`);
    const execution = spawnSync(chrome, [
      "--headless", "--disable-background-networking", "--disable-component-update",
      "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check",
      "--user-data-dir=" + path.join(directory, "profile"), "--window-size=" + (options.width || 390) + ",844",
      "--virtual-time-budget=20000", "--dump-dom", pathToFileURL(file).href
    ], { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.ifError(execution.error);
    assert.equal(execution.status, 0, execution.stderr);
    const output = execution.stdout.match(/<pre id="browser-result">([\s\S]*?)<\/pre>/);
    assert.equal(output && output[1], "PASS", output ? output[1] : execution.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const width of [390, 1280]) {
  test(`consultation page is accessible and submits a request, not a booking, at ${width}px`, browserOptions, () => {
    runBrowser(async function () {
      for (const control of form.querySelectorAll("[name]")) {
        expect(control.labels.length === 1 && control.required, "Labeled required control: " + control.name);
      }
      expect(field("date").type === "date", "Native interactive calendar");
      expect(field("time").options.length === 25, "24 predefined 20-minute slots and a prompt");
      fill();
      set("timezone", "America/Denver");
      const requestedDate = field("date").value;
      submit();
      await settled();
      expect(requests.length === 1, "Exactly one JSON request");
      expect(requests[0].url === new URL("/api/fashion-consultation", document.baseURI).href, "Same-origin API");
      expect(requests[0].options.method === "POST" && requests[0].options.headers["Content-Type"] === "application/json", "POST JSON");
      expect(JSON.stringify(requests[0].body) === JSON.stringify({
        timezone: "America/Denver", date: requestedDate, time: "10:20", name: "Style Visitor",
        email: "visitor@example.com", reason: "Help choosing an outfit for an event."
      }), "Backend contract without unrelated fields");
      expect(!result.hidden && result.textContent.includes("Your consultation request has been received"), "Acknowledge the request");
      expect(!/confirmed booking|Reference:|GW-/.test(result.textContent), "No guaranteed booking or technical receipt text");
      const preferredTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC", dateStyle: "full", timeStyle: "short"
      }).format(new Date(requestedDate + "T10:20:00Z"));
      expect(result.textContent.includes(preferredTime + " (America/Denver)"), "Readable date/time without timezone shifting");
      expect(document.activeElement === result, "Focus confirmation");
      expect(field("name").value === "" && field("email").value === "", "Clear personal details on success");
      expect(document.documentElement.scrollWidth <= window.innerWidth, "No horizontal page overflow");
      const bounds = form.getBoundingClientRect();
      for (const control of form.querySelectorAll("[name]")) {
        const box = control.getBoundingClientRect();
        expect(box.left >= bounds.left - 1 && box.right <= bounds.right + 1, "Controls stay within the form");
      }
    }, { width });
  });
}

test("required fields, invalid email, past dates and timezone boundaries prevent invalid requests", browserOptions, () => {
  runBrowser(async function () {
    submit();
    expect(requests.length === 0 && document.activeElement === field("date"), "Focus missing date");
    fill();
    set("email", "invalid");
    set("reason", " ");
    submit();
    expect(requests.length === 0 && field("email").getAttribute("aria-invalid") === "true", "Reject invalid details");
    fill();
    set("date", "2020-01-01");
    submit();
    expect(requests.length === 0 && document.activeElement === field("date"), "Reject past date");
    set("timezone", "UTC");
    set("date", "2026-10-28");
    expect(Array.from(field("time").options).filter(option => option.value).every(option => option.disabled), "Past slots are disabled");
    set("timezone", "Asia/Tokyo");
    expect(field("date").min === "2026-10-29", "Timezone changes calendar day");
    set("date", "2026-10-29");
    expect(!field("time").querySelector('[value="09:00"]').disabled, "Future timezone-local slot is enabled");
  }, { now: "2026-10-28T23:50:00Z" });
});

test("field, HTTP and unreadable responses retain inputs and never produce false success", browserOptions, () => {
  runBrowser(async function () {
    fill();
    response = { status: 400, ok: false, json: async () => ({
      error: "VALIDATION_ERROR", fields: { reason: "Please describe your consultation" }
    }) };
    submit();
    await settled();
    expect(document.activeElement === field("reason"), "Focus server-invalid field");
    expect(field("email").value === "visitor@example.com" && result.hidden, "Retain inputs for retry");
    const cases = [
      { response: { status: 503, ok: false, json: async () => ({}) }, text: "HTTP 503" },
      { response: { status: 201, ok: true, json: async () => { throw new Error("JSON"); } }, text: "unreadable" },
      { response: { status: 201, ok: true, json: async () => ({ success: true, status: "booked" }) }, text: "did not confirm" }
    ];
    for (const item of cases) {
      response = item.response;
      submit();
      await settled();
      expect(!summary.hidden && summary.textContent.includes(item.text) && result.hidden, "No false success: " + item.text);
      expect(field("email").value === "visitor@example.com" && !field("email").matches(":disabled"), "Allow retry without losing input");
    }
    response = { status: 400, ok: false, json: async () => ({
      error: "VALIDATION_ERROR", fields: { body: '<img src=x onerror="window.injected=true">' }
    }) };
    submit();
    await settled();
    expect(summary.textContent.includes("<img") && !summary.querySelector("img") && !window.injected, "Server errors render as text");
    expect(document.activeElement === summary, "Unknown field errors focus summary");
  });
});

test("duplicate submissions are blocked and network failures and timeouts allow recovery", browserOptions, () => {
  runBrowser(async function () {
    fill();
    let finish;
    window.fetch = (url, options) => {
      requests.push({ url, options });
      return new Promise(resolve => { finish = resolve; });
    };
    submit();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(requests.length === 1 && field("name").matches(":disabled"), "One pending request");
    finish(response);
    await settled();
    fill();
    window.fetch = async () => { throw new TypeError("Failed to fetch"); };
    submit();
    await settled();
    expect(summary.textContent.includes("Unable to connect") && result.hidden, "Explain network error");
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    submit();
    await new Promise(resolve => setTimeout(resolve, 10010));
    await settled();
    expect(summary.textContent.includes("timed out") && result.hidden, "Explain uncertain timeout without booking confirmation");
    expect(field("email").value === "visitor@example.com" && !field("email").matches(":disabled"), "Recover without losing input");
  });
});

test("home, product and footer links lead to the dedicated route; no-JavaScript submission stays disabled", browserOptions, () => {
  for (const page of ["public/index.html", "public/products/001.html"]) {
    const html = read(page);
    assert.match(html, /Schedule a Free Call/);
    assert.match(html, /href="\/fashion-consultation\.html">Schedule a Free Call<\/a>/);
    assert.doesNotMatch(html, /fashion-consultation-dialog|data-consultation-form/);
  }
  const page = read("public/fashion-consultation.html");
  assert.match(page, /action="\/api\/fashion-consultation" method="post"/);
  assert.match(page, /src="\/js\/fashion-consultation\.js"/);
  assert.match(page, /Preferred times are subject to availability/);
  assert.match(read("public/contact.html"), /href="\/fashion-consultation\.html">Schedule a free call<\/a>/);
  runBrowser(function () {
    expect(form.method === "post", "No personal details in query strings");
    expect(form.querySelector('[type="submit"]').matches(":disabled"), "No native submission without JavaScript");
  }, { noScript: true });
});
