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