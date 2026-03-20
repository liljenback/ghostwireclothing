module.exports = {
  eleventyComputed: {
    permalink: (data) => {
      if (!data.singleProduct) return false;
      return data.singleProduct.url;
    },
    singleProductArray: (data) => {
      const product = data.singleProduct;
      return product ? [product] : [];
    },
    pageProducts: (data) => {
      const product = data.singleProduct;
      return product ? [product] : [];
    },
    digitalData: (data) => {
      const product = data.singleProduct;
      const products = product ? [product] : [];
      return {
        page: "product",
        siteSection: "Shop",
        products: products,
        product: product || {},
        cat1Tag: product ? product.cat1Tag : "",
        cat2Tag: product ? product.cat2Tag : "",
        cat3Tag: product ? product.cat3Tag : "",
      };
    },
  },
};
