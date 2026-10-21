(function () {
  "use strict";

  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const controls = form.querySelector("[data-contact-controls]");
  const fields = Array.from(form.querySelectorAll("[name]"));
  const groups = Array.from(form.querySelectorAll("[data-contact-types]"));
  const inquiryType = form.elements.namedItem("inquiryType");
  const submit = form.querySelector('[type="submit"]');
  const summary = form.querySelector("#contact-error-summary");
  const result = form.querySelector("#contact-result");
  const errors = new Map(Array.from(form.querySelectorAll("[data-error-for]"), function (error) {
    return [error.dataset.errorFor, error];
  }));
  let pending = false;

  function clearFeedback() {
    summary.hidden = true;
    summary.textContent = "";
    result.hidden = true;
    result.textContent = "";
  }

  function fieldError(field, message) {
    field.setCustomValidity(message);
    field.setAttribute("aria-invalid", String(Boolean(message)));
    const error = errors.get(field.name);
    error.textContent = message;
    error.hidden = !message;
  }

  function updateGroups() {
    groups.forEach(function (group) {
      const active = group.dataset.contactTypes.split(" ").includes(inquiryType.value);
      group.hidden = !active;
      group.disabled = !active;
      if (!active) {
        group.querySelectorAll("[name]").forEach(function (field) {
          field.value = "";
          fieldError(field, "");
        });
      }
    });
  }

  function showError(message) {
    summary.textContent = message;
    summary.hidden = false;
  }

  form.addEventListener("change", function (event) {
    if (event.target === inquiryType) updateGroups();
  });
  form.addEventListener("input", function (event) {
    if (!fields.includes(event.target)) return;
    fieldError(event.target, "");
    clearFeedback();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending) return;
    clearFeedback();

    const activeFields = fields.filter(function (field) { return !field.matches(":disabled"); });
    let firstInvalid;
    const payload = {};
    activeFields.forEach(function (field) {
      fieldError(field, "");
      const value = field.value.trim();
      if (!value) {
        fieldError(field, "This field is required.");
      } else if (field.maxLength > 0 && field.value.length > field.maxLength) {
        fieldError(field, "Must be at most " + field.maxLength + " characters.");
      } else if (field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        fieldError(field, "Enter a valid email address.");
      } else if (!field.validity.valid) {
        fieldError(field, field.validationMessage);
      }
      if (!field.validity.valid && !firstInvalid) firstInvalid = field;
      payload[field.name] = field.name === "rating" ? Number(value) : value;
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
      const response = await fetch(form.action, {
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
        activeFields.forEach(function (field) {
          if (Object.hasOwn(data.fields, field.name) && typeof data.fields[field.name] === "string") {
            fieldError(field, data.fields[field.name]);
            if (focusTarget === summary) focusTarget = field;
          }
        });
        showError("Please review your details and correct the highlighted fields.");
      } else if (!response.ok) {
        throw new Error("Your message could not be submitted (HTTP " + response.status + "). Please try again.");
      } else if (response.status !== 201 || !data || data.success !== true ||
          data.status !== "received" || typeof data.ticketId !== "string" || !data.ticketId.trim()) {
        throw new Error("The server did not confirm your submission. Please try again.");
      } else {
        form.reset();
        fields.forEach(function (field) { fieldError(field, ""); });
        updateGroups();
        result.textContent = "Your message has been received. Your reference ID is " + data.ticketId + ".";
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
      submit.textContent = "Send message";
      focusTarget.focus();
    }
  });

  form.noValidate = true;
  updateGroups();
  controls.disabled = false;
})();
