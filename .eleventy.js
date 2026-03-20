const Handlebars = require("handlebars");
const sass = require("sass");
const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {
  // Handlebars helpers
  eleventyConfig.addHandlebarsHelper("addClass", function (test, className) {
    return test ? ` ${className}` : "";
  });
  eleventyConfig.addHandlebarsHelper("eq", function (value, test) {
    return value === test;
  });
  eleventyConfig.addHandlebarsHelper("json", function (context) {
    return new Handlebars.SafeString(JSON.stringify(context));
  });

  // Compile SCSS before build — write to public/css/ (output dir)
  // style.css is in watchIgnores so writing here won't retrigger a rebuild
  eleventyConfig.on("eleventy.before", () => {
    const scssInput = path.join(__dirname, "src", "style.scss");
    const cssOutput = path.join(__dirname, "public", "css", "style.css");
    const result = sass.compile(scssInput);
    fs.writeFileSync(cssOutput, result.css);
    console.log("SCSS compiled successfully to public/css/style.css");
  });

  // Watch SCSS source for changes during --serve
  eleventyConfig.addWatchTarget("src/style.scss");

  // Ignore the compiled CSS so writing it doesn't retrigger a rebuild loop
  eleventyConfig.watchIgnores.add("public/css/style.css");

  return {
    dir: {
      input: "src",
      output: "public",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["hbs"],
    htmlTemplateEngine: "hbs",
  };
};
