const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chrome = process.env.CHROME_BIN || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
].find((file) => fs.existsSync(file));

for (const width of [390, 1280]) {
  test(`homepage actions stay compact and usable at ${width}px`, {
    skip: !chrome && "Chrome/Chromium unavailable; set CHROME_BIN"
  }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ghostwire-homepage-support-"));
    try {
      const html = read("public/index.html");
      const section = html.match(/<section class="shopping-support"[\s\S]*?<\/section>/);
      assert.ok(section);
      assert.doesNotMatch(section[0], /Manage preferences|Unsubscribe|<form\b/);
      for (const [, url] of section[0].matchAll(/href="([^"]+)"/g)) {
        assert.ok(fs.existsSync(path.join(root, "public", url)), url);
      }
      const styles = (read("public/css/bootstrap.css") + read("public/css/style.css"))
        .replace(/^@import[^;]+;/gm, "");
      const file = path.join(directory, "support.html");
      fs.writeFileSync(file, `<!doctype html><html lang="en"><head>
        <meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style>
        </head><body>${section[0]}<pre id="result">PENDING</pre><script>
        try {
          const section = document.querySelector(".shopping-support");
          const cards = Array.from(section.querySelectorAll(".shopping-support-card"));
          const boxes = cards.map(card => card.getBoundingClientRect());
          if (boxes.length !== 2) throw new Error("Missing homepage action");
          if (document.documentElement.scrollWidth > window.innerWidth) throw new Error("Horizontal overflow");
          for (const card of cards) {
            const link = card.querySelector("a");
            if (link.getBoundingClientRect().right > card.getBoundingClientRect().right) throw new Error("Action overflows card");
          }
          if (window.innerWidth >= 768) {
            if (Math.abs(boxes[0].top - boxes[1].top) > 1) throw new Error("Desktop cards must share one row");
            if (section.getBoundingClientRect().height > 300) throw new Error("Desktop section is too tall");
          } else {
            if (boxes[1].top <= boxes[0].bottom) throw new Error("Mobile cards must stack with a gap");
            if (section.getBoundingClientRect().height > 550) throw new Error("Mobile section is too tall");
          }
          document.getElementById("result").textContent = "PASS";
        } catch (error) { document.getElementById("result").textContent = "FAIL: " + error.message; }
        </script></body></html>`);
      const execution = spawnSync(chrome, [
        "--headless", "--disable-background-networking", "--disable-component-update",
        "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check",
        "--user-data-dir=" + path.join(directory, "profile"), `--window-size=${width},844`,
        "--dump-dom", pathToFileURL(file).href
      ], { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
      assert.ifError(execution.error);
      assert.equal(execution.status, 0, execution.stderr);
      const result = execution.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
      assert.equal(result && result[1], "PASS", result ? result[1] : execution.stdout);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
