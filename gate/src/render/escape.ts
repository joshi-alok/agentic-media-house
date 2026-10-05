// Escaping for the MDX renderer. A sentence comes from a model, so it is
// treated as hostile text: after escaping, an MDX parser must read it as plain
// prose and nothing else. The rules were checked against the MDX parser that
// Astro uses (site/test/escape-mdx.test.ts runs a hostile list through it).

/** Characters that are escaped wherever they appear, by a backslash in front. */
const ALWAYS = /[\\`*_{}<>[\]~&|]/g;

/** `://` starts a GFM autolink literal. Escaping the slashes keeps the URL as text. */
const SCHEME = /:\/\//g;

/** `www.` starts a GFM autolink literal. */
const WWW = /\bwww\./gi;

/** An at sign makes an email address into a link. */
const AT_SIGN = /@/g;

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
 * `text` made safe as MDX prose. Every character MDX or GFM could act on is
 * escaped, and the characters that only matter at the start of a line (`#`,
 * `-`, `+`, `=`, a list number, `import`, `export`) are escaped on every line of
 * the text. Rendered, the result reads exactly like `text`.
 */
export function escapeMdx(text: string): string {
  return text
    .replace(ALWAYS, (char) => `\\${char}`)
    .replace(SCHEME, ':\\/\\/')
    .replace(WWW, (found) => `${found.slice(0, 3)}\\.`)
    .replace(AT_SIGN, '\\@')
    .split('\n')
    .map(escapeLineStart)
    .join('\n');
}
