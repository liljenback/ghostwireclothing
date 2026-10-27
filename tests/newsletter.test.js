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
const pages = { subscribe: "newsletter", preferences: "email-preferences", unsubscribe: "unsubscribe" };

function runBrowser(action, check, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ghostwire-newsletter-ui-"));
  try {
    const markup = read(`public/${pages[action]}.html`).match(/<body[^>]*>([\s\S]*?)<\/body>/)[1]
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    const file = path.join(directory, "newsletter.html");
    fs.writeFileSync(file, `<!doctype html><html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head>
      <body class="sub_page newsletter-page">${markup}<pre id="browser-result">PENDING</pre>
      <script>
        const action = ${JSON.stringify(action)};
        const requests = [];
        let response = { status: action === "subscribe" ? 201 : 200, ok: true, json: async () => ({
          success: true, simulated: true, status: {
            subscribe: "subscribed", preferences: "preferences_updated", unsubscribe: "unsubscribed"
          }[action]
        }) };
        window.fetch = async (url, options) => {
          requests.push({ url, options, body: JSON.parse(options.body) });
          return response;
        };
        ${options.noScript ? "" : read("public/js/newsletter.js")}
        const form = document.querySelector("[data-newsletter-form]");
        const summary = form.querySelector("#newsletter-error-summary");
        const result = form.querySelector("#newsletter-result");
        function expect(condition, message) { if (!condition) throw new Error(message); }
        function equal(actual, expected, message) {
          expect(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual));
        }
        function field(name) { return form.elements.namedItem(name); }
        function set(name, value) {
          field(name).value = value;
          field(name).dispatchEvent(new Event("input", { bubbles: true }));
          field(name).dispatchEvent(new Event("change", { bubbles: true }));
        }
        function category(value, checked = true) {
          const input = form.querySelector('[name="categories"][value="' + value + '"]');
          input.checked = checked;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        function fill() {
          set("email", " newsletter@example.com ");
          if (action === "unsubscribe") set("reason", "too_many_emails");
          else { category("offers"); set("frequency", "monthly"); }
        }
        function submit() {
          const event = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
          expect(event.defaultPrevented, "Must not navigate");
        }
        async function settled() {
          for (let attempt = 0; attempt < 30 && form.getAttribute("aria-busy") === "true"; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          expect(form.getAttribute("aria-busy") !== "true", "Submission must finish");
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
      "--headless", "--disable-background-networking", "--disable-component-update",
      "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check",
      "--user-data-dir=" + path.join(directory, "profile"), "--window-size=390,844",
      "--virtual-time-budget=15000", "--dump-dom", pathToFileURL(file).href
    ], { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.ifError(execution.error);
    assert.equal(execution.status, 0, execution.stderr);
    const output = execution.stdout.match(/<pre id="browser-result">([\s\S]*?)<\/pre>/);
    assert.equal(output && output[1], "PASS", output ? output[1] : execution.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const action of ["subscribe", "preferences"]) {
  test(`browser ${action} submits selected types and reduced frequency with a demo confirmation`, browserOptions, () => {
    runBrowser(action, async function () {
      fill();
      category("promotions");
      category("new_collections");
      submit();
      await settled();
      expect(requests.length === 1, "Exactly one request");
      equal(requests[0].body, {
        action, email: "newsletter@example.com",
        categories: ["promotions", "new_collections", "offers"], frequency: "monthly"
      }, "Use backend contract");
      expect(requests[0].url === new URL("/api/newsletter", document.baseURI).href, "Use same-origin API");
      expect(requests[0].options.method === "POST", "Use POST");
      expect(requests[0].options.headers["Content-Type"] === "application/json", "Send JSON");
      expect(!result.hidden && result.textContent.includes("Demo"), "Explicitly simulated");
      expect(result.textContent.includes("not saved") || result.textContent.includes("No subscription was saved"), "Never imply persistence");
      expect(document.activeElement === result, "Focus confirmation");
      expect(field("email").value === "", "Clear email after success");
      expect(!form.querySelector('[name="categories"]:checked'), "Clear previous choices after success");
      expect(document.querySelectorAll(".footer_section > .container > .row > .footer-col").length === 3, "Three sibling footer columns");
      expect(document.documentElement.scrollWidth <= window.innerWidth, "Fits mobile: " + JSON.stringify(
        Array.from(document.querySelectorAll("*")).filter(element => element.getBoundingClientRect().right > window.innerWidth)
          .slice(0, 5).map(element => [element.tagName, element.className, element.getBoundingClientRect().right])
      ));
      fill();
      category("offers", false);
      set("email", "invalid");
      submit();
      expect(requests.length === 1, "Invalid email and empty categories block fetch");
      expect(field("email").getAttribute("aria-invalid") === "true", "Mark email error");
      expect(document.activeElement === field("email"), "Focus first error");
      expect(!form.querySelector('[data-error-for="categories"]').hidden, "Explain required categories");
      set("email", "new@example.com");
      category("new_collections");
      set("frequency", "weekly");
      submit();
      await settled();
      equal(requests[1].body.categories, ["new_collections"], "Only selected type is sent");
      expect(requests[1].body.frequency === "weekly", "Weekly also supported");
    });
  });
}

test("browser unsubscribe supports each reason and requires other text only when relevant", browserOptions, () => {
  runBrowser("unsubscribe", async function () {
    for (const reason of ["too_many_emails", "irrelevant_content", "no_longer_interested", "other"]) {
      fill();
      set("reason", reason);
      if (reason === "other") {
        const previousRequests = requests.length;
        submit();
        expect(requests.length === previousRequests, "Require other description");
        expect(document.activeElement === field("otherReason"), "Focus missing description");
        set("otherReason", " Different needs ");
      }
      submit();
      await settled();
      equal(requests[requests.length - 1].body, {
        action: "unsubscribe", email: "newsletter@example.com", reason,
        ...(reason === "other" ? { otherReason: "Different needs" } : {})
      }, "Only relevant fields");
      expect(!result.hidden && result.textContent.includes("No real mailing list"), "Do not claim real unsubscription");
      expect(form.querySelector("[data-newsletter-other]").hidden, "Reset other field");
    }
    fill();
    set("reason", "other");
    set("otherReason", "x".repeat(1001));
    submit();
    expect(requests.length === 4, "Overlong reason rejected");
    set("reason", "too_many_emails");
    expect(field("otherReason").value === "" && field("otherReason").matches(":disabled"), "Clear and disable irrelevant reason");
    submit();
    await settled();
    expect(!Object.hasOwn(requests[4].body, "otherReason"), "Never send stale reason");
    expect(document.documentElement.scrollWidth <= window.innerWidth, "Fits mobile: " + JSON.stringify(
      Array.from(document.querySelectorAll("*")).filter(element => element.getBoundingClientRect().right > window.innerWidth)
        .slice(0, 5).map(element => [element.tagName, element.className, element.getBoundingClientRect().right])
    ));
  });
});

test("browser exposes validation and HTTP errors, retains inputs and rejects misleading confirmations", browserOptions, () => {
  runBrowser("preferences", async function () {
    fill();
    response = { status: 400, ok: false, json: async () => ({
      success: false, error: "VALIDATION_ERROR", fields: { categories: "Choose an email type" }
    }) };
    submit();
    await settled();
    expect(!summary.hidden && result.hidden, "Show error only");
    expect(document.activeElement.name === "categories", "Focus server-invalid category");
    expect(field("email").value === "newsletter@example.com", "Retain email on error");
    const cases = [
      { response: { status: 503, ok: false, json: async () => ({}) }, text: "HTTP 503" },
      { response: { status: 200, ok: true, json: async () => { throw new Error("JSON"); } }, text: "unreadable" },
      { response: { status: 200, ok: true, json: async () => ({ success: true, status: "preferences_updated" }) }, text: "did not confirm" },
      { response: { status: 200, ok: true, json: async () => ({ success: true, simulated: true, status: "unsubscribed" }) }, text: "did not confirm" }
    ];
    for (const item of cases) {
      response = item.response;
      submit();
      await settled();
      expect(summary.textContent.includes(item.text) && result.hidden, "No false success: " + item.text);
      expect(field("email").value === "newsletter@example.com", "Failures retain input");
      expect(!form.querySelector("[data-newsletter-controls]").disabled, "Allow retry");
    }
    response = { status: 400, ok: false, json: async () => ({
      error: "VALIDATION_ERROR", fields: { body: '<img src=x onerror="window.injected=true">' }
    }) };
    submit();
    await settled();
    expect(summary.textContent.includes("<img") && !summary.querySelector("img") && !window.injected, "Errors are text, not markup");
    expect(document.activeElement === summary, "Unknown field errors focus summary");
  });
});

test("browser prevents duplicate requests and recovers from network failure and timeout", browserOptions, () => {
  runBrowser("subscribe", async function () {
    fill();
    let finish;
    window.fetch = (url, options) => {
      requests.push({ url, options });
      return new Promise(resolve => { finish = resolve; });
    };
    submit();
    submit();
    expect(requests.length === 1, "No duplicate submit");
    expect(field("email").matches(":disabled") && form.getAttribute("aria-busy") === "true", "Disable while pending");
    finish(response);
    await settled();
    fill();
    window.fetch = async () => { throw new TypeError("Failed to fetch"); };
    submit();
    await settled();
    expect(summary.textContent.includes("Unable to connect"), "Network error");
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    submit();
    await new Promise(resolve => setTimeout(resolve, 10010));
    await settled();
    expect(summary.textContent.includes("timed out") && result.hidden, "Timeout error");
    expect(field("email").value === "newsletter@example.com" && !field("email").matches(":disabled"), "Recover without losing input");
    expect(form.querySelector('[type="submit"]').textContent === "Subscribe", "Restore button label");
  });
});

test("without JavaScript no native submission can leak emails or reasons into navigation", browserOptions, () => {
  runBrowser("unsubscribe", function () {
    expect(form.method === "post", "No query-string submission");
    expect(form.querySelector('[type="submit"]').matches(":disabled"), "Disable without JavaScript");
  }, { noScript: true });
});

test("generated pages expose subscribe, preferences and all unsubscribe alternatives", () => {
  for (const page of Object.values(pages)) {
    const html = read(`public/${page}.html`);
    assert.match(html, /action="\/api\/newsletter" method="post"/);
    assert.match(html, /src="\/js\/newsletter\.js"/);
    assert.match(html, /Demo only/);
  }
  const unsubscribe = read("public/unsubscribe.html");
  assert.match(unsubscribe, /href="\/email-preferences\.html#frequency"/);
  assert.match(unsubscribe, /href="\/email-preferences\.html"/);
  for (const reason of ["too_many_emails", "irrelevant_content", "no_longer_interested", "other"]) {
    assert.ok(unsubscribe.includes(`value="${reason}"`));
  }
  assert.match(read("public/index.html"), /href="\/newsletter\.html"/);
  assert.doesNotMatch(read("public/index.html"), /form action=""/);
});
