(function () {
  "use strict";

  document.querySelectorAll("[data-product-catalog]").forEach(function (catalog) {
    const form = catalog.querySelector("[data-product-filters]");
    const search = form.elements.namedItem("search");
    const category = form.elements.namedItem("category");
    const color = form.elements.namedItem("color");
    const minPrice = form.elements.namedItem("minPrice");
    const maxPrice = form.elements.namedItem("maxPrice");
    const error = form.querySelector("#catalog-price-error");
    const count = catalog.querySelector("[data-product-count]");
    const empty = catalog.querySelector("[data-product-empty]");
    const cards = Array.from(catalog.querySelectorAll("[data-product-card]"), function (element) {
      return {
        element,
        search: element.dataset.search.toLowerCase(),
        categories: element.dataset.categories.split(/\s+/),
        color: element.dataset.color,
        price: Number(element.dataset.price)
      };
    });

    Array.from(category.options).forEach(function (option) {
      if (option.value && !cards.some(function (card) { return card.categories.includes(option.value); })) {
        option.remove();
      }
    });
    const colors = Array.from(new Set(cards.map(function (card) { return card.color; }))).sort();
    colors.forEach(function (value) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
      color.appendChild(option);
    });

    function applyFilters() {
      const min = minPrice.value === "" ? 0 : Number(minPrice.value);
      const max = maxPrice.value === "" ? Infinity : Number(maxPrice.value);
      const invalidMin = !minPrice.validity.valid;
      const invalidMax = !maxPrice.validity.valid;
      const reversedRange = !invalidMin && !invalidMax && min > max;
      minPrice.setAttribute("aria-invalid", String(invalidMin || reversedRange));
      maxPrice.setAttribute("aria-invalid", String(invalidMax || reversedRange));
      error.textContent = invalidMin || invalidMax ?
        "Enter valid non-negative prices in increments of $0.01. Results have not been updated." :
        reversedRange ? "Min price must not exceed max price. Results have not been updated." : "";
      error.hidden = error.textContent === "";
      if (!error.hidden) return;

      const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let visible = 0;
      cards.forEach(function (card) {
        const matches = terms.every(function (term) { return card.search.includes(term); }) &&
          (!category.value || card.categories.includes(category.value)) &&
          (!color.value || card.color === color.value) &&
          card.price >= min && card.price <= max;
        card.element.hidden = !matches;
        if (matches) visible++;
      });
      count.textContent = "Showing " + visible + " of " + cards.length +
        (cards.length === 1 ? " product." : " products.");
      count.hidden = false;
      empty.hidden = visible !== 0;
    }

    form.addEventListener("input", applyFilters);
    form.addEventListener("change", applyFilters);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      applyFilters();
    });
    form.querySelector("[data-product-reset]").addEventListener("click", function () {
      form.reset();
      applyFilters();
    });
    applyFilters();
    form.hidden = false;
  });
})();
