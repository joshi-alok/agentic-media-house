// Escaping for the MDX renderer. A sentence comes from a model, so it is
// treated as hostile text: after escaping, an MDX parser must read it as plain
// prose and nothing else. site/test/escape-mdx.test.ts runs a hostile list
// through the MDX parser that Astro uses, configured as the site configures it.
//
// This module assumes GitHub-flavoured Markdown is off (site/markdown-features.mjs).
// With it on, a bare web or email address in a sentence becomes a link whatever
// is escaped, so the test fails if someone turns it on.

/** Characters that are escaped wherever they appear, by a backslash in front. */
const ALWAYS = /[\\`*_{}<>[\]&]/g;

/** MDX reads a line that starts with `import` or `export` as JavaScript. */
const ESM_KEYWORD = /^(\s*)(import|export)(?![\p{L}\p{N}_])/u;

/** A character that starts a heading, a list item, a setext underline or a thematic break. */
const LINE_START = /^(\s*)([#+=-]|\d+[.)])/;

function escapeLineStart(line: string): string {
  const withKeyword = line.replace(ESM_KEYWORD, (_whole, space: string, word: string) => {
    // A backslash before a letter would show up in the page. A numeric
    // character reference for the first letter hides the keyword from MDX and
    // is shown as the letter.
    return `${space}&#${word.charCodeAt(0)};${word.slice(1)}`;
  });
  return withKeyword.replace(LINE_START, (_whole, space: string, marker: string) => {
    // A numbered marker is escaped on its last character: "1." becomes "1\.".
    return /^\d/.test(marker) ? `${space}${marker.slice(0, -1)}\\${marker.slice(-1)}` : `${space}\\${marker}`;
  });
}

/**
 * `text` made safe as MDX prose. Every character that MDX or Markdown could act
 * on is escaped, and the characters that only matter at the start of a line (`#`,
 * `-`, `+`, `=`, a list number, `import`, `export`) are escaped on every line of
 * the text. Rendered, the result reads exactly like `text`.
 */
export function escapeMdx(text: string): string {
  return text
    .replace(ALWAYS, (char) => `\\${char}`)
    .split('\n')
    .map(escapeLineStart)
    .join('\n');
}
