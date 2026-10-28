(function () {
  "use strict";

  const form = document.querySelector("[data-consultation-form]");
  if (!form) return;

  const controls = form.querySelector("[data-consultation-controls]");
  const submit = form.querySelector('[type="submit"]');
  const fields = Array.from(form.querySelectorAll("[name]"));
  const summary = form.querySelector("#consultation-error-summary");
  const result = form.querySelector("#consultation-result");
  const date = form.elements.namedItem("date");
  const time = form.elements.namedItem("time");
  const timezone = form.elements.namedItem("timezone");
  const errors = new Map(Array.from(form.querySelectorAll("[data-error-for]"), function (error) {
    return [error.dataset.errorFor, error];
  }));
  const apiUrl = new URL(form.getAttribute("action"), document.baseURI).href;
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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

  function showError(message) {
    summary.textContent = message;
    summary.hidden = false;
  }

  function currentTime() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone.value, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(function (part) {
      return [part.type, part.value];
    }));
    return { date: parts.year + "-" + parts.month + "-" + parts.day, time: parts.hour + ":" + parts.minute };
  }

  function updateSlots() {
    const now = currentTime();
    date.min = now.date;
    Array.from(time.options).forEach(function (option) {
      option.disabled = Boolean(option.value && date.value === now.date && option.value <= now.time);
    });
    if (time.selectedOptions[0] && time.selectedOptions[0].disabled) time.value = "";
  }

  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") :
    ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
  Array.from(new Set(["UTC", localTimezone].concat(zones))).forEach(function (zone) {
    if (zone !== "UTC") timezone.add(new Option(zone.replaceAll("_", " "), zone));
  });
  timezone.value = localTimezone;
  for (let hour = 9; hour < 17; hour++) {
    for (let minute = 0; minute < 60; minute += 20) {
      const start = String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
      const endMinutes = hour * 60 + minute + 20;
      const end = String(Math.floor(endMinutes / 60)).padStart(2, "0") + ":" + String(endMinutes % 60).padStart(2, "0");
      time.add(new Option(start + " - " + end, start));
    }
  }

  form.addEventListener("input", function (event) {
    if (!fields.includes(event.target)) return;
    fieldError(event.target, "");
    clearFeedback();
  });
  form.addEventListener("change", function (event) {
    if (!fields.includes(event.target)) return;
    fieldError(event.target, "");
    clearFeedback();
    if (event.target === date || event.target === timezone) {
      fieldError(date, "");
      fieldError(time, "");
      updateSlots();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending) return;
    clearFeedback();
    fields.forEach(function (field) { fieldError(field, ""); });
    updateSlots();
    const payload = {};
    fields.forEach(function (field) {
      const value = field.value.trim();
      payload[field.name] = value;
      if (!value) fieldError(field, "This field is required.");
      else if (field.maxLength > 0 && value.length > field.maxLength) {
        fieldError(field, "Must be at most " + field.maxLength + " characters.");
      } else if (field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        fieldError(field, "Enter a valid email address.");
      } else if (!field.validity.valid) fieldError(field, field.validationMessage);
    });
    const firstInvalid = fields.find(function (field) { return !field.validity.valid; });
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The server returned an unreadable response. Please try again.");
      }
      if (response.status === 400 && data && data.error === "VALIDATION_ERROR" &&
          data.fields && typeof data.fields === "object" && !Array.isArray(data.fields)) {
        fields.forEach(function (field) {
          if (Object.hasOwn(data.fields, field.name) && typeof data.fields[field.name] === "string") {
            fieldError(field, data.fields[field.name]);
            if (focusTarget === summary) focusTarget = field;
          }
        });
        showError("Please review your details. " + Object.values(data.fields).filter(function (message) {
          return typeof message === "string";
        }).join(" "));
      } else if (!response.ok) {
        throw new Error("Your request could not be completed (HTTP " + response.status + "). Please try again.");
      } else if (response.status !== 201 || !data || data.success !== true ||
          data.status !== "request_received" || data.durationMinutes !== 20 ||
          typeof data.ticketId !== "string" || !/^GW-\d+-[0-9a-f-]{36}$/.test(data.ticketId)) {
        throw new Error("The server did not confirm your request. Please try again.");
      } else {
        // The submitted date/time is already local to the selected timezone.
        const preferredTime = new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC", dateStyle: "full", timeStyle: "short"
        }).format(new Date(payload.date + "T" + payload.time + ":00Z"));
        form.reset();
        timezone.value = localTimezone;
        updateSlots();
        result.textContent = "Thank you, " + payload.name + ". Your consultation request has been received. " +
          "Preferred time: " + preferredTime + " (" + payload.timezone.replaceAll("_", " ") + ").";
        result.hidden = false;
        focusTarget = result;
      }
    } catch (error) {
      showError(controller.signal.aborted ?
        "The request timed out. It may have been received; a booking has not been confirmed." :
        error instanceof TypeError ? "Unable to connect. Please check your connection and try again." :
        error.message);
    } finally {
      clearTimeout(timeout);
      pending = false;
      controls.disabled = false;
      form.removeAttribute("aria-busy");
      submit.textContent = "Request consultation";
      focusTarget.focus();
    }
  });

  form.noValidate = true;
  updateSlots();
  controls.disabled = false;
})();
