// The only two settings Eleventy cannot take from the constructor's `config` callback.
//
// markdownTemplateEngine: false — a release note is prose, not a template. Leave Liquid on
// and a note containing `{{ level_mm }}` or `{% if dry %}` in a code sample takes the whole
// build down with a Liquid parse error.
//
// keys.layout — renames Eleventy's `layout:` frontmatter key to `eleventyLayout`, which no
// file in this example uses. `layout:` in a Markdown page therefore means unify's key and
// only unify's key, and there is exactly one layout system in the tree.
export default function () {
  return {
    markdownTemplateEngine: false,
    keys: { layout: "eleventyLayout" },
  };
}
