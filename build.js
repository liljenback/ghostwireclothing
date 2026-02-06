#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");
const { globSync } = require("glob");
require("./src/helpers");
const getData = require("./src/data");
const products = require("./src/products");

require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });
const {
  EDGE_CONFIG_ID_WITH_ANALYTICS,
  ORGANIZATION_ID,
  demoDecisionScopeName,
} = process.env;

const variables = {
  edgeConfigId: EDGE_CONFIG_ID_WITH_ANALYTICS,
  orgId: ORGANIZATION_ID,
  demoDecisionScopeName,
  products: products.slice(0, 4),
  addToCart: true,
};

const registerPartial = (filename, name) => {
  const template = fs.readFileSync(filename, "utf-8");
  Handlebars.registerPartial(name, template);
  console.log(`Partial registered succesfully ${name}.handlebars`);
};

const buildFile = (filename, name, variables) => {
  console.log(`Building ${name}.html`);
  const template = fs.readFileSync(filename, "utf-8");
  const renderTemplate = Handlebars.compile(template);
  const html = renderTemplate(variables);

  // Write to build folder. Copy the built file and deploy
  fs.writeFile(path.join(__dirname, "public", `${name}.html`), html, (err) => {
    if (err) console.log(err);
    console.log(`File written succesfully ${name}.html`);
  });
};

const partialGlob = path.join(__dirname, "src", "partials", "*.handlebars");
globSync(partialGlob).forEach((f) => {
  registerPartial(f, path.basename(f, ".handlebars"));
});
const srcGlob = path.join(__dirname, "src", "*.handlebars");
globSync(srcGlob).forEach((f) => {
  const name = path.basename(f, ".handlebars");
  if (name !== "product") {
    buildFile(f, name, getData({ name, variables }));
  }
});

// Build product pages
const categories = {};
["cat1", "cat2", "cat3"].forEach((catPrefix) => {
  products.forEach((product) => {
    const catTag = product[`${catPrefix}Tag`];
    const catName = product[`${catPrefix}Name`];
    const image = product.image;
    if (!categories[catTag]) {
      categories[catTag] = {
        name: catName,
        image,
        products: [],
        url: `categories/${catTag}.html`,
      };
    }
    categories[catTag].products.push(product);
  });
});
const usedImages = [];
const categoriesList = [
  {
    name: "All Products",
    image: "p1.png",
    products,
    url: "categories/all.html",
  },
];
Object.keys(categories).forEach((catTag) =>
  categoriesList.push(categories[catTag])
);

categoriesList.forEach((category) => {
  if (usedImages.indexOf(category.image) !== -1) {
    const newImageProduct = category.products.find(
      (p) => usedImages.indexOf(p.image) === -1
    );
    if (newImageProduct) {
      category.image = newImageProduct.image;
    }
  }
  usedImages.push(category.image);
  buildFile(
    path.join(__dirname, "src", "product.handlebars"),
    category.url.substring(0, category.url.length - 5),
    getData({
      name: "category",
      variables: {
        ...variables,
        title: category.name,
        products: category.products,
        details: true,
        addToCart: true,
      },
    })
  );
});
buildFile(
  path.join(__dirname, "src", "product.handlebars"),
  "product",
  getData({
    name: "product",
    variables: {
      ...variables,
      title: "Product Categories",
      products: categoriesList,
      details: true,
      addToCart: false,
    },
  })
);
products.forEach((product) => {
  buildFile(
    path.join(__dirname, "src", "product.handlebars"),
    product.url.substring(0, product.url.length - 5),
    getData({
      name: "product",
      variables: {
        ...variables,
        title: product.name,
        products: [product],
        details: false,
        addToCart: true,
      },
    })
  );
});
