(function () {
  "use strict";

  const form = document.querySelector("[data-newsletter-form]");
  if (!form) return;

  const controls = form.querySelector("[data-newsletter-controls]");
  const submit = form.querySelector('[type="submit"]');
  const buttonLabel = submit.textContent;
  const summary = form.querySelector("#newsletter-error-summary");
  const result = form.querySelector("#newsletter-result");
  const fields = Array.from(form.querySelectorAll("[name]"));
  const errors = new Map(Array.from(form.querySelectorAll("[data-error-for]"), function (error) {
    return [error.dataset.errorFor, error];
  }));
  const other = form.querySelector("[data-newsletter-other]");
  const action = form.elements.namedItem("action").value;
  const apiUrl = new URL(form.getAttribute("action"), document.baseURI).href;
  const expectedStatuses = {
    subscribe: "subscribed", preferences: "preferences_updated", unsubscribe: "unsubscribed"
  };
  const confirmations = {
    subscribe: "Demo subscription confirmed. No subscription was saved and no emails will be sent.",
    preferences: "Demo preferences confirmed. Your choices were not saved and no email frequency was changed.",
    unsubscribe: "Demo unsubscription confirmed. No real mailing list was changed."
  };
  let pending = false;

  function clearFeedback() {
    summary.hidden = true;
    summary.textContent = "";
    result.hidden = true;
    result.textContent = "";
  }

  function fieldError(name, message) {
    const error = errors.get(name);
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
    fields.filter(function (field) { return field.name === name; }).forEach(function (field) {
      field.setCustomValidity(message);
      field.setAttribute("aria-invalid", String(Boolean(message)));
    });
  }

  function updateOther() {
    if (!other) return;
    const active = form.elements.namedItem("reason").value === "other";
    other.hidden = !active;
    other.disabled = !active;
    if (!active) {
      form.elements.namedItem("otherReason").value = "";
      fieldError("otherReason", "");
    }
  }

  function showError(message) {
    summary.textContent = message;
    summary.hidden = false;
  }

  form.addEventListener("change", function (event) {
    if (event.target.name === "reason") updateOther();
  });
  form.addEventListener("input", function (event) {
    if (!fields.includes(event.target)) return;
    fieldError(event.target.name, "");
    clearFeedback();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending) return;
    clearFeedback();
    errors.forEach(function (error, name) { fieldError(name, ""); });

    const email = form.elements.namedItem("email").value.trim();
    const payload = { action, email };
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldError("email", "Enter a valid email address of at most 254 characters.");
    }
    if (action === "unsubscribe") {
      payload.reason = form.elements.namedItem("reason").value;
      if (!["too_many_emails", "irrelevant_content", "no_longer_interested", "other"].includes(payload.reason)) {
        fieldError("reason", "Please choose a reason.");
      }
      if (payload.reason === "other") {
        payload.otherReason = form.elements.namedItem("otherReason").value.trim();
        if (!payload.otherReason || payload.otherReason.length > 1000) {
          fieldError("otherReason", "Describe your reason using 1 to 1000 characters.");
        }
      }
    } else {
      payload.categories = fields.filter(function (field) {
        return field.name === "categories" && field.checked;
      }).map(function (field) { return field.value; });
      payload.frequency = form.elements.namedItem("frequency").value;
      if (!payload.categories.length) fieldError("categories", "Choose at least one email type.");
      if (!["weekly", "monthly"].includes(payload.frequency)) fieldError("frequency", "Choose an email frequency.");
    }
    const firstInvalid = fields.find(function (field) {
      return !field.matches(":disabled") && !field.validity.valid;
    });
    if (firstInvalid) {
      showError("Please correct the highlighted fields.");
      firstInvalid.focus();
      return;
    }

    pending = true;
    controls.disabled = true;
    form.setAttribute("aria-busy", "true");
    submit.textContent = "Sending...";
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 10000);
    let focusTarget = summary;
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The server returned an unreadable response. Please try again.");
      }
      if (response.status === 400 && data && data.error === "VALIDATION_ERROR" &&
          data.fields && typeof data.fields === "object" && !Array.isArray(data.fields)) {
        Object.entries(data.fields).forEach(function ([name, message]) {
          if (typeof message !== "string") return;
          fieldError(name, message);
          const field = fields.find(function (item) { return item.name === name && item.type !== "hidden"; });
          if (focusTarget === summary && field) focusTarget = field;
        });
        showError("Please review your details. " + Object.values(data.fields).filter(function (message) {
          return typeof message === "string";
        }).join(" "));
      } else if (!response.ok) {
        throw new Error("Your request could not be completed (HTTP " + response.status + "). Please try again.");
      } else if (response.status !== (action === "subscribe" ? 201 : 200) || !data ||
          data.success !== true || data.simulated !== true || data.status !== expectedStatuses[action]) {
        throw new Error("The server did not confirm your request. Please try again.");
      } else {
        form.reset();
        updateOther();
        result.textContent = confirmations[action];
        result.hidden = false;
        focusTarget = result;
      }
    } catch (error) {
      showError(controller.signal.aborted ?
        "The request timed out. Please check your connection and try again." :
        error instanceof TypeError ? "Unable to connect. Please check your connection and try again." :
        error.message);
    } finally {
      clearTimeout(timeout);
      pending = false;
      controls.disabled = false;
      form.removeAttribute("aria-busy");
      submit.textContent = buttonLabel;
      focusTarget.focus();
    }
  });

  form.noValidate = true;
  updateOther();
  controls.disabled = false;
})();
