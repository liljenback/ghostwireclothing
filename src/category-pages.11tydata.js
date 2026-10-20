module.exports = {
  eleventyComputed: {
    productFilters: (data) => data.cat?.tag === "all",
    permalink: (data) => {
      if (!data.cat) return false;
      return `categories/${data.cat.tag}.html`;
    },
    pageProducts: (data) => (data.cat ? data.cat.products : []),
    digitalData: (data) => {
      const products = data.cat ? data.cat.products : [];
      return {
        page: "category",
        siteSection: "Shop",
        products: products,
      };
    },
  },
};
