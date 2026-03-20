module.exports = {
  eleventyComputed: {
    digitalData: (data) => {
      const categories = data.categories || [];
      return {
        page: "product",
        siteSection: "Shop",
        products: categories,
        product: categories[0] || {},
        cat1Tag: categories[0] ? categories[0].cat1Tag : "",
        cat2Tag: categories[0] ? categories[0].cat2Tag : "",
        cat3Tag: categories[0] ? categories[0].cat3Tag : "",
      };
    },
  },
};
