import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { cssViolations } from '../scripts/audit/css-rules.mjs';
import { renderInlineCardSvg } from '../src/lib/card';

// The design register is quiet, thin and grey, and it has rules that a
// reviewer would otherwise have to check by eye: text must be readable in both
// colour schemes, borders are one pixel, corners are square, nothing is
// italic, there are no web fonts and no images. This file turns the rules
// into tests that read the real stylesheets and templates.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

// --- WCAG contrast ----------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a colour written as #rrggbb. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio of two #rrggbb colours, from 1 (identical) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('contrast', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#5B6470', '#5B6470')).toBeCloseTo(1, 5);
  });

  it('does not depend on which colour is the text', () => {
    expect(contrast('#14181D', '#FFFFFF')).toBeCloseTo(contrast('#FFFFFF', '#14181D'), 10);
  });

  it('matches the well-known values for grey on white', () => {
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

// --- Tokens -----------------------------------------------------------------

function declarations(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) found[match[1]!] = match[2]!.trim();
  return found;
}

/** The light tokens (:root) and the dark tokens (inside the prefers-color-scheme: dark media query). */
function readTokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const media = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/.exec(css);
  if (media === null) throw new Error('tokens.css has no @media (prefers-color-scheme: dark) block');
  const start = media.index + media[0].length;
  let depth = 1;
  let end = start;
  while (end < css.length && depth > 0) {
    if (css[end] === '{') depth++;
    if (css[end] === '}') depth--;
    end++;
  }
  const root = (block: string): string => /:root\s*\{([^}]*)\}/.exec(block)?.[1] ?? '';
  return { light: declarations(root(css.slice(0, media.index) + css.slice(end))), dark: declarations(root(css.slice(start, end - 1))) };
}

const tokens = readTokens(readFileSync(path.join(SRC, 'styles', 'tokens.css'), 'utf8'));
const SCHEMES = [
  ['light', tokens.light],
  ['dark', tokens.dark],
] as const;
const TEXT_TOKENS = ['t1', 't2', 'link', 'pass', 'fail'];
const GROUNDS = ['bg', 'paper'];
const ALL_TOKENS = ['bg', 'paper', 'line', 'line-2', ...TEXT_TOKENS];

describe('tokens.css', () => {
  it.each(SCHEMES)('defines every colour token in the %s scheme as a six-digit hex colour', (_scheme, values) => {
    for (const name of ALL_TOKENS) expect(values[name], name).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  const cases = SCHEMES.flatMap(([scheme, values]) => TEXT_TOKENS.flatMap((text) => GROUNDS.map((ground) => [scheme, text, ground, values] as const)));

  it.each(cases)('%s scheme: %s text on %s reaches 4.5:1', (_scheme, text, ground, values) => {
    expect(contrast(values[text]!, values[ground]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the two schemes apart: dark text is light and the dark ground is dark', () => {
    expect(luminance(tokens.dark.bg!)).toBeLessThan(0.05);
    expect(luminance(tokens.dark.t1!)).toBeGreaterThan(0.5);
    expect(luminance(tokens.light.bg!)).toBeGreaterThan(0.9);
  });
});

// --- The fact card inside an article -----------------------------------------

describe('the fact card inside an article', () => {
  // The card is drawn in the colours of the tokens, as CSS variables, so it follows the colour scheme of
  // the page. The ground is the page's own ground; this reads the card that is drawn, takes the token each
  // text is painted with, and checks that text against the ground in both schemes.
  const FIXTURE = new URL('content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', new URL('../src/', import.meta.url));
  const svg = renderInlineCardSvg(LedgerEntry.parse(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
  const tokenOf = (paint: string): string => /^var\(--([a-z0-9-]+)\)$/.exec(paint)?.[1] ?? paint;
  const ground = tokenOf(/<rect width="1200" height="630" fill="([^"]*)"/.exec(svg)?.[1] ?? '');
  const texts = [...new Map([...svg.matchAll(/<text data-role="([^"]*)"[^>]* fill="([^"]*)"/g)].map((match) => [match[1]!, tokenOf(match[2]!)] as const))];

  it('is painted on the ground of the page, and every text on it is painted with a token', () => {
    expect(ground).toBe('bg');
    expect(texts.map(([role]) => role)).toEqual(['wordmark', 'title', 'figure', 'figure-label', 'figure-basis', 'counts', 'host']);
    for (const [role, token] of texts) expect(TEXT_TOKENS, role).toContain(token);
  });

  const cases = SCHEMES.flatMap(([scheme, values]) => texts.map(([role, token]) => [scheme, role, token, values] as const));

  it.each(cases)('%s scheme: the %s of the card, in --%s, reaches 4.5:1 on the ground', (_scheme, _role, token, values) => {
    expect(contrast(values[token]!, values[ground]!)).toBeGreaterThanOrEqual(4.5);
  });
});

// --- The stylesheet and template rules ---------------------------------------

/**
 * What is wrong with a stylesheet or template, in words. An empty list means it keeps the rules.
 * The CSS rules are the audit's own (scripts/audit/css-rules.mjs); the markup rules are checked here.
 */
function lawViolations(source: string): string[] {
  const found = cssViolations(source).map((violation) => violation.message);
  if (/<(i|em)[\s>]/i.test(source)) found.push('uses an <i> or <em> element');
  if (/<img[\s>]/i.test(source)) found.push('uses an <img> element');
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(css|astro)$/.test(name) ? [full] : [];
  });
}

describe('the rules the detector knows', () => {
  it.each([
    ['italic text', '.a { font-style: italic; }', 'uses font-style: italic'],
    ['an <em> element', '<p>a <em>b</em></p>', 'uses an <i> or <em> element'],
    ['an <i> element', '<p>a <i>b</i></p>', 'uses an <i> or <em> element'],
    ['a web font', '@font-face { font-family: X; }', 'declares a web font with @font-face'],
    ['an image', '<img src="a.png" alt="">', 'uses an <img> element'],
    ['a rounded corner', '.a { border-radius: 4px; }', 'has a rounded corner: border-radius: 4px'],
    ['a rounded corner on one corner', '.a { border-top-left-radius: 50%; }', 'has a rounded corner: border-top-left-radius: 50%'],
    ['a two-pixel border', '.a { border: 2px solid red; }', 'has a border wider than 1px: border: 2px solid red'],
    ['a three-pixel bottom border', '.a { border-bottom: 3px solid red; }', 'has a border wider than 1px: border-bottom: 3px solid red'],
    ['a border width in rem', '.a { border-width: 0.5rem; }', 'has a border wider than 1px: border-width: 0.5rem'],
    ['a thick border', '.a { border: thick solid; }', 'has a border wider than 1px: border: thick solid'],
  ])('flags %s', (_label, source, expected) => {
    expect(lawViolations(source)).toEqual([expected]);
  });

  it.each([
    ['a hairline border', '.a { border: 1px solid var(--line); }'],
    ['no border', '.a { border: none; border-top: 0; }'],
    ['square corners', '.a { border-radius: 0; border-radius: 0 !important; }'],
    ['a two-pixel outline, which is not a border', '.a { outline: 2px solid var(--link); }'],
    ['a two-pixel underline thickness', '.a { text-decoration-thickness: 2px; }'],
    ['a fractional hairline', '.a { border-bottom: 0.5px solid red; }'],
  ])('allows %s', (_label, source) => {
    expect(lawViolations(source)).toEqual([]);
  });
});

describe('the stylesheets and templates under site/src', () => {
  const files = sourceFiles(SRC);

  it('include the token and global stylesheets, so the rules are not checked against nothing', () => {
    const names = files.map((file) => path.basename(file));
    expect(names).toContain('tokens.css');
    expect(names).toContain('global.css');
  });

  it.each(files.map((file) => [path.relative(SRC, file), file] as const))('%s keeps the rules', (_name, file) => {
    expect(lawViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});

describe('the labels at the start of a sentence', () => {
  // "Analysis." and "Unconfirmed." are both written as bold text (a <strong> element). They share
  // one look, the browser's own, because no stylesheet says anything about <strong>: a rule that gave
  // one of them a colour or a style would have to give it to both, and the design allows neither.
  const css = sourceFiles(SRC)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');

  it('are left to the browser: no stylesheet has a rule for <strong>', () => {
    expect(css).toMatch(/body/);
    expect(css).not.toMatch(/(^|[^\w-])strong(?![\w-])/);
  });
});
