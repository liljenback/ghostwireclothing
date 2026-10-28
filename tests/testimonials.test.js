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
const render = Handlebars.compile(read("src/_includes/testimonial_cards.hbs"));
const chrome = process.env.CHROME_BIN || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
].find((file) => fs.existsSync(file));

test("homepage and testimonial page render the same cards with working product destinations", () => {
  const sections = ["public/index.html", "public/testimonial.html"].map((file) => {
    const html = read(file);
    assert.doesNotMatch(html, /Anna Trevor|laser pointer|carouselExample3Controls/);
    const section = html.match(/<section class="testimonials-section[\s\S]*?<\/section>/);
    assert.ok(section, file);
    for (const [, url] of section[0].matchAll(/href="([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(root, "public", url)), url);
    }
    return section[0].replace(/>\s+</g, "><");
  });
  assert.equal(sections[0], sections[1]);
});

test("review rendering escapes content and distinguishes filled and empty rating stars", () => {
  const html = render({ testimonialFixtures: [{
    name: "<Customer>", initials: "<C>", rating: 4, title: "<Title>",
    quote: '<img src=x onerror="alert(1)">', productName: "<Product>",
    productUrl: "/products/001.html", stars: [true, true, true, true, false],
  }] });
  assert.match(html, /&lt;Customer&gt;/);
  assert.match(html, /&lt;img src/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /aria-label="4 out of 5 stars"/);
  assert.equal((html.match(/class="testimonial-star-empty"/g) || []).length, 1);
});

for (const width of [390, 1280]) {
  test(`review cards remain readable and responsive at ${width}px`, {
    skip: !chrome && "Chrome/Chromium unavailable; set CHROME_BIN"
  }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ghostwire-testimonials-"));
    try {
      const file = path.join(directory, "reviews.html");
      const html = read("public/testimonial.html").match(/<section class="testimonials-section[\s\S]*?<\/section>/)[0];
      const styles = (read("public/css/bootstrap.css") + read("public/css/style.css"))
        .replace(/^@import[^;]+;/gm, "");
      fs.writeFileSync(file, `<!doctype html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style>
        </head><body>${html}<pre id="result">PENDING</pre><script>
        try {
          const cards = Array.from(document.querySelectorAll(".testimonial-card"));
          const boxes = cards.map(card => card.getBoundingClientRect());
          if (boxes.length !== 3) throw new Error("Missing cards");
          if (document.documentElement.scrollWidth > window.innerWidth) throw new Error("Horizontal overflow");
          for (const card of cards) {
            if (card.scrollWidth > card.clientWidth) throw new Error("Card content overflows");
            if (!card.querySelector(".testimonial-rating").getAttribute("aria-label")) throw new Error("Missing accessible rating");
          }
          if (window.innerWidth >= 768) {
            if (!boxes.every(box => Math.abs(box.top - boxes[0].top) < 1)) throw new Error("Desktop cards must share a row");
            if (!boxes.every(box => Math.abs(box.height - boxes[0].height) < 1)) throw new Error("Desktop card heights differ");
          } else if (!(boxes[1].top > boxes[0].bottom && boxes[2].top > boxes[1].bottom)) {
            throw new Error("Mobile cards must stack with spacing");
          }
          document.getElementById("result").textContent = "PASS";
        } catch (error) { document.getElementById("result").textContent = "FAIL: " + error.message; }
        </script></body></html>`);
      const result = spawnSync(chrome, [
        "--headless", "--disable-background-networking", "--disable-component-update",
        "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check",
        "--user-data-dir=" + path.join(directory, "profile"), `--window-size=${width},844`,
        "--dump-dom", pathToFileURL(file).href
      ], { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      const output = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
      assert.equal(output && output[1], "PASS", output ? output[1] : result.stdout);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
