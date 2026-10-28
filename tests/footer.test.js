const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const footer = (file) => {
  const html = read(file);
  const match = html.match(/<footer class="footer_section">[\s\S]*?<\/footer>/);
  assert.ok(match, file);
  for (const script of ["bootstrap.bundle.min.js", "custom.js"]) {
    assert.equal(html.split(`src="/js/${script}"`).length - 1, 1, `${file}: ${script}`);
  }
  return match[0].replace(/>\s+</g, "><");
};

test("homepage and nested pages share a footer with working navigation and no disconnected signup", () => {
  const html = footer("public/index.html");
  for (const file of ["public/contact.html", "public/newsletter.html", "public/products/001.html", "public/categories/all.html"]) {
    assert.equal(footer(file), html, file);
  }
  assert.doesNotMatch(html, /ghostwireclothing@gmail\.com|EMAIL:|href="#"|<form\b|Login|Register|updates daily/);
  assert.match(html, /href="\/contact\.html">Contact us<\/a>/);
  assert.match(html, /href="\/newsletter\.html">Subscribe to our newsletter<\/a>/);
  for (const [, url] of html.matchAll(/href="(\/[^"]*)"/g)) {
    assert.ok(fs.existsSync(path.join(root, "public", url)), url);
  }
});

test("social icons use external profile destinations and cookie preferences remain an action", () => {
  const html = footer("public/index.html");
  const social = html.match(/<div class="footer_social"[\s\S]*?<\/div>/)[0];
  for (const [, url, attributes] of social.matchAll(/<a href="([^"]+)"([^>]*)>/g)) {
    const profile = new URL(url);
    assert.equal(profile.protocol, "https:");
    assert.match(profile.pathname, /\/ghostwireclothing\/?$/);
    assert.match(attributes, /aria-label="[^"]+"/);
    assert.match(attributes, /rel="noopener noreferrer"/);
  }
  assert.match(html, /<button[^>]+type="button"[^>]+onclick="openConsentModal\(\);">Cookie Preferences<\/button>/);
});
