# Ghostwire Clothing

## Install Dependencies
Website uses handlebar templates to build the site. Install dependencies with:
```
npm install
```

## Build
```
npm run build
```

## Run the website locally
```
npm run sandbox
```

## Development Tips
* Modify the handlebars templates in "/src" to update the website. Then build the site to see the changes.
* You can edit the default Adobe Tags script via "src/partials/head.handlebars"
* The build script uses "src/products.js" to automatically build category and product pages.
* You can edit "src/data.js" to create custom datalayers for each page.
* You can edit the javascript functionality in "public/js/custom.js"