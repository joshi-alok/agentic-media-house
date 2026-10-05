import { cssViolations } from './css-rules.mjs';
import { allElements, attr, elements } from './dom.mjs';
import { result } from './result.mjs';

// The checks that read the CSS of the built site: the files in _astro/, the
// <style> elements and the style attributes. Every check takes the model of the
// site (see site.mjs) and returns { id, ok, problems }.

/** Elements that browsers set in italics unless a stylesheet says otherwise. */
const ITALIC_ELEMENTS = {
  i: 'an <i> element',
  em: 'an <em> element',
  cite: 'a <cite> element, which browsers set in italics',
  dfn: 'a <dfn> element, which browsers set in italics',
  address: 'an <address> element, which browsers set in italics',
  var: 'a <var> element, which browsers set in italics',
};

/**
 * A5: no italics: no <i> or <em> element (or another that browsers set in italics), and no CSS that sets italic text.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoItalics(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    for (const [tag, description] of Object.entries(ITALIC_ELEMENTS)) {
      if (elements(page.document, tag).length > 0) problems.push(`${page.file}: has ${description}`);
    }
  }
  for (const sheet of site.stylesheets) {
    for (const violation of cssViolations(sheet.css)) {
      if (violation.rule === 'italic') problems.push(`${sheet.where}: ${violation.message}`);
    }
  }
  return result('A5', problems);
}

/** Hosts that serve web fonts. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net', 'fonts.bunny.net', 'use.fontawesome.com'];

const FONT_FILE = /\.(woff2?|ttf|otf|eot)$/i;

/**
 * A6: no web fonts: no @font-face, no request to a font host, no font preload and no font file in the build.
 * @param {import('./site.mjs').Site} site
 */
export function checkNoWebFonts(site) {
  /** @type {string[]} */
  const problems = [];
  for (const page of site.pages) {
    for (const element of allElements(page.document)) {
      const address = `${attr(element, 'href') ?? ''} ${attr(element, 'src') ?? ''}`;
      for (const host of FONT_HOSTS) {
        if (address.includes(host)) problems.push(`${page.file}: loads from ${host}`);
      }
      if (element.tagName === 'link' && attr(element, 'as') === 'font') problems.push(`${page.file}: preloads a font`);
    }
  }
  for (const sheet of site.stylesheets) {
    for (const violation of cssViolations(sheet.css)) {
      if (violation.rule === 'font-face') problems.push(`${sheet.where}: ${violation.message}`);
    }
    for (const host of FONT_HOSTS) {
      if (sheet.css.includes(host)) problems.push(`${sheet.where}: loads from ${host}`);
    }
  }
  for (const file of [...site.paths].sort()) {
    if (FONT_FILE.test(file)) problems.push(`${file}: is a font file`);
  }
  return result('A6', problems);
}

/**
 * A7: the hairline law: no border wider than one pixel and no rounded corner.
 * @param {import('./site.mjs').Site} site
 */
export function checkHairlines(site) {
  return result(
    'A7',
    site.stylesheets.flatMap((sheet) =>
      cssViolations(sheet.css)
        .filter((violation) => violation.rule === 'border' || violation.rule === 'radius')
        .map((violation) => `${sheet.where}: ${violation.message}`),
    ),
  );
}

/**
 * The colours the tokens file declares, as lowercase six-digit hex.
 * @param {string} tokensCss
 * @returns {Set<string>}
 */
function tokenColours(tokensCss) {
  const source = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...source.matchAll(/--[a-z0-9-]+\s*:\s*(#[0-9a-f]{3,8})(?![0-9a-z])/gi)].map((match) => normaliseHex(match[1])));
}

/**
 * A hex colour in lowercase with its short form expanded: "#FFF" is "#ffffff".
 * @param {string} hex
 * @returns {string}
 */
function normaliseHex(hex) {
  const lower = hex.toLowerCase();
  if (lower.length === 4 || lower.length === 5) return `#${[...lower.slice(1)].map((digit) => digit + digit).join('')}`;
  return lower;
}

const HEX_COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/gi;
const FUNCTION_COLOUR = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;

/**
 * The colours written in some CSS, as normalised hex or as "rgb()". Only the inside of rule blocks is read, so an id selector such as #add is not a colour.
 * @param {string} css
 * @returns {string[]}
 */
function coloursIn(css) {
  const declarations = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{[^{}]*\}/g) ?? []).join(' ');
  return [...declarations.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])).concat([...declarations.matchAll(FUNCTION_COLOUR)].map((match) => `${match[1].toLowerCase()}()`));
}

/** The attributes of an SVG element that paint something. */
const PAINT_ATTRIBUTES = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color'];

/**
 * The colours written in the paint attributes of the inline <svg> elements of a page, as normalised hex or as "rgb()".
 * A reference such as url(#gradient) is not a colour, so it is left out before the attribute is read.
 * @param {import('./site.mjs').Page} page
 * @returns {string[]}
 */
function inlineSvgColours(page) {
  return elements(page.document, 'svg')
    .flatMap((svg) => allElements(svg))
    .flatMap((element) => PAINT_ATTRIBUTES.map((name) => (attr(element, name) ?? '').replace(/url\([^)]*\)/gi, '')))
    .flatMap((value) => [...value.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])).concat([...value.matchAll(FUNCTION_COLOUR)].map((match) => `${match[1].toLowerCase()}()`)));
}

/**
 * A12: the colour law: every colour in the CSS, in the SVG files and in the colour attributes of an inline SVG in a page is one of the colours the tokens file defines.
 * A colour that is a variable, such as var(--bg), is the tokens' own and passes.
 * @param {import('./site.mjs').Site} site
 * @param {string} tokensCss  The text of src/styles/tokens.css.
 */
export function checkColourLaw(site, tokensCss) {
  const allowed = tokenColours(tokensCss);
  if (allowed.size === 0) throw new Error('checkColourLaw: the tokens file defines no colour, so there is nothing to check the site against');

  /** @type {{ where: string, colours: string[] }[]} */
  const places = site.stylesheets.map((sheet) => ({ where: sheet.where, colours: coloursIn(sheet.css) }));
  for (const [file, text] of site.files) {
    if (file.endsWith('.svg')) places.push({ where: file, colours: [...text.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])) });
  }
  for (const page of site.pages) places.push({ where: `${page.file} (inline svg)`, colours: inlineSvgColours(page) });

  /** @type {string[]} */
  const problems = [];
  for (const place of places) {
    for (const colour of new Set(place.colours)) {
      if (!allowed.has(colour)) problems.push(`${place.where}: ${colour} is not a colour of the design tokens`);
    }
  }
  return result('A12', problems);
}
