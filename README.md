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
`https://www.ghostwireclothing.com/api/client_hints`. The payload is the full,
unmodified Thumbmark response, matching the console result and `window.thumbmarkResult`.
This includes the original `elapsed` object with all per-component, `_dispatch.*`
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