// to get current year
function getYear() {
  var currentDate = new Date();
  var currentYear = currentDate.getFullYear();
  $("#displayYear").innerHTML = currentYear;
}

getYear();

/*
// client section owl carousel
$(".client_owl-carousel").owlCarousel({
  loop: true,
  margin: 0,
  dots: false,
  nav: true,
  navText: [],
  autoplay: true,
  autoplayHoverPause: true,
  navText: [
    '<i class="fa fa-angle-left" aria-hidden="true"></i>',
    '<i class="fa fa-angle-right" aria-hidden="true"></i>'
  ],
  responsive: {
    0: {
      items: 1
    },
    768: {
      items: 2
    },
    1000: {
      items: 2
    }
  }
});
*/


/** google_map js **/
function myMap() {
  var mapProp = {
    center: new google.maps.LatLng(40.712775, -74.005973),
    zoom: 18,
  };
  var map = new google.maps.Map(document.getElementById("googleMap"), mapProp);
}

// Set the tags library script in the settings form id=tagsLibrary input
document.getElementById("tagsLibrary").value = window.localStorage.getItem("tagsLibrary") || defaultTagsLibrary;

//$("#tagsLibraryForm input").val(window.localStorage.getItem("tagsLibrary") || defaultTagsLibrary);

$("#navSettings").on("click", function () {
  $("#tagsLibraryForm").toggle();
});

$("#tagsLibraryReset").on("click", function (e) {
  e.preventDefault();
  window.localStorage.removeItem("tagsLibrary");
  document.location.reload();
});

$("#tagsLibrarySubmit").on("click", function (e) {
  e.preventDefault();
  //window.localStorage.setItem("tagsLibrary", $("#tagsLibraryForm input").val());
  window.localStorage.setItem("tagsLibrary", document.getElementById("tagsLibrary").value);
  document.location.reload();
});

function getCart() {
  return JSON.parse(window.localStorage.getItem("cart") || "[]");
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

$(".addToCart").on("click", function (e) {
  e.preventDefault();

  const buttons = $(e.target).parents(".options");
  const spinner = buttons.siblings(".spinner-border");
  buttons.hide();
  spinner.show();
  setTimeout(function () {
    buttons.show();
    spinner.hide();
  }, 750);

  const products = window.digitalData.products;
  const productIndex = e.target.dataset.productIndex;
  const cart = getCart();
  const existingIndex = cart.findIndex(p => p.id === products[productIndex].id);
  if (existingIndex !== -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({ ...products[productIndex], quantity: 1 });
  }
  window.localStorage.setItem("cart", JSON.stringify(cart));
});

$(".clear-cart").on("click", function () {
  window.localStorage.removeItem("cart");
  refresh();
});

function refresh() {
  const cart = getCart();
  const total = cart.reduce((total, p) => total + (p.price * p.quantity), 0);

  if (total === 0) {
    $(".cart_section").hide();
    $(".empty_section").show();
  } else {
    $(".cart_section").show();
    $(".empty_section").hide();
  }

  $(".cart_section tbody").html(function () {
    const cart = getCart();
    return cart.map(p => `<tr><td><img src="/images/${p.image}"/></td><td><a href="/${p.url}">${p.name}</a></td><td>${p.quantity}</td><td>${formatPrice(p.price * p.quantity)}</td><td data-product-id="${p.id}"><a href="#" class="remove">remove</a></td></tr>`).join("");
  });

  $(".cart_section .total, .payment_section .subtotal").html(function () {
    return formatPrice(total);
  });

  $(".payment_section .tax").html(function () {
    return formatPrice((total + 5.99) * 0.065);
  });

  $(".payment_section .total").html(function () {
    return formatPrice((total + 5.99) * 1.065);
  });

  $(".cart_section tbody .remove").on("click", function (e) {
    e.preventDefault();
    const cart = getCart();
    const productId = e.target.parentElement.dataset.productId;
    const newCart = cart.filter(p => p.id != productId);
    window.localStorage.setItem("cart", JSON.stringify(newCart));
    refresh();
  });
}
refresh();

$("section .cart-nav").on("click", function (e) {
  e.preventDefault();
  const section = e.target.dataset.section;
  $(e.target).closest("section").hide();
  $(`.${section}_section`).show();
});

$(".payment_section .submit").on("click", function (e) {
  e.preventDefault();
  window.localStorage.removeItem("cart");
  document.location = "/success.html";
});

$("#clearAJOStorage").on("click", function (e) {
  e.preventDefault();
  Object.keys(window.localStorage)
    .filter(key => key.endsWith("decisioning.events"))
    .forEach(key => window.localStorage.removeItem(key))
});

$("#debugOn").on("click", function (e) {
  e.preventDefault();
  window._satellite.setDebug(true);
});

