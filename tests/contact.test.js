const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const Handlebars = require("handlebars");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const markup = Handlebars.compile(read("src/contact.hbs").replace(/^---[\s\S]*?---\s*/, ""))({})
  .replace('<script src="/js/contact.js" defer></script>', "");
const styles = (read("public/css/bootstrap.css") + read("public/css/style.css"))
  .replace(/^@import[^;]+;/gm, "");
const chrome = process.env.CHROME_BIN || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"
].find((file) => fs.existsSync(file));
const browserOptions = { skip: !chrome && "Chrome/Chromium unavailable; set CHROME_BIN" };

function runBrowser(check, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ghostwire-contact-"));
  try {
    const file = path.join(directory, "contact.html");
    fs.writeFileSync(file, `<!doctype html><html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head>
      <body>${markup}<pre id="browser-result">PENDING</pre>
      <script>
        const requests = [];
        let response = { status: 201, ok: true, json: async () => ({
          success: true, ticketId: "GW-1792617810219-test-reference", status: "received"
        }) };
        window.fetch = async (url, options) => {
          requests.push({ url, options, body: JSON.parse(options.body) });
          return response;
        };
        ${options.noScript ? "" : read("public/js/contact.js")}
        const form = document.querySelector("[data-contact-form]");
        const summary = form.querySelector("#contact-error-summary");
        const result = form.querySelector("#contact-result");
        const groups = Array.from(form.querySelectorAll("[data-contact-types]"));
        function expect(condition, message) {
          if (!condition) throw new Error(message);
        }
        function equal(actual, expected, message) {
          expect(JSON.stringify(actual) === JSON.stringify(expected),
            message + ": " + JSON.stringify(actual));
        }
        function field(name) { return form.elements.namedItem(name); }
        function set(name, value) {
          field(name).value = value;
          field(name).dispatchEvent(new Event("input", { bubbles: true }));
          field(name).dispatchEvent(new Event("change", { bubbles: true }));
        }
        function fill(type, extra = {}) {
          set("name", "Test User");
          set("email", "test@example.com");
          set("inquiryType", type);
          set("message", "I need a larger size.");
          Object.entries(extra).forEach(([name, value]) => set(name, value));
        }
        function submit() {
          const event = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
          expect(event.defaultPrevented, "Submission must not navigate away");
        }
        async function settled() {
          for (let attempt = 0; attempt < 30 && form.getAttribute("aria-busy") === "true"; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          expect(form.getAttribute("aria-busy") !== "true", "Submission should finish");
        }
        (async () => {
          try {
            await (${check.toString()})();
            document.getElementById("browser-result").textContent = "PASS";
          } catch (error) {
            document.getElementById("browser-result").textContent = "FAIL: " + error.stack;
          }
        })();
      </script></body></html>`);
    const execution = spawnSync(chrome, [
      "--headless",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=" + path.join(directory, "profile"),
      "--window-size=390,844",
      "--virtual-time-budget=15000",
      "--dump-dom",
      pathToFileURL(file).href
    ], { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.ifError(execution.error);
    assert.equal(execution.status, 0, execution.stderr);
    const output = execution.stdout.match(/<pre id="browser-result">([\s\S]*?)<\/pre>/);
    assert.equal(output && output[1], "PASS", output ? output[1] : execution.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("browser submits all five inquiry types as JSON and shows the returned reference", browserOptions, () => {
  runBrowser(async function () {
    const variants = {
      order_issue: { orderNumber: "GW-1024", issueType: "damaged_item" },
      product_feedback: { productName: "Classic Shirt", rating: 5 },
      return_exchange: { orderNumber: "GW-1024", returnReason: "wrong_size", preferredResolution: "exchange" },
      collaboration: { socialHandle: "@test", collaborationType: "wholesale" },
      general_inquiry: {}
    };
    for (const [type, extra] of Object.entries(variants)) {
      fill(type, extra);
      const active = Array.from(form.querySelectorAll("[name]")).filter(control => !control.matches(":disabled"));
      active.forEach(control => {
        expect(control.required, control.name + " should be required");
        expect(control.labels.length === 1 && control.labels[0].textContent.includes("*"), "Required field needs a visible label");
        expect(control.getClientRects().length > 0, "Active fields must be visible");
      });
      submit();
      await settled();
      const request = requests[requests.length - 1];
      expect(form.getAttribute("action") === "/api/contact", "Use a same-origin API path");
      expect(request.url === new URL("/api/contact", document.baseURI).href, "Resolve the API URL against the page");
      expect(request.options.method === "POST", "Use POST");
      expect(request.options.headers["Content-Type"] === "application/json", "Send JSON");
      equal(request.body, {
        name: "Test User", email: "test@example.com", inquiryType: type,
        ...extra, message: "I need a larger size."
      }, "Only relevant fields should be submitted");
      expect(!result.hidden && result.textContent.includes("GW-1792617810219-test-reference"), "Show server reference");
      expect(document.activeElement === result, "Announce successful submission accessibly");
      expect(field("name").value === "" && field("message").value === "", "Success should clear personal details");
      expect(groups.every(group => group.hidden && group.disabled), "Success should reset conditional fields");
      expect(form.querySelector('[type="submit"]').textContent === "Send message", "Restore button");
    }
    expect(requests.length === 5, "Exactly one request per valid submission");
    expect(document.documentElement.scrollWidth <= window.innerWidth, "Form should fit a narrow viewport");
  });
});

test("browser clears irrelevant fields on inquiry changes and blocks invalid input before fetch", browserOptions, () => {
  runBrowser(async function () {
    fill("order_issue", { orderNumber: "GW-1024", issueType: "wrong_item" });
    set("inquiryType", "return_exchange");
    expect(field("orderNumber").value === "GW-1024", "Keep shared relevant order number");
    expect(field("issueType").value === "" && field("issueType").matches(":disabled"), "Clear inactive order issue");
    set("returnReason", "wrong_size");
    set("preferredResolution", "refund");
    set("inquiryType", "general_inquiry");
    for (const name of ["orderNumber", "issueType", "returnReason", "preferredResolution"]) {
      expect(field(name).value === "" && field(name).matches(":disabled"), name + " must be cleared and disabled");
    }
    expect(field("name").value === "Test User" && field("message").value !== "", "Keep common fields");
    set("inquiryType", "return_exchange");
    submit();
    expect(requests.length === 0, "Missing conditional fields must not reach API");
    expect(field("orderNumber").getAttribute("aria-invalid") === "true", "Mark invalid field");
    expect(document.activeElement === field("orderNumber"), "Focus first invalid field");
    expect(!summary.hidden, "Show validation summary");
    set("orderNumber", "GW-1024");
    set("returnReason", "wrong_size");
    set("preferredResolution", "exchange");
    set("name", "   ");
    set("email", "test@example");
    submit();
    expect(requests.length === 0, "Whitespace name and invalid email must not reach API");
    expect(field("name").getAttribute("aria-invalid") === "true", "Reject whitespace-only strings");
    expect(field("email").getAttribute("aria-invalid") === "true", "Require email domain");
    set("name", "Test User");
    set("email", "test@example.com");
    set("message", "x".repeat(10001));
    submit();
    expect(requests.length === 0, "Overlong messages must not reach API");
    set("message", "Ready");
    submit();
    await settled();
    expect(requests.length === 1 && !result.hidden, "Corrected form can submit");
  });
});

test("browser maps server validation errors, retains details on failures and safely renders references", browserOptions, () => {
  runBrowser(async function () {
    fill("return_exchange", { orderNumber: "GW-1024", returnReason: "wrong_size", preferredResolution: "exchange" });
    response = { status: 400, ok: false, json: async () => ({
      success: false, error: "VALIDATION_ERROR", fields: { orderNumber: "Order number is invalid" }
    }) };
    submit();
    await settled();
    expect(field("orderNumber").getAttribute("aria-invalid") === "true", "Map backend errors");
    expect(document.activeElement === field("orderNumber"), "Focus server-invalid field");
    expect(form.querySelector('[data-error-for="orderNumber"]').textContent === "Order number is invalid", "Display backend error");
    expect(field("message").value !== "", "Keep message on error");
    set("orderNumber", "GW-2048");
    expect(field("orderNumber").getAttribute("aria-invalid") === "false", "Editing clears server error");
    response = { status: 503, ok: false, json: async () => ({ error: "unavailable" }) };
    submit();
    await settled();
    expect(summary.textContent.includes("HTTP 503") && result.hidden, "Surface server failure");
    expect(!form.querySelector("[data-contact-controls]").disabled, "Allow manual retry");
    response = { status: 201, ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } };
    submit();
    await settled();
    expect(summary.textContent.includes("unreadable"), "Do not report success on unreadable response");
    response = { status: 201, ok: true, json: async () => ({ success: false }) };
    submit();
    await settled();
    expect(summary.textContent.includes("did not confirm"), "Require valid receipt");
    expect(field("orderNumber").value === "GW-2048", "Failures preserve entered values");
    response = { status: 201, ok: true, json: async () => ({
      success: true, status: "received", ticketId: '<img src=x onerror="window.injected=true">'
    }) };
    submit();
    await settled();
    expect(!result.hidden && result.textContent.includes("<img"), "Use text for server reference");
    expect(result.querySelector("img") === null && !window.injected, "Never interpret server strings as HTML");
  });
});

test("browser prevents duplicate submits and recovers from network errors and timeouts", browserOptions, () => {
  runBrowser(async function () {
    fill("general_inquiry");
    let finish;
    window.fetch = (url, options) => {
      requests.push({ url, options });
      return new Promise(resolve => { finish = resolve; });
    };
    submit();
    submit();
    expect(requests.length === 1, "Only one request while pending");
    expect(form.getAttribute("aria-busy") === "true", "Announce busy state");
    expect(field("name").matches(":disabled"), "Prevent edits during submission");
    finish(response);
    await settled();
    fill("general_inquiry");
    window.fetch = async () => { throw new TypeError("Failed to fetch"); };
    submit();
    await settled();
    expect(summary.textContent.includes("Unable to connect"), "Show network failure");
    expect(field("name").value === "Test User", "Retain inputs after network failure");
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    submit();
    await new Promise(resolve => setTimeout(resolve, 10010));
    await settled();
    expect(summary.textContent.includes("timed out"), "Show timeout");
    expect(!form.querySelector("[data-contact-controls]").disabled, "Recover after timeout");
    expect(field("name").value === "Test User", "Retain inputs after timeout");
    expect(form.querySelector('[type="submit"]').textContent === "Send message", "Restore send button");
  });
});

test("without JavaScript the form cannot send personal details through native navigation", browserOptions, () => {
  runBrowser(function () {
    expect(form.method === "post", "Never send personal details in query strings");
    expect(form.querySelector("[data-contact-controls]").disabled, "Disable unsupported native submission");
    expect(form.querySelector('[type="submit"]').matches(":disabled"), "No-JavaScript submit is disabled");
    expect(form.querySelector("noscript") === null, "No-script notice is outside the form");
  }, { noScript: true });
});

test("generated contact route and directory alias include the new form and canonical destination", () => {
  assert.match(read("public/contact.html"), /data-contact-form/);
  assert.match(read("public/contact.html"), /action="\/api\/contact" method="post"/);
  assert.match(read("public/contact.html"), /src="\/js\/contact\.js"/);
  assert.doesNotMatch(read("public/contact.html"), /name="subject"|Validation-only demo/);
  assert.match(read("public/contact/index.html"), /http-equiv="refresh" content="0;url=\/contact\.html"/);
  assert.doesNotMatch(read("public/contact/index.html"), /layout:|sed -n/);
});
