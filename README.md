# Ghostwire Clothing

## Install

Website uses handlebar templates to build the site. Install dependencies with:

```
npm install
```

## Build

Build site using "build.js" script.

```
./build.js
```

## Run the website locally

Navigate to "public/", then run a web server.

```
python3 -m http.server 9000
```

## Development Tips

* Modify the handlebars templates in "/src" to update the website. Then build the site to see the changes.
* You can edit the default Adobe Tags script via "src/partials/head.handlebars"
* The build script uses "src/products.js" to automatically build category and product pages.
* You can edit "src/data.js" to create custom datalayers for each page.
* You can edit the javascript functionality in "public/js/custom.js"





