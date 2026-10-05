// The rules of the design register that can be read from CSS, written once.
// test/contrast.test.ts applies them to the stylesheets in src/, and the audit
// applies them to the CSS of the built site, which is minified.

/**
 * @typedef {object} CssViolation
 * @property {'italic' | 'font-face' | 'radius' | 'border'} rule
 * @property {string} message
 */

/**
 * What is wrong with some CSS: italic text, a web font, a rounded corner or a
 * border wider than one pixel. An empty list means it keeps the rules. Comments
 * are ignored. A two-pixel outline is not a border.
 *
 * @param {string} css
 * @returns {CssViolation[]}
 */
export function cssViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {CssViolation[]} */
  const found = [];
  if (/font-style\s*:\s*italic/i.test(source)) found.push({ rule: 'italic', message: 'uses font-style: italic' });
  if (/@font-face/i.test(source)) found.push({ rule: 'font-face', message: 'declares a web font with @font-face' });

  for (const match of source.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]*)/gi)) {
    const values = match[1].replace(/!important/i, '').trim().split(/[\s/]+/);
    if (!values.every((value) => /^0(px|rem|em|%)?$/.test(value))) found.push({ rule: 'radius', message: `has a rounded corner: ${match[0].trim()}` });
  }

  for (const match of source.matchAll(/(?<![a-z-])border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?\s*:\s*([^;}]*)/gi)) {
    const value = match[1];
    const message = `has a border wider than 1px: ${match[0].trim()}`;
    if (/\b(medium|thick)\b/i.test(value)) found.push({ rule: 'border', message });
    for (const size of value.matchAll(/(\d*\.?\d+)\s*(px|rem|em)\b/gi)) {
      const pixels = Number(size[1]) * (size[2].toLowerCase() === 'px' ? 1 : 16);
      if (pixels > 1) found.push({ rule: 'border', message });
    }
  }
  return found;
}
