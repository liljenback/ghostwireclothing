# Ghostwire Clothing

A static e-commerce site built with [Eleventy](https://www.11ty.dev/) and Handlebars templates. Styled with Bootstrap 5, Font Awesome 6, and custom SCSS.

## Install Dependencies

```
npm install
```

## Build

```
npm run build
```

Generated HTML is written to `public/`, which is the deploy directory.

## Development Server

```
npm run serve
```

Starts Eleventy with live reload.

## Project Structure

```
src/                  Eleventy input directory
  *.hbs               Page templates (Handlebars with YAML front matter)
  _includes/          Partials (head, nav, footer, product_cards, etc.)
  _data/              Global data (products, categories, env variables)
  *.11tydata.js       Computed data files (digitalData per page type)
  style.scss          SCSS source → compiled to public/css/style.css
  products.js         Product catalog
public/               Build output & static assets (deploy target)
  css/                Bootstrap 5, Font Awesome 6, compiled styles
  js/                 Bootstrap bundle, custom.js (vanilla JS)
  images/             Product images, logos, backgrounds
  fonts/              Custom fonts
  webfonts/           Font Awesome webfonts
.eleventy.js          Eleventy configuration
```

## Development Tips

* Edit Handlebars templates in `src/` — run `npm run build` or use `npm run serve` for live reload.
* Product and category pages are generated automatically from `src/products.js` via Eleventy pagination.
* Edit `src/_includes/head.hbs` to modify the Adobe Tags script or meta tags.
* Edit `src/_data/` files to change product data, categories, or environment variables.
* Edit `public/js/custom.js` for client-side functionality.

## Product Search and Filters

Only the All Products page (`/categories/all.html`) includes search and filters.
It supports case-insensitive search across product names, category names and
colors, combined with category, color and inclusive min/max price filters.
All search terms must match. The Products category directory and individual
category pages remain unchanged.

Results update locally without navigation or a search API. The controls include
a live result count, an empty state and a Clear filters button. Invalid or reversed
price ranges show an error and leave the last valid results unchanged.
Without JavaScript, all product cards and links remain available and the inactive
filter controls stay hidden. Featured products and individual product pages are
unchanged. Filtering hides cards without changing their indices, analytics data
or cart mappings.

Run `node --test tests/product-filters.test.js` for the catalog checks. Browser
checks use an installed Chrome/Chromium; set `CHROME_BIN` to its executable if it
is not in a standard location.

## Browser Fingerprint Experiment

ThumbmarkJS runs automatically on every storefront page load, independently of
the analytics consent choice. There is no separate test page or checkbox. The integration
uses pinned ThumbmarkJS 1.12.0, the free **Open Source** library, not the
quota-limited **Free API**. No account, API key or subscription is needed.

Inspect `window.thumbmarkResult` or the `[ThumbmarkJS]` message in DevTools.
No fingerprint output, status panel or other diagnostic UI is added to the page.
BrowserStack tests can wait for `window.thumbmarkResult` without accepting analytics,
and read that JavaScript value. Results include the hash, components, timing and any
component warnings. Browser privacy protections and automation can change hashes.
This collects browser signals; it does not measure overall site performance.

The existing consent popup and `?opt-out=true` control Adobe analytics only; neither
blocks fingerprint collection. The original analytics popup is unchanged; the
privacy policy documents the separate fingerprint experiment.
Collection runs once per page visit, including restoration from the back/forward cache.
Leaving clears `window.thumbmarkResult` and discards any pending result.
Previously logged console output must be cleared in DevTools. The result
is not saved to browser storage. Thumbmark telemetry
and collection beacons are disabled, WebRTC is excluded, and no Thumbmark API is
called. Loading from jsDelivr still sends normal request metadata to the CDN.
Existing Adobe behavior is unchanged.

Each collected result is also POSTed as JSON to
`https://www.ghostwireclothing.com/api/client_hints`. The payload is the full
Thumbmark response plus `components.custom.webgl`, `components.custom.display`,
`components.custom.webdriver` and `components.custom.pageContext`, matching the console result and
`window.thumbmarkResult`. All original Thumbmark fields are preserved; the
`thumbmark` hash is not recalculated and does not include these custom signals.
The custom WebGL object contains `supported`, raw unmasked `vendor` and `renderer`,
and case-insensitive `isSwiftShader` / `isANGLE` matches against the renderer.
ANGLE and SwiftShader are not mutually exclusive: ANGLE can use SwiftShader.
These are best-effort string detections, not proof of automation or a particular GPU.
The WebGL `status` explicitly distinguishes `success`, `unavailable_extension`,
`no_context` and `error`. If the debug renderer extension is unavailable, vendor/renderer are `null` and
both match flags are `false` (not detected, rather than ruled out).
Unavailable WebGL returns `{ supported: false, status: "no_context" }`.
Collection exceptions return `status: "error"` with an `error` message and log a
warning without blocking the upload. On error, `supported` is `true` if a context
was obtained, otherwise `null`. Lost contexts are errors, not missing extensions.
Browser privacy settings can hide or alter renderer information.

WebGL `capabilities` uses the same context to collect a sorted `extensions` list
and `limits`: `maxTextureSize`, `maxRenderbufferSize`, and `maxViewportDims` (a
two-element JSON array). Capabilities have their own `status` (`success` or `error`);
capability failures log a warning and retain successfully read renderer information.
Capabilities are attempted even when the debug renderer extension is unavailable.

The custom display object contains `screenWidth`, `screenHeight`, `availableWidth`,
`availableHeight`, `viewportWidth`, `viewportHeight`, `outerWidth`, `outerHeight`,
and `devicePixelRatio`. Screen orientation and rotation angle are not collected.
Dimensions are browser-reported CSS pixels, not physical pixel counts.
Values are sampled once per collection, including
back/forward cache restoration, not continuously on resize or rotation.
Display collection exceptions return `{ error: "..." }` and log a warning without
blocking other signals or the upload. These values can be affected by zoom, privacy
protections and browser behavior; they are not proof of automation.

The custom webdriver object contains `value`, read from `navigator.webdriver`:
`true` or `false` when reported, or `null` when unavailable. Access exceptions
add an `error` message and log a warning without blocking other signals or the upload.
This is a browser-reported automation indicator, not conclusive bot detection:
`false` or `null` does not establish that the browser is not automated.

The custom `pageContext` object contains `hasFocus` and `visibilityState`, sampled
with the other custom signals. Unavailable APIs return `null`; read exceptions
return an `error` and log a warning without blocking the upload. This is only a
snapshot, not a focus/visibility history or a measure of interaction.
No interaction listeners, typed content, or WebGPU adapter collection are added.
Custom collectors run after a usable Thumbmark result; if Thumbmark fails or its
CDN is blocked, no custom payload is uploaded.

The payload includes the original `elapsed` object with all per-component, `_dispatch.*`
and `_pipeline.*` timings, plus any other returned fields such as `info` and `error`.
The backend must accept object-shaped `elapsed`, not just a numeric duration.
Uploads time out after 10 seconds, do not retry automatically,
and log success or failure with the `[ThumbmarkJS]` prefix. A failed upload does not
clear `window.thumbmarkResult` or interrupt the storefront.
Successful JSON responses are logged in full as `[ThumbmarkJS] API response:`,
including any additional backend fields. Empty responses (such as HTTP 204) are
accepted without JSON parsing; unreadable responses are reported separately from
upload failures. The backend response is not substituted for the original fingerprint.

For localhost testing, inspect DevTools **Network** for `client_hints`. The backend
must allow the localhost origin and the JSON POST preflight through CORS. The site
does not bypass CORS or proxy failed requests. The endpoint must also allow the
deployed storefront origin if different from `https://www.ghostwireclothing.com`.
No authentication headers or cross-origin cookies are added.

Always-on fingerprinting and uploads can require consent under GDPR/ePrivacy;
this experiment does not establish compliance and needs legal review before
public deployment. The existing analytics consent popup is unchanged.

Run `node --test tests/thumbmark.test.js` for the focused lifecycle and failure tests.