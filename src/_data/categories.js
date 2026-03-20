const products = require("../products");

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
        tag: catTag,
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
    tag: "all",
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
});

module.exports = categoriesList;
