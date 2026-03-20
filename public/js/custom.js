// to get current year
function getYear() {
  var currentDate = new Date();
  var currentYear = currentDate.getFullYear();
  var el = document.getElementById("displayYear");
  if (el) el.textContent = currentYear;
}

getYear();

/** google_map js **/
function myMap() {
  var mapProp = {
    center: new google.maps.LatLng(40.712775, -74.005973),
    zoom: 18,
  };
  var map = new google.maps.Map(document.getElementById("googleMap"), mapProp);
}

// Set the tags library script in the settings form id=tagsLibrary input
var tagsLibraryInput = document.getElementById("tagsLibrary");
if (tagsLibraryInput) {
  tagsLibraryInput.value = window.localStorage.getItem("tagsLibrary") || defaultTagsLibrary;
}

var navSettingsEl = document.getElementById("navSettings");
if (navSettingsEl) {
  navSettingsEl.addEventListener("click", function () {
    var form = document.getElementById("tagsLibraryForm");
    if (form) form.style.display = form.style.display === "none" ? "" : "none";
  });
}

var tagsResetEl = document.getElementById("tagsLibraryReset");
if (tagsResetEl) {
  tagsResetEl.addEventListener("click", function (e) {
    e.preventDefault();
    window.localStorage.removeItem("tagsLibrary");
    document.location.reload();
  });
}

var tagsSubmitEl = document.getElementById("tagsLibrarySubmit");
if (tagsSubmitEl) {
  tagsSubmitEl.addEventListener("click", function (e) {
    e.preventDefault();
    var el = document.getElementById("tagsLibrary");
    if (el) {
      window.localStorage.setItem("tagsLibrary", el.value);
    }
    document.location.reload();
  });
}

function getCart() {
  return JSON.parse(window.localStorage.getItem("cart") || "[]");
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

document.addEventListener("click", function (e) {
  var btn = e.target.closest(".addToCart");
  if (!btn) return;
  e.preventDefault();

  var options = btn.closest(".options");
  var spinner = options ? options.parentElement.querySelector(".spinner-border") : null;
  if (options) options.style.display = "none";
  if (spinner) spinner.style.display = "";
  setTimeout(function () {
    if (options) options.style.display = "";
    if (spinner) spinner.style.display = "none";
  }, 750);

  var products = window.digitalData.products;
  var productIndex = btn.dataset.productIndex;
  var cart = getCart();
  var existingIndex = cart.findIndex(function (p) { return p.id === products[productIndex].id; });
  if (existingIndex !== -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push(Object.assign({}, products[productIndex], { quantity: 1 }));
  }
  window.localStorage.setItem("cart", JSON.stringify(cart));
});

document.addEventListener("click", function (e) {
  if (!e.target.closest(".clear-cart")) return;
  window.localStorage.removeItem("cart");
  refresh();
});

function refresh() {
  var cart = getCart();
  var total = cart.reduce(function (sum, p) { return sum + (p.price * p.quantity); }, 0);

  var cartSection = document.querySelector(".cart_section");
  var emptySection = document.querySelector(".empty_section");

  if (total === 0) {
    if (cartSection) cartSection.style.display = "none";
    if (emptySection) emptySection.style.display = "block";
  } else {
    if (cartSection) cartSection.style.display = "block";
    if (emptySection) emptySection.style.display = "none";
  }

  var tbody = document.querySelector(".cart_section tbody");
  if (tbody) {
    tbody.innerHTML = cart.map(function (p) {
      return '<tr><td><img src="/images/' + p.image + '"/></td><td><a href="/' + p.url + '">' + p.name + '</a></td><td>' + p.quantity + '</td><td>' + formatPrice(p.price * p.quantity) + '</td><td data-product-id="' + p.id + '"><a href="#" class="remove">remove</a></td></tr>';
    }).join("");
  }

  document.querySelectorAll(".cart_section .total, .payment_section .subtotal").forEach(function (el) {
    el.textContent = formatPrice(total);
  });

  var taxEl = document.querySelector(".payment_section .tax");
  if (taxEl) taxEl.textContent = formatPrice((total + 5.99) * 0.065);

  var payTotalEl = document.querySelector(".payment_section .total");
  if (payTotalEl) payTotalEl.textContent = formatPrice((total + 5.99) * 1.065);

  document.querySelectorAll(".cart_section tbody .remove").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var productId = e.target.parentElement.dataset.productId;
      var newCart = getCart().filter(function (p) { return p.id != productId; });
      window.localStorage.setItem("cart", JSON.stringify(newCart));
      refresh();
    });
  });
}
refresh();

document.addEventListener("click", function (e) {
  var nav = e.target.closest(".cart-nav");
  if (!nav) return;
  var parentSection = nav.closest("section");
  if (!parentSection) return;
  e.preventDefault();
  var section = nav.dataset.section;
  parentSection.style.display = "none";
  var target = document.querySelector("." + section + "_section");
  if (target) target.style.display = "block";
});

var paySubmit = document.querySelector(".payment_section .submit");
if (paySubmit) {
  paySubmit.addEventListener("click", function (e) {
    e.preventDefault();
    window.localStorage.removeItem("cart");
    document.location = "/success.html";
  });
}

var clearAJO = document.getElementById("clearAJOStorage");
if (clearAJO) {
  clearAJO.addEventListener("click", function (e) {
    e.preventDefault();
    Object.keys(window.localStorage)
      .filter(function (key) { return key.endsWith("decisioning.events"); })
      .forEach(function (key) { window.localStorage.removeItem(key); });
  });
}

var debugOn = document.getElementById("debugOn");
if (debugOn) {
  debugOn.addEventListener("click", function (e) {
    e.preventDefault();
    window._satellite.setDebug(true);
  });
}

