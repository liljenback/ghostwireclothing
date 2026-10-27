// Fictional proof-of-concept content, not customer feedback or verified order records.
module.exports = [
  {
    name: "Daniel K.",
    initials: "DK",
    rating: 5,
    title: "Easy to dress up or down",
    quote: "I was looking for a simple shirt to wear untucked, and this one has the look I wanted. The gray works with most of what I already own.",
    productName: "Classic No Tuck Dress Shirt",
    productUrl: "/products/001.html",
  },
  {
    name: "Maya R.",
    initials: "MR",
    rating: 5,
    title: "A lovely color for an evening out",
    quote: "The violet shade caught my eye straight away. I kept the rest of the outfit simple and let the dress be the main detail.",
    productName: "A-Line Strapless Chiffon Floor-Length Dress",
    productUrl: "/products/003.html",
  },
  {
    name: "Sofia L.",
    initials: "SL",
    rating: 4,
    title: "The pockets are a nice touch",
    quote: "I liked the understated look of this black dress, especially with the pockets. A few more color options would make it even better.",
    productName: "Coopertown Black Velvet Pocket Dress",
    productUrl: "/products/005.html",
  },
].map((review) => ({
  ...review,
  stars: Array.from({ length: 5 }, (_, index) => index < review.rating),
}));
