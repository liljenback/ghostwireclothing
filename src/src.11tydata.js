const pageNameToSiteSection = {
  cart: "Cart & Checkout",
  checkout: "Cart & Checkout",
  purchase: "Cart & Checkout",
  success: "Cart & Checkout",
  product: "Shop",
  category: "Shop",
  index: "Home Page",
  about: "Customer Support",
  contact: "Customer Support",
  testimonials: "Customer Support",
};

module.exports = {
  addToCart: true,
  eleventyComputed: {
    digitalData: (data) => {
      const pageName = data.pageName || "";
      const pageProducts = data.pageProducts || (data.products || []).slice(0, 4);

      const dd = {
        page: pageName,
        siteSection: data.siteSection || pageNameToSiteSection[pageName] || "",
        products: pageProducts,
      };

      if (pageName === "product" && dd.products.length > 0) {
        dd.product = dd.products[0];
        dd.cat1Tag = dd.products[0].cat1Tag;
        dd.cat2Tag = dd.products[0].cat2Tag;
        dd.cat3Tag = dd.products[0].cat3Tag;
      }

      return dd;
    },
  },
};
