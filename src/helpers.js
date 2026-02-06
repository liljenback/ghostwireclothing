const Handlebars = require("handlebars");

Handlebars.registerHelper("addClass", function (test, className) {
  return test ? ` ${className}` : "";
});
Handlebars.registerHelper("eq", function (value, test) {
  return value === test;
});
Handlebars.registerHelper("json", function (context) {
  return new Handlebars.SafeString(JSON.stringify(context));
});
