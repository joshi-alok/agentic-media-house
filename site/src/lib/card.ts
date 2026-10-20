import { PUBLICATION_WORDMARK } from '@robywire/gate';
import type { Basis, LedgerEntry } from '@robywire/gate';
import { plural } from './format';

// The fact card: a 1200 by 630 picture drawn from a piece's own ledger. It is
// an SVG written by this file and nothing else: no image, no link, no web
// font. The same ledger always gives the same bytes. It is drawn twice, from
// one drawing: as a file (card.svg, the share image), in the light design
// tokens, and inline in the article page, where its colours are the CSS
// variables of the tokens, so that it follows the colour scheme of the page.
// A test checks both sets of colours.

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export const CARD_COLOURS = {
  background: '#FFFFFF',
  frame: '#C9CDD2',
  rule: '#E4E7EA',
  text: '#14181D',
  quiet: '#5B6470',
  link: '#1B66DF',
} as const;

/** The same colours as variables of the design tokens, for the card inside a page. */
export const INLINE_CARD_COLOURS: Readonly<Record<keyof typeof CARD_COLOURS, string>> = {
  background: 'var(--bg)',
  frame: 'var(--line-2)',
  rule: 'var(--line)',
  text: 'var(--t1)',
  quiet: 'var(--t2)',
  link: 'var(--link)',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Written as a code so that this file stays plain ASCII.
const ELLIPSIS = String.fromCharCode(0x2026);

const LEFT = 72;
const RIGHT = CARD_WIDTH - LEFT;
const TITLE_LINES = 3;
const TITLE_CHARS = 34;
const FIGURE_COLUMNS = [72, 430, 788];

// XML 1.0 forbids the control characters other than tab, line feed and carriage return.
// The class is built from character codes so that this file stays plain ASCII.
const code = String.fromCharCode;
const FORBIDDEN = new RegExp(`[${code(0)}-${code(8)}${code(11)}${code(12)}${code(14)}-${code(31)}]`, 'g');

/** `text` with the five characters XML cares about replaced, and the characters XML 1.0 forbids removed. */
export function escapeXml(text: string): string {
  return text
    .replace(FORBIDDEN, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Break `text` into lines of at most `maxChars` characters, at spaces, and at most `maxLines` lines.
 * A word longer than a line is cut. If the text needs more lines, the last line is shortened and
 * ends with an ellipsis.
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 2) throw new RangeError(`wrapText: maxChars must be a whole number of at least 2, not ${maxChars}`);
  if (!Number.isInteger(maxLines) || maxLines < 1) throw new RangeError(`wrapText: maxLines must be a whole number of at least 1, not ${maxLines}`);

  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((item) => item !== '')) {
    for (let start = 0; start < word.length; start += maxChars) {
      const piece = word.slice(start, start + maxChars);
      if (line === '') line = piece;
      else if (line.length + 1 + piece.length <= maxChars) line += ` ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line !== '') lines.push(line);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, maxChars - 1).trimEnd()}${ELLIPSIS}`;
  return kept;
}

/**
 * Where a claim's figure comes from, in plain words, for each basis a claim can have. The card draws
 * the words under the label of each figure, and the label of the card for assistive technology says them.
 */
export const BASIS_WORDS: Readonly<Record<Basis, string>> = {
  docs: 'documentation',
  announcement: 'announcement',
  briefing: 'briefing',
  demo: 'demonstration',
  filing: 'filing',
  paper: 'paper',
  standard: 'standard',
  measured: 'measured',
  reported: 'another outlet',
};

export interface CardFigure {
  value: string;
  label: string;
  /** Where the figure comes from, in plain words (`BASIS_WORDS`). */
  basis: string;
}

/**
 * Up to three figures for the card: the first three claims of type `number` from a tier-1 source, in
 * the order the article cites them. A claim from another outlet (tier 2) is never drawn: the card is
 * the headline of the piece and has no room to say that a figure is only reported. A figure is the
 * claim's first number value, or its first value of any kind, and a claim with no value is skipped.
 * Each figure carries the basis of its claim in plain words. A piece with no such claim has no figures.
 */
export function cardFigures(entry: LedgerEntry): CardFigure[] {
  const byId = new Map(entry.claims.map((claim) => [claim.id, claim]));
  const figures: CardFigure[] = [];
  for (const id of entry.order) {
    const claim = byId.get(id);
    if (claim === undefined || claim.type !== 'number' || claim.source.tier !== 1) continue;
    const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
    if (value === undefined) continue;
    figures.push({ value: value.raw, label: claim.label, basis: BASIS_WORDS[claim.basis] });
    if (figures.length === 3) break;
  }
  return figures;
}

/** The host of the first source the article cites, or undefined if it cites none. */
function leadHost(entry: LedgerEntry): string | undefined {
  const first = entry.claims.find((claim) => claim.id === entry.order[0]);
  return first === undefined ? undefined : new URL(first.source.url).hostname;
}

/** The longest a figure may be, in characters. A longer one is cut with an ellipsis. */
const FIGURE_CHARS = 15;

/** The type size of the figures: all three share one, chosen so that the longest fits its column. */
function figureSize(longest: number): number {
  if (longest <= 8) return 64;
  return longest <= 12 ? 52 : 44;
}

function text(role: string, x: number, y: number, size: number, weight: number, fill: string, content: string, extra = ''): string {
  return `<text data-role="${role}" x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${escapeXml(content)}</text>`;
}

/**
 * The drawing of the card in the given colours, below the lines that open the svg element.
 * `head` is those lines: the opening tag and, for the file, the title.
 */
function drawCard(entry: LedgerEntry, colours: Readonly<Record<keyof typeof CARD_COLOURS, string>>, head: string[]): string {
  const { background, frame, rule, text: ink, quiet, link } = colours;
  const parts: string[] = [
    ...head,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${background}"/>`,
    `<rect x="24.5" y="24.5" width="${CARD_WIDTH - 49}" height="${CARD_HEIGHT - 49}" fill="none" stroke="${frame}" stroke-width="1"/>`,
    text('wordmark', LEFT, 100, 26, 600, ink, PUBLICATION_WORDMARK, ' letter-spacing="6"'),
  ];

  wrapText(entry.title, TITLE_CHARS, TITLE_LINES).forEach((line, index) => {
    parts.push(text('title', LEFT, 190 + index * 62, 52, 600, ink, line));
  });

  const figures = cardFigures(entry).map((figure) => ({
    value: wrapText(figure.value, FIGURE_CHARS, 1)[0] ?? '',
    label: wrapText(figure.label, 26, 1)[0] ?? '',
    basis: figure.basis,
  }));
  const size = figureSize(Math.max(0, ...figures.map((figure) => figure.value.length)));
  figures.forEach((figure, index) => {
    parts.push(text('figure', FIGURE_COLUMNS[index]!, 432, size, 400, link, figure.value, ' letter-spacing="-1"'));
    parts.push(text('figure-label', FIGURE_COLUMNS[index]!, 470, 22, 400, quiet, figure.label));
    parts.push(text('figure-basis', FIGURE_COLUMNS[index]!, 498, 20, 400, quiet, figure.basis));
  });

  parts.push(`<line x1="${LEFT}" y1="530" x2="${RIGHT}" y2="530" stroke="${rule}" stroke-width="1"/>`);
  const counts = `${plural(entry.claims.length, 'claim', 'claims')} from ${plural(entry.sources.length, 'source', 'sources')}`;
  parts.push(text('counts', LEFT, 574, 24, 400, quiet, counts));
  const host = leadHost(entry);
  if (host !== undefined) parts.push(text('host', RIGHT, 574, 24, 400, quiet, host, ' text-anchor="end"'));

  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}

/** The fact card of a piece as an SVG document: the file that is served as card.svg and drawn into card.png. */
export function renderCardSvg(entry: LedgerEntry): string {
  return drawCard(entry, CARD_COLOURS, [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${escapeXml(entry.title)}">`,
    `<title>${escapeXml(entry.title)}</title>`,
  ]);
}

/**
 * The fact card to put inside a page. It is the same drawing in the colours of the design tokens as CSS
 * variables. It has no size of its own (the stylesheet gives it the width of the column) and no label: the
 * figure around it carries `cardLabel`, so assistive technology reads the card once.
 */
export function renderInlineCardSvg(entry: LedgerEntry): string {
  return drawCard(entry, INLINE_CARD_COLOURS, [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" aria-hidden="true" focusable="false">`]);
}

/**
 * What a reader who cannot see the card is told: that it is the fact card, the title, and the figures it
 * shows, each with the label it has and where it comes from.
 */
export function cardLabel(entry: LedgerEntry): string {
  const figures = cardFigures(entry).map((figure) => `${figure.label} ${figure.value} (${figure.basis})`);
  return figures.length === 0 ? `Fact card: ${entry.title}` : `Fact card: ${entry.title} (key figures: ${figures.join(', ')})`;
}
