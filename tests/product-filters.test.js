const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const Handlebars = require("handlebars");
const sass = require("sass");
const products = require("../src/products");
const categories = require("../src/_data/categories");
const categoryData = require("../src/category-pages.11tydata");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const styles = read("public/css/bootstrap.css") +
  sass.compile(path.join(root, "src/style.scss")).css.replace(/^@import[^;]+;/gm, "");
Handlebars.registerPartial("product_cards", read("src/_includes/product_cards.hbs"));
Handlebars.registerHelper("eq", (left, right) => left === right);
const render = (file, data) =>
  Handlebars.compile(read(file).replace(/^---[\s\S]*?---\s*/, ""))(data);
const allCategory = categories.find((category) => category.tag === "all");
const renderCategory = (cat) => render("src/category-pages.hbs", {
  cat, categories, productFilters: categoryData.eleventyComputed.productFilters({ cat })
});
const chrome = process.env.CHROME_BIN || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"
].find((file) => fs.existsSync(file));
const browserOptions = { skip: !chrome && "Chrome/Chromium unavailable; set CHROME_BIN" };

function runBrowser(markup, digitalData, check) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ghostwire-product-filters-"));
  try {
    const file = path.join(directory, "catalog.html");
    fs.writeFileSync(file, `<!doctype html><html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head>
      <body>
      ${markup}
      <pre id="browser-result">PENDING</pre>
      <script>
        window.digitalData = ${JSON.stringify(digitalData)};
        ${read("public/js/custom.js")}
        ${read("public/js/product-filters.js")}
        try {
          const catalog = document.querySelector("[data-product-catalog]");
          const form = catalog && catalog.querySelector("form");
          function expect(condition, message) {
            if (!condition) throw new Error(message);
          }
          function equal(actual, expected, message) {
            expect(JSON.stringify(actual) === JSON.stringify(expected),
              message + ": " + JSON.stringify(actual));
          }
          function filter(name, value) {
            const control = form.elements.namedItem(name);
            control.value = value;
            control.dispatchEvent(new Event("input", { bubbles: true }));
          }
          function visibleCards() {
            return Array.from(catalog.querySelectorAll("[data-product-card]"))
              .filter(card => !card.hidden);
          }
          function visibleIds() {
            const products = window.digitalData.products;
            return visibleCards().map(card =>
              products[card.querySelector(".addToCart").dataset.productIndex].id);
          }
          function reset() {
            form.querySelector("[data-product-reset]").click();
          }
          (${check.toString()})();
          document.getElementById("browser-result").textContent = "PASS";
        } catch (error) {
          document.getElementById("browser-result").textContent = "FAIL: " + error.stack;
        }
      </script>
    </body></html>`);
    const result = spawnSync(chrome, [
      "--headless",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=" + path.join(directory, "profile"),
      "--dump-dom",
      pathToFileURL(file).href
    ], { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout.match(/<pre id="browser-result">([\s\S]*?)<\/pre>/);
    assert.equal(output && output[1], "PASS", output ? output[1] : result.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("only All Products has search/filter controls and keeps its no-JavaScript product cards", () => {
  const directory = render("src/product.hbs", { products, categories });
  assert.match(directory, /<h2>Product Categories<\/h2>/);
  assert.doesNotMatch(directory, /data-product-catalog|data-product-filters/);
  for (const category of categories.filter((category) => category.tag !== "all")) {
    assert.doesNotMatch(renderCategory(category), /data-product-catalog|data-product-filters/);
  }
  const html = renderCategory(allCategory);
  assert.match(html, /data-product-filters[^>]* hidden/);
  assert.equal((html.match(/data-product-catalog/g) || []).length, 1);
  assert.equal((html.match(/data-product-card/g) || []).length, products.length);
  assert.doesNotMatch(html, /data-product-card[^>]*\bhidden\b/);
  const unsafe = renderCategory({
    ...allCategory,
    products: [{ ...products[0], name: '<img src=x onerror="alert(1)">' }]
  });
  assert.doesNotMatch(unsafe, /<img src=x/);
  assert.match(unsafe, /&lt;img/);
});

test("browser combines search/category/color/price, validates ranges, resets, and preserves cart identity",
  browserOptions, () => {
    runBrowser(
      renderCategory(allCategory),
      categoryData.eleventyComputed.digitalData({ cat: allCategory }),
      function () {
        expect(!form.hidden, "Controls should be enabled");
        expect(visibleCards().length === 12, "Initial catalog should show every product");
        filter("search", "  VELVET   black ");
        filter("category", "womens");
        filter("color", "black");
        filter("minPrice", "26.99");
        filter("maxPrice", "26.99");
        equal(visibleIds(), ["4005"], "All filters and exact price bounds must combine");
        expect(catalog.querySelector("[data-product-count]").textContent ===
          "Showing 1 of 12 products.", "Result count should update");
        visibleCards()[0].querySelector(".addToCart").click();
        visibleCards()[0].querySelector(".addToCart").click();
        equal(getCart().map(product => [product.id, product.quantity]), [["4005", 2]],
          "Filtered Add to Cart must retain the original product index");

        filter("search", "no-such-product");
        expect(visibleCards().length === 0, "Unknown search should hide all product cards");
        expect(!catalog.querySelector("[data-product-empty]").hidden, "Empty state should be visible");
        reset();
        expect(visibleCards().length === 12, "Reset should restore all products");
        expect(catalog.querySelector("[data-product-empty]").hidden, "Reset should hide empty state");
        expect(Array.from(form.querySelectorAll("input, select")).every(control => control.value === ""),
          "Reset should clear every filter");

        filter("minPrice", "69.99");
        filter("maxPrice", "69.99");
        equal(visibleIds(), ["4009", "4010"], "String prices must compare numerically");
        filter("minPrice", "70");
        expect(!form.querySelector("#catalog-price-error").hidden, "Reversed range must show an error");
        equal(visibleIds(), ["4009", "4010"], "Invalid ranges must keep the last valid result");
        expect(form.elements.minPrice.getAttribute("aria-invalid") === "true",
          "Invalid price must be accessible");
        filter("minPrice", "-1");
        expect(!form.querySelector("#catalog-price-error").hidden, "Negative prices must show an error");
        filter("minPrice", "0.001");
        expect(!form.querySelector("#catalog-price-error").hidden, "Fractional cents must show an error");
        reset();
        expect(form.querySelector("#catalog-price-error").hidden, "Reset should clear validation");
        filter("search", "BLUE long sleeve");
        equal(visibleIds(), ["4008", "4009"], "Search should match category names and colors");
        const submit = new Event("submit", { bubbles: true, cancelable: true });
        form.dispatchEvent(submit);
        expect(submit.defaultPrevented, "Enter should not navigate away");
      }
    );
  });

test("browser leaves individual category pages unfiltered and preserves their cart indices", browserOptions, () => {
  const cat = categories.find((category) => category.tag === "womens");
  runBrowser(
    renderCategory(cat),
    categoryData.eleventyComputed.digitalData({ cat }),
    function () {
      expect(catalog === null, "Individual categories must not be filterable");
      expect(document.querySelector("[data-product-filters]") === null, "No filter controls");
      expect(document.querySelectorAll(".box").length === 6, "Keep the category's original products");
      document.querySelector(".addToCart").click();
      equal(getCart().map(product => product.id), ["4003"], "Category cart mapping should remain correct");
    }
  );
});

test("browser leaves non-filterable product grids unchanged", browserOptions, () => {
  const featured = products.slice(0, 4);
  runBrowser(
    Handlebars.compile("{{> product_cards products=products details=true addToCart=true}}")({
      products: featured, categories
    }),
    { products: featured },
    function () {
      expect(catalog === null, "Featured/detail grids should not become filterable");
      expect(document.querySelector("[data-product-filters]") === null, "No inactive filter UI");
      document.querySelector(".addToCart").click();
      equal(getCart().map(product => product.id), ["4001"], "Existing cart behavior must remain intact");
    }
  );
});

test("browser aligns filter labels and control heights across desktop and narrow layouts", browserOptions, () => {
  runBrowser(
    renderCategory(allCategory),
    categoryData.eleventyComputed.digitalData({ cat: allCategory }),
    function () {
      for (const width of [1280, 1024, 768, 390, 320]) {
        const frame = document.createElement("iframe");
        frame.style.width = width + "px";
        frame.style.height = "1000px";
        frame.style.border = "0";
        document.body.appendChild(frame);
        const doc = frame.contentDocument;
        doc.open();
        doc.write('<!doctype html><html><head><style>' +
          document.querySelector("style").textContent + '</style></head><body>' +
          catalog.outerHTML + '</body></html>');
        doc.close();
        const labels = Array.from(doc.querySelectorAll(".form-label"));
        const controls = Array.from(doc.querySelectorAll(".form-control, .form-select"));
        const tops = labels.map(label => label.getBoundingClientRect().top);
        const heights = controls.map(control => control.getBoundingClientRect().height);
        expect(heights.every(height => Math.abs(height - heights[0]) < 1),
          "Control heights should match at " + width + "px: " + heights);
        if (width >= 992) {
          expect(tops.every(top => Math.abs(top - tops[0]) < 1),
            "Desktop labels should align at " + width + "px: " + tops);
        } else {
          expect(Math.abs(tops[1] - tops[2]) < 1 && Math.abs(tops[3] - tops[4]) < 1,
            "Labels should align within each responsive row at " + width + "px");
        }
        labels.forEach(label => {
          const lineHeight = parseFloat(frame.contentWindow.getComputedStyle(label).lineHeight);
          expect(label.getBoundingClientRect().height <= lineHeight + 1,
            "Labels should stay on one line at " + width + "px");
        });
        expect(doc.documentElement.scrollWidth <= width,
          "Filters should not cause horizontal overflow at " + width + "px");
        frame.remove();
      }
    }
  );
});
