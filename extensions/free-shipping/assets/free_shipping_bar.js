(function () {
  function formatMoney(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  function update(bar, totalCents) {
    var threshold = parseInt(bar.getAttribute("data-threshold"), 10) || 0;
    if (threshold <= 0) return;

    var remaining = Math.max(threshold - totalCents, 0);
    var percent = Math.min((totalCents * 100) / threshold, 100);

    var fill = bar.querySelector("[data-fsb-fill]");
    if (fill) fill.style.width = percent + "%";

    var message = bar.querySelector("[data-fsb-message]");
    if (!message) return;

    if (remaining <= 0) {
      message.textContent = bar.getAttribute("data-success-message") || "";
    } else {
      var template = bar.getAttribute("data-progress-message") || "";
      message.textContent = template.replace("[amount]", formatMoney(remaining));
    }
  }

  function refreshAll() {
    var bars = document.querySelectorAll("[data-free-shipping-bar]");
    if (!bars.length) return;
    fetch("/cart.js", { headers: { Accept: "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (cart) {
        bars.forEach(function (bar) { update(bar, cart.total_price); });
      })
      .catch(function () {});
  }

  // Debounce so multiple rapid changes only trigger one fetch.
  var debounceTimer;
  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshAll, 200);
  }

  // Move the bar (a body embed, injected at the end of <body>) to sit directly
  // below the cart title. The title wrapper lives outside the section Dawn
  // re-renders, so once moved, the bar stays put.
  function placeBar() {
    var anchor = document.querySelector(
      ".title-wrapper-with-link, .cart__warnings, #main-cart-items"
    );
    if (!anchor) return;
    var bars = document.querySelectorAll("[data-free-shipping-bar]");
    bars.forEach(function (bar) {
      if (anchor.nextElementSibling !== bar) {
        anchor.insertAdjacentElement("afterend", bar);
      }
    });
  }

  function init() {
    placeBar();
    refreshAll();

    // 1) Themes that broadcast a cart change as a DOM event.
    ["cart:updated", "cart-updated", "cart:refresh", "ajaxCart:afterCartLoad"].forEach(
      function (evt) { document.addEventListener(evt, scheduleRefresh); }
    );

    // 2) Dawn (and most themes) re-render the cart section's contents when the
    //    quantity changes. Watch that container and recalc when it mutates.
    var cartContainer = document.querySelector(
      "#main-cart-items, cart-items, .cart-items, #cart, [id^='shopify-section'] .cart__items"
    );
    if (cartContainer && "MutationObserver" in window) {
      var observer = new MutationObserver(scheduleRefresh);
      observer.observe(cartContainer, { childList: true, subtree: true });
    }
  }

  // 3) Catch AJAX cart mutations regardless of theme, so the bar updates
  //    without a page reload (add / change / update / clear endpoints).
  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var url = arguments[0];
      if (url && typeof url === "object" && url.url) url = url.url;
      var result = originalFetch.apply(this, arguments);
      if (typeof url === "string" && /\/cart\/(add|change|update|clear)/.test(url)) {
        result.then(scheduleRefresh).catch(function () {});
      }
      return result;
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
