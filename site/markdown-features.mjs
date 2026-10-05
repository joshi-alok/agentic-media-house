// The parser features for every Markdown and MDX file the site builds. The
// astro config and the tests read this one object, so the tests parse text
// exactly the way the build does.
export const markdownFeatures = {
  // GitHub-flavoured Markdown would turn a bare "www.example.com" or
  // "me@example.com" in a sentence into a link, and no backslash escape stops
  // it. The site uses none of its features (tables, strikethrough, footnotes,
  // task lists), so it stays off.
  gfm: false,
  // The text on the page is the text the gate checked: no curly quotes, no
  // en dashes, no ellipsis characters added by the parser.
  smartPunctuation: false,
};
