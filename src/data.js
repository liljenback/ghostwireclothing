
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

module.exports = ({ name, siteSection, variables }) => {
  const data = {
    ...variables,
    digitalData: {
      page: name,
      siteSection: siteSection || pageNameToSiteSection[name] || ""
    }
  };
  if (name === "product") {
    data.digitalData.product = variables.products[0];
    // Add product categories to root for easy access in Tags data element
    data.digitalData.cat1Tag = data.digitalData.product.cat1Tag;
    data.digitalData.cat2Tag = data.digitalData.product.cat2Tag;
    data.digitalData.cat3Tag = data.digitalData.product.cat3Tag;
  }
  data.digitalData.products = variables.products;
  return data;
};
