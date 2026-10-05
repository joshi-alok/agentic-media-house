## Milestone 3 (part C) — The fact card, honest copy and the final check

**Goal:** finish the hardening of Plan 1. Parts A and B closed the holes in the gate and in the path from a cleared draft to a published page. Three gaps are left, and they are about what a reader sees and what the site says about itself. The fact card, the picture that stands in for a photograph, is drawn but never shown: it exists only as the share image, so no reader of an article ever sees it. Several sentences of the public copy describe as already running what Plan 1 does not build (the daily schedule, the private evidence store, the pipeline that writes the pieces, the hold pull request, the owner's release, the correction command). And the method page still describes the nine rules of the gate in words that were true of the first version of the gate and are not true of the gate that Part A made. The last task proves the whole of Milestones 0 to 3 from a clean install and writes down, in the plan, what is still not proven.

| Task | What it closes |
|---|---|
| 81 | The fact card is on the article page, drawn into it as an inline SVG inside a labelled figure, in the colours of the design tokens so that it follows the light and dark schemes; a new audit check (A17) fails any article without it; and the colour check (A12) now reads the colour attributes of inline SVG too. |
| 82 | One switchboard, `LIVE`, says which parts of the Desk are running (none are in Plan 1), and every sentence whose tense depends on it is written by a pure function that is tested with each flag on and off. The receipts intro, the footer, the home and feed descriptions and the method page stop claiming what is not built; the method page describes the nine rules as the code really enforces them, lists the known limits of the checks, lists the correction, hold and owner-release flows as not running yet, and says that the scoreboard is a floor, not a proof. |
| 83 | Milestone 3 is verified from a clean install (`npm ci`, then `npm run verify`), the "done when" line of every milestone is matched with the command that shows it, and what is deferred or known to be limited is written down. This task makes no commit. |

**Starting state:** Tasks 1 to 80 are finished and committed. `npm run typecheck`, `npm test`, `npm run evals:seeded` (53 of 53 cases caught), `npm run fixtures:check`, `npm run build`, `npm run build:fixtures`, `npm run audit` (15 checks) and `npm run audit:prod` (16 checks) pass. The fixture build has five pieces (`fx-1` to `fx-5`); the fifth is a draft that the gate held and the owner released. The fact card is a function of the ledger (`renderCardSvg` in `site/src/lib/card.ts`) that is served as `card.svg` and `card.png` and named in `og:image`, and nothing else shows it. The pages that say what the Desk is and does are the footer (`site/src/lib/nav.ts`), the receipts page, the home page, the feed and the method page (`site/src/lib/method.ts`, `site/src/pages/method/index.astro`).

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/site -- test/<name>.test.ts` (or `@robywire/gate`, `@robywire/evals`). Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything. A few tests guard a rule that already holds; the step says so and shows how to make the test fail on purpose.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong. The one exception is a test that pins a sentence or a number that a task says changes: those are edited, and the task shows each edit.
- No package is installed or changed in this milestone. The toolchain is the one of Milestones 0 to 2.
- Source files contain ASCII only. Never type a character outside ASCII into a source file. Code uses `String.fromCharCode` where it needs one. A few lines that already exist in the tests contain an escape written with six ASCII characters (a backslash, `u`, and four hexadecimal digits, such as the one for a curly apostrophe); where an edit below shows one, type those six characters exactly. If your tool turns one into the character itself, undo that, because the tests would then contain a character outside ASCII.
- Public copy rules still apply: nothing may be described in the present tense as working if Plan 1 does not build it. From Task 82 on, every sentence whose tense depends on a part of the Desk being live is written by a function that takes the `LIVE` switchboard, and a test shows what it says for every setting.
- A new check of the audit (`site/scripts/audit/`) needs a test in `site/test/audit.test.ts` that gives it pages it must accept and pages it must reject, and a place in the list `CHECKS` in `site/scripts/audit/checks.mjs`.
- The fixtures are fictional. The production build must contain none of them: `npm run audit:prod` (check A13) fails if it does.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task but the last ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** none are added. This milestone was verified with the versions of Milestones 0 to 2 (Node 22, TypeScript 6.0.3 in the repository root and `site` and 7.0.2 in `gate` and `evals`, Astro 7.3.5, Zod 4.6.5, Vitest 5.0.3).

---

### Task 81: The fact card is on the page

**Files:**
- Modify: `site/src/lib/card.ts` (the card is drawn from one drawing in two sets of colours; `cardLabel`)
- Modify: `site/src/pages/news/[slug]/index.astro`, `site/src/styles/article.css` (the card in the article)
- Modify: `site/scripts/audit/checks-links.mjs`, `site/scripts/audit/checks.mjs` (new audit check A17)
- Modify: `site/scripts/audit/checks-style.mjs` (check A12 reads inline SVG)
- Modify: `README.md` (the audit line)
- Test: `site/test/card.test.ts`, `site/test/contrast.test.ts`, `site/test/audit.test.ts`, `site/test/audit-run.test.ts`, `site/test/audit-cli.test.ts`

Every piece gets a fact card: a 1200 by 630 picture drawn from its own ledger, with the title and the three figures that the article cites first. The design allows no photographs and no `<img>`, so the card stands where a photograph would. But until now it was only a file, `card.svg` (and `card.png`), named in `og:image` so that a link shared on social media shows it. A reader who opens the article never saw it. The method page says "each piece gets a fact card", and the critic of Plan 1 found that nothing on the page showed one.

This task draws the card into the article, under the line that links to the receipts:

1. The card is drawn by one function in two sets of colours. The file keeps the light colours of the design tokens as plain hex values, as before, because a share image has no page around it. The card inside the page uses the colours as CSS variables (`var(--bg)`, `var(--t1)` and so on), so it follows the light and dark schemes of the page like everything else. The two come from one drawing, and a test proves it.
2. The card sits in a `<figure data-fact-card role="img">` whose `aria-label` is built from the title and the three figures. The SVG inside is hidden from assistive technology (`aria-hidden`) so a screen reader reads the card once, from the label. There is no `<img>`.
3. The text of the card must reach 4.5:1 against the card's ground in both colour schemes. A test reads the card as it is drawn, takes the token of each text, and checks it in both schemes.
4. A new audit check, **A17**, requires every article page to have a `figure[data-fact-card]` that has `role="img"`, a non-empty `aria-label` and an inline `<svg>`.
5. The colour check, A12, used to read the CSS and the SVG files but not the colour attributes of an SVG written into a page. It does now, so a hard-coded colour in the card would fail the audit.

- [ ] **Step 1: Write the failing tests for the card**

The inline card is the same drawing as the file, in the colours of the tokens as variables. It has no size of its own, because the page gives it the width of the column, and no label, because the figure carries it. The label names the card, the title and the figures, in the order the card shows them.

**In `site/test/card.test.ts`, replace:**
```ts
import { LedgerEntry } from '@robywire/gate';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { CARD_COLOURS, CARD_HEIGHT, CARD_WIDTH, cardFigures, escapeXml, renderCardSvg, wrapText } from '../src/lib/card';

const ELLIPSIS = String.fromCharCode(0x2026);
```

**with:**
```ts
import { LedgerEntry } from '@robywire/gate';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { CARD_COLOURS, CARD_HEIGHT, CARD_WIDTH, INLINE_CARD_COLOURS, cardFigures, cardLabel, escapeXml, renderCardSvg, renderInlineCardSvg, wrapText } from '../src/lib/card';

const ELLIPSIS = String.fromCharCode(0x2026);
```

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('is the same every time', () => {
    expect(renderCardSvg(GOLDEN)).toBe(svg);
```

**with:**
```ts
  });

  it('names itself for a reader of the file: role, label and title are the title of the piece', () => {
    const [opening, title] = svg.split('\n');
    expect(opening).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(GOLDEN.title)}">`,
    );
    expect(title).toBe(`<title>${escapeXml(GOLDEN.title)}</title>`);
  });

  it('is the same every time', () => {
    expect(renderCardSvg(GOLDEN)).toBe(svg);
```

**In `site/test/card.test.ts`, replace:**
```ts
    for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
  });
});
```

**with:**
```ts
    for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
  });
});

describe('cardLabel', () => {
  it('names the card, the title and the key figures, so that a reader who cannot see the picture gets them', () => {
    expect(cardLabel(GOLDEN)).toBe(
      `Fact card: ${GOLDEN.title} (key figures: funding round USD 450 million, cycle-time cut 18 per cent, list price $38,000)`,
    );
  });

  it('says the same figures as the card shows, in the same order', () => {
    const label = cardLabel(GOLDEN);
    const shown = textsWithRole(renderCardSvg(GOLDEN), 'figure');
    let from = 0;
    for (const figure of shown) {
      const at = label.indexOf(figure, from);
      expect(at, figure).toBeGreaterThanOrEqual(from);
      from = at + figure.length;
    }
  });

  it('gives the title alone when the piece has no figures', () => {
    expect(cardLabel(entryWith((copy) => copy.claims.forEach((claim) => (claim.type = 'event'))))).toBe(`Fact card: ${GOLDEN.title}`);
  });

  it('gives one figure without a list when there is one', () => {
    const entry = entryWith((copy) => {
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardLabel(entry)).toBe(`Fact card: ${GOLDEN.title} (key figures: funding round USD 450 million)`);
  });
});

describe('renderInlineCardSvg', () => {
  const inline = renderInlineCardSvg(GOLDEN);
  const file = renderCardSvg(GOLDEN);
  const colours = Object.keys(CARD_COLOURS) as (keyof typeof CARD_COLOURS)[];

  /** The drawing: everything except the opening tag of the svg element and its title. */
  const drawing = (svg: string): string =>
    svg
      .split('\n')
      .filter((line) => !line.startsWith('<svg') && !line.startsWith('<title'))
      .join('\n');

  it('is a well-formed XML document', () => {
    expect(xmlProblem(inline)).toBeUndefined();
  });

  it('is the same drawing as the card file, with the colours of the design tokens in place of their values', () => {
    const asFile = colours.reduce((text, name) => text.replaceAll(INLINE_CARD_COLOURS[name], CARD_COLOURS[name]), drawing(inline));
    expect(asFile).toBe(drawing(file));
  });

  it('has the size of the card as its shape, and none of its own, so that the page decides how large it is', () => {
    const [opening] = inline.split('\n');
    expect(opening).toContain('viewBox="0 0 1200 630"');
    expect(opening).not.toMatch(/\swidth=|\sheight=/);
  });

  it('is hidden from assistive technology, and cannot be focused, because the figure around it carries the label', () => {
    const [opening] = inline.split('\n');
    expect(opening).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" aria-hidden="true" focusable="false">');
    expect(inline).not.toMatch(/<title|\srole=|aria-label/);
  });

  it('writes every colour as a variable of the design tokens, so that it follows the colour scheme', () => {
    expect(inline).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    const painted = [...inline.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)].map((match) => match[1]!);
    expect(painted.length).toBeGreaterThan(8);
    const allowed = new Set<string>([...Object.values(INLINE_CARD_COLOURS), 'none']);
    for (const value of painted) expect(allowed.has(value), value).toBe(true);
  });

  it('uses the variables that hold the same colours as the card file does', () => {
    expect(INLINE_CARD_COLOURS).toEqual({
      background: 'var(--bg)',
      frame: 'var(--line-2)',
      rule: 'var(--line)',
      text: 'var(--t1)',
      quiet: 'var(--t2)',
      link: 'var(--link)',
    });
  });

  it('is the same every time', () => {
    expect(renderInlineCardSvg(structuredClone(GOLDEN))).toBe(inline);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/site -- test/card.test.ts`
Expected: FAIL — `renderInlineCardSvg is not a function`

- [ ] **Step 3: Write the card in two sets of colours, and the label**

The existing function `renderCardSvg` becomes `drawCard`, which takes the colours and the lines that open the `svg` element. The file and the inline card differ in those two things and nothing else.

**In `site/src/lib/card.ts`, replace:**
```ts
import { plural } from './format';

// The fact card: a 1200 by 630 picture drawn from a piece's own ledger, used
// as the share image. It is an SVG written by this file and nothing else: no
// image, no link, no web font. The same ledger always gives the same bytes.
// The colours are the light design tokens; a test checks that.

export const CARD_WIDTH = 1200;
```

**with:**
```ts
import { plural } from './format';

// The fact card: a 1200 by 630 picture drawn from a piece's own ledger. It is
// an SVG written by this file and nothing else: no image, no link, no web
// font. The same ledger always gives the same bytes. It is drawn twice, from
// one drawing: as a file (card.svg, the share image), in the light design
// tokens, and inline in the article page, where its colours are the CSS
// variables of the tokens, so that it follows the colour scheme of the page.
// A test checks both sets of colours.

export const CARD_WIDTH = 1200;
```

**In `site/src/lib/card.ts`, replace:**
```ts
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

```

**with:**
```ts
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

```

**In `site/src/lib/card.ts`, replace:**
```ts
}

/** The fact card of a piece as an SVG document. */
export function renderCardSvg(entry: LedgerEntry): string {
  const { background, frame, rule, text: ink, quiet, link } = CARD_COLOURS;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${escapeXml(entry.title)}">`,
    `<title>${escapeXml(entry.title)}</title>`,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${background}"/>`,
    `<rect x="24.5" y="24.5" width="${CARD_WIDTH - 49}" height="${CARD_HEIGHT - 49}" fill="none" stroke="${frame}" stroke-width="1"/>`,
```

**with:**
```ts
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
```

**In `site/src/lib/card.ts`, replace:**
```ts
  return `${parts.join('\n')}\n`;
}
```

**with:**
```ts
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

/** What a reader who cannot see the card is told: that it is the fact card, the title, and the figures it shows. */
export function cardLabel(entry: LedgerEntry): string {
  const figures = cardFigures(entry).map((figure) => `${figure.label} ${figure.value}`);
  return figures.length === 0 ? `Fact card: ${entry.title}` : `Fact card: ${entry.title} (key figures: ${figures.join(', ')})`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/card.test.ts test/card-png.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 5: Add the contrast test, and see it fail on purpose**

The test reads the SVG that `renderInlineCardSvg` really returns for the first fixture piece, finds the ground and the token that each text is painted with, and checks each text against the ground with the same WCAG function that checks the tokens themselves, in both schemes.

**In `site/test/contrast.test.ts`, replace:**
```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssViolations } from '../scripts/audit/css-rules.mjs';

// The design register is quiet, thin and grey, and it has rules that a
```

**with:**
```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { cssViolations } from '../scripts/audit/css-rules.mjs';
import { renderInlineCardSvg } from '../src/lib/card';

// The design register is quiet, thin and grey, and it has rules that a
```

**In `site/test/contrast.test.ts`, replace:**
```ts
});

// --- The stylesheet and template rules ---------------------------------------

```

**with:**
```ts
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
    expect(texts.map(([role]) => role)).toEqual(['wordmark', 'title', 'figure', 'figure-label', 'counts', 'host']);
    for (const [role, token] of texts) expect(TEXT_TOKENS, role).toContain(token);
  });

  const cases = SCHEMES.flatMap(([scheme, values]) => texts.map(([role, token]) => [scheme, role, token, values] as const));

  it.each(cases)('%s scheme: the %s of the card, in --%s, reaches 4.5:1 on the ground', (_scheme, _role, token, values) => {
    expect(contrast(values[token]!, values[ground]!)).toBeGreaterThanOrEqual(4.5);
  });
});

// --- The stylesheet and template rules ---------------------------------------

```

This test guards a rule that already holds, so it passes as soon as it is written.

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

Make it fail by painting the small texts of the card in the colour of a hairline, as a later change might. `sed -i.bak` leaves the original beside the file as `card.ts.bak`.

Run: `sed -i.bak "s/quiet: 'var(--t2)'/quiet: 'var(--line-2)'/" site/src/lib/card.ts`

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: FAIL — `dark scheme: the figure-label of the card, in --line-2, reaches 4.5:1 on the ground` and `expected [ 't1', 't2', 'link', 'pass', 'fail' ] to include 'line-2'`

Put the file back.

Run: `mv site/src/lib/card.ts.bak site/src/lib/card.ts`

Run: `npm test --workspace @robywire/site -- test/contrast.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Write the failing tests for the audit**

A17 has articles it must accept and articles it must reject, and each article is judged by itself. The colour check, A12, now reads the colour attributes of an inline SVG: it accepts the variables of the tokens, `none` and `currentColor`, rejects a hard-coded colour on any element inside the SVG, does not take a reference such as `url(#abc)` for a colour, and does not read a `fill` attribute outside an SVG.

**In `site/test/audit.test.ts`, replace:**
```ts
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks, checkUnconfirmedLabel } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
```

**with:**
```ts
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';
```

**In `site/test/audit.test.ts`, replace:**
```ts
  });

  it('does not take an id selector for a colour', () => {
    expect(checkColourLaw(withCss('#add{margin:0}#bad .x{margin:0}'), tokens)).toEqual(ok('A12'));
```

**with:**
```ts
  });

  it('reads the colour attributes of an inline SVG in a page, such as the fact card, and accepts the variables of the tokens', () => {
    const inline = (svg: string) => site({ 'index.html': page(`<h1>x</h1>${svg}`) });
    expect(checkColourLaw(inline('<svg><rect fill="var(--bg)" stroke="var(--link)"/><text fill="currentColor" stroke="none">x</text></svg>'), tokens)).toEqual(ok('A12'));
    expect(checkColourLaw(inline('<svg><rect fill="#FFFFFF" stroke="#1B66DF"/></svg>'), tokens)).toEqual(ok('A12'));
    expect(checkColourLaw(inline('<svg><rect fill="#ABCDEF"/><text stroke="rgb(1 2 3)">x</text></svg>'), tokens).problems).toEqual([
      'index.html (inline svg): #abcdef is not a colour of the design tokens',
      'index.html (inline svg): rgb() is not a colour of the design tokens',
    ]);
  });

  it('reads every attribute that paints in an inline SVG, and on any element inside it', () => {
    const inline = (svg: string) => site({ 'index.html': page(`<h1>x</h1>${svg}`) });
    const problems = checkColourLaw(inline('<svg color="#111111"><g><stop stop-color="#222222"/><feFlood flood-color="#333333"/><feDiffuseLighting lighting-color="#444444"/></g></svg>'), tokens).problems;
    expect(problems).toEqual(['index.html (inline svg): #111111 is not a colour of the design tokens', 'index.html (inline svg): #222222 is not a colour of the design tokens', 'index.html (inline svg): #333333 is not a colour of the design tokens', 'index.html (inline svg): #444444 is not a colour of the design tokens']);
  });

  it('reads a function colour written in capitals in an inline SVG', () => {
    expect(checkColourLaw(site({ 'index.html': page('<h1>x</h1><svg><rect stroke="RGB(0 0 0)"/></svg>') }), tokens).problems).toEqual([
      'index.html (inline svg): rgb() is not a colour of the design tokens',
    ]);
  });

  it('does not take a reference such as url(#abc) in an inline SVG for a colour', () => {
    expect(checkColourLaw(site({ 'index.html': page('<h1>x</h1><svg><rect fill="url(#abc)"/></svg>') }), tokens)).toEqual(ok('A12'));
  });

  it('does not read a fill attribute that is not inside an SVG', () => {
    expect(checkColourLaw(site({ 'index.html': page('<h1>x</h1><p fill="#ABCDEF">x</p>') }), tokens)).toEqual(ok('A12'));
  });

  it('does not take an id selector for a colour', () => {
    expect(checkColourLaw(withCss('#add{margin:0}#bad .x{margin:0}'), tokens)).toEqual(ok('A12'));
```

**In `site/test/audit.test.ts`, replace:**
```ts
});

describe('A13 checkNoFixtureLeakage', () => {
  it('accepts a build with no trace of the fixtures', () => {
```

**with:**
```ts
});

describe('A17 checkFactCard', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const SVG = '<svg viewBox="0 0 1200 630" aria-hidden="true"><rect width="1200" height="630" fill="var(--bg)"/></svg>';
  const card = (inner = SVG, attributes = 'role="img" aria-label="Fact card: A story"') => `<figure class="fact-card" data-fact-card ${attributes}>${inner}</figure>`;
  const article = (body: string) => page(`<h1>x</h1><div class="prose"><p>Text.</p></div>${body}`);

  it('accepts an article with its fact card: a labelled figure that holds an inline SVG', () => {
    expect(checkFactCard(site({ [ARTICLE]: article(card()) }))).toEqual(ok('A17'));
  });

  it('accepts a site with no article, such as a production build with no pieces', () => {
    expect(checkFactCard(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A17'));
  });

  it('judges each article by itself, and names the ones that fail', () => {
    const files = { 'news/a/index.html': article(card()), 'news/b/index.html': article(''), 'news/c/index.html': article(card()) };
    expect(checkFactCard(site(files))).toEqual({ id: 'A17', ok: false, problems: ['news/b/index.html: has no fact card (a <figure data-fact-card>)'] });
  });

  it('rejects an article with no figure for the card, even if an SVG is somewhere else on the page', () => {
    expect(checkFactCard(site({ [ARTICLE]: article(SVG) })).problems).toEqual([`${ARTICLE}: has no fact card (a <figure data-fact-card>)`]);
  });

  it('does not take a figure for the card unless it has the data-fact-card attribute', () => {
    expect(checkFactCard(site({ [ARTICLE]: article(`<figure class="fact-card" role="img" aria-label="Fact card">${SVG}</figure>`) })).problems).toEqual([
      `${ARTICLE}: has no fact card (a <figure data-fact-card>)`,
    ]);
  });

  it('rejects a card with no inline SVG, whether it is empty or holds something else', () => {
    expect(checkFactCard(site({ [ARTICLE]: article(card('')) })).problems).toEqual([`${ARTICLE}: its fact card has no inline <svg>`]);
    expect(checkFactCard(site({ [ARTICLE]: article(card('<p>A card.</p>')) })).problems).toEqual([`${ARTICLE}: its fact card has no inline <svg>`]);
    expect(checkFactCard(site({ [ARTICLE]: article(card('<img src="/news/a/card.svg" alt="">')) })).problems).toEqual([`${ARTICLE}: its fact card has no inline <svg>`]);
  });

  it('rejects a card that has no role="img" or no label, because a picture with no label says nothing to a screen reader', () => {
    expect(checkFactCard(site({ [ARTICLE]: article(card(SVG, 'aria-label="Fact card"')) })).problems).toEqual([`${ARTICLE}: its fact card needs role="img" and a non-empty aria-label`]);
    expect(checkFactCard(site({ [ARTICLE]: article(card(SVG, 'role="img"')) })).problems).toEqual([`${ARTICLE}: its fact card needs role="img" and a non-empty aria-label`]);
    expect(checkFactCard(site({ [ARTICLE]: article(card(SVG, 'role="img" aria-label="  "')) })).problems).toEqual([`${ARTICLE}: its fact card needs role="img" and a non-empty aria-label`]);
  });

  it('judges every card of an article, so a second, empty one is found', () => {
    expect(checkFactCard(site({ [ARTICLE]: article(card() + card('')) })).problems).toEqual([`${ARTICLE}: its fact card has no inline <svg>`]);
  });

  it('looks at articles only: the home page and the receipts pages need no card', () => {
    const files = { 'index.html': page('<h1>x</h1>'), [`news/${SLUG}/receipts/index.html`]: page('<h1>r</h1>'), [ARTICLE]: article(card()) };
    expect(checkFactCard(site(files))).toEqual(ok('A17'));
  });
});

describe('A13 checkNoFixtureLeakage', () => {
  it('accepts a build with no trace of the fixtures', () => {
```

The audit has seventeen checks, so the two tests that count them change.

**In `site/test/audit-run.test.ts`, replace:**
```ts

describe('CHECKS', () => {
  it('lists the checks A1 to A16 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 16 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
```

**with:**
```ts

describe('CHECKS', () => {
  it('lists the checks A1 to A17 in order, each with a title of its own', () => {
    expect(CHECKS.map((check) => check.id)).toEqual(Array.from({ length: 17 }, (_, index) => `A${index + 1}`));
    const titles = CHECKS.map((check) => check.title);
    expect(new Set(titles).size).toBe(titles.length);
```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 15 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
```

**with:**
```ts
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 16 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 16 checks.');
  });

```

**with:**
```ts
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 17 checks.');
  });

```

**In `site/test/audit-cli.test.ts`, replace:**
```ts
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 15 checks.');
  });

```

**with:**
```ts
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 16 checks.');
  });

```

Run: `npm test --workspace @robywire/site -- test/audit.test.ts test/audit-run.test.ts test/audit-cli.test.ts`
Expected: FAIL — `checkFactCard is not a function`, `A12 checkColourLaw > reads the colour attributes of an inline SVG in a page` and `lists the checks A1 to A17 in order`.

- [ ] **Step 7: Write the audit check and the change to A12**

A17 finds the figures of an article that have the `data-fact-card` attribute. It looks at articles only, so the home page and the receipts pages need no card, and it reports each figure that lacks the SVG or the label.

**In `site/scripts/audit/checks-links.mjs`, replace:**
```js
  return result('A16', problems);
}
```

**with:**
```js
  return result('A16', problems);
}

/**
 * A17: every article shows its fact card: a <figure data-fact-card> with role="img" and an aria-label that holds an inline <svg>.
 * The card is a picture, and the design allows no <img>, so it is drawn into the page; the label is what a screen reader reads in its place.
 * @param {import('./site.mjs').Site} site
 */
export function checkFactCard(site) {
  /** @type {string[]} */
  const problems = [];
  for (const { page } of articles(site)) {
    const figures = elements(page.document, 'figure').filter((figure) => attr(figure, 'data-fact-card') !== undefined);
    if (figures.length === 0) problems.push(`${page.file}: has no fact card (a <figure data-fact-card>)`);
    for (const figure of figures) {
      if (elements(figure, 'svg').length === 0) problems.push(`${page.file}: its fact card has no inline <svg>`);
      if (attr(figure, 'role') !== 'img' || (attr(figure, 'aria-label') ?? '').trim() === '') problems.push(`${page.file}: its fact card needs role="img" and a non-empty aria-label`);
    }
  }
  return result('A17', problems);
}
```

**In `site/scripts/audit/checks.mjs`, replace:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks, checkUnconfirmedLabel } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from './checks-style.mjs';
```

**with:**
```js
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from './checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkFactCard, checkInternalLinks, checkUnconfirmedLabel } from './checks-links.mjs';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from './checks-markup.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from './checks-style.mjs';
```

**In `site/scripts/audit/checks.mjs`, replace:**
```js
  { id: 'A10', title: 'The skip link is the first link on every page', run: checkSkipLink },
  { id: 'A11', title: 'Every claim marker points at its claim on the receipts page', run: checkClaimMarkers },
  { id: 'A12', title: 'Every colour belongs to the design tokens', run: (site, options) => checkColourLaw(site, options.tokensCss) },
  { id: 'A13', title: 'No fixture content in a production build', prodOnly: true, run: checkNoFixtureLeakage },
  { id: 'A14', title: 'Every XML file is well-formed', run: checkXmlWellFormed },
  { id: 'A15', title: 'robots.txt, the sitemap, the feed and the 404 page are there and agree', run: checkCrawlFiles },
  { id: 'A16', title: 'An article that cites a claim from another outlet carries the Unconfirmed. label', run: checkUnconfirmedLabel },
];

```

**with:**
```js
  { id: 'A10', title: 'The skip link is the first link on every page', run: checkSkipLink },
  { id: 'A11', title: 'Every claim marker points at its claim on the receipts page', run: checkClaimMarkers },
  { id: 'A12', title: 'Every colour in the CSS, the SVG files and the inline SVG belongs to the design tokens', run: (site, options) => checkColourLaw(site, options.tokensCss) },
  { id: 'A13', title: 'No fixture content in a production build', prodOnly: true, run: checkNoFixtureLeakage },
  { id: 'A14', title: 'Every XML file is well-formed', run: checkXmlWellFormed },
  { id: 'A15', title: 'robots.txt, the sitemap, the feed and the 404 page are there and agree', run: checkCrawlFiles },
  { id: 'A16', title: 'An article that cites a claim from another outlet carries the Unconfirmed. label', run: checkUnconfirmedLabel },
  { id: 'A17', title: 'Every article shows its fact card, a labelled figure with an inline SVG', run: checkFactCard },
];

```

A12 collects the colours of the paint attributes of every element inside an `svg` of a page, with any `url(...)` reference taken out first, and checks them the way it checks the CSS.

**In `site/scripts/audit/checks-style.mjs`, replace:**
```js
}

/**
 * A12: the colour law: every colour in the CSS, and in the SVG files, is one of the colours the tokens file defines.
 * @param {import('./site.mjs').Site} site
 * @param {string} tokensCss  The text of src/styles/tokens.css.
```

**with:**
```js
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
```

**In `site/scripts/audit/checks-style.mjs`, replace:**
```js
    if (file.endsWith('.svg')) places.push({ where: file, colours: [...text.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])) });
  }

  /** @type {string[]} */
```

**with:**
```js
    if (file.endsWith('.svg')) places.push({ where: file, colours: [...text.matchAll(HEX_COLOUR)].map((match) => normaliseHex(match[0])) });
  }
  for (const page of site.pages) places.push({ where: `${page.file} (inline svg)`, colours: inlineSvgColours(page) });

  /** @type {string[]} */
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/site -- test/audit.test.ts test/audit-run.test.ts test/audit-cli.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 9: Put the card in the article**

The page draws the card from the ledger of the piece and puts it after the line that links to the receipts. `set:html` writes the SVG as markup, and the label goes in the `aria-label` of the figure, which Astro escapes.

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
import CorrectionNotice from '../../../components/CorrectionNotice.astro';
import Base from '../../../layouts/Base.astro';
import { correctionsFor, getDeskState } from '../../../lib/desk-state';
import { formatDate, plural } from '../../../lib/format';
```

**with:**
```astro
import CorrectionNotice from '../../../components/CorrectionNotice.astro';
import Base from '../../../layouts/Base.astro';
import { cardLabel, renderInlineCardSvg } from '../../../lib/card';
import { correctionsFor, getDeskState } from '../../../lib/desk-state';
import { formatDate, plural } from '../../../lib/format';
```

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
const claims = plural(piece.ledger.claims.length, 'claim', 'claims');
const sources = plural(piece.ledger.sources.length, 'source', 'sources');
const jsonLd = jsonLdScript(newsArticleJsonLd({ slug: piece.slug, ...piece.data }, corrections, Astro.site.href));
---
```

**with:**
```astro
const claims = plural(piece.ledger.claims.length, 'claim', 'claims');
const sources = plural(piece.ledger.sources.length, 'source', 'sources');
const card = renderInlineCardSvg(piece.ledger);
const jsonLd = jsonLdScript(newsArticleJsonLd({ slug: piece.slug, ...piece.data }, corrections, Astro.site.href));
---
```

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
    </div>
    <p class="receipts-link">{claims} from {sources} &mdash; <a href={receiptsPath(piece.slug)}>see the receipts</a></p>
    <script type="application/ld+json" set:html={jsonLd} />
  </article>
```

**with:**
```astro
    </div>
    <p class="receipts-link">{claims} from {sources} &mdash; <a href={receiptsPath(piece.slug)}>see the receipts</a></p>
    <figure class="fact-card" data-fact-card role="img" aria-label={cardLabel(piece.ledger)} set:html={card} />
    <script type="application/ld+json" set:html={jsonLd} />
  </article>
```

The stylesheet gives the figure the width of the column (the same 65 characters as the text above it) and makes the SVG fill it, with its height following from its shape. It uses no colour and no border: the card draws its own hairline frame.

**In `site/src/styles/article.css`, replace:**
```css
  color: var(--t2);
}
```

**with:**
```css
  color: var(--t2);
}

/* The fact card: the piece's own picture, drawn into the page. It is as wide as the
   column and no wider; its colours are the tokens', so it follows the colour scheme. */
.fact-card {
  max-width: 65ch;
  margin: 1.5rem 0 0;
}

.fact-card svg {
  display: block;
  width: 100%;
  height: auto;
}
```

- [ ] **Step 10: Update the README**

**In `README.md`, replace:**
```markdown
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A16 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
```

**with:**
```markdown
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A17 on `site/dist`: HTML, links, receipts, the fact card, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
```

**In `README.md`, replace:**
```markdown
## The audit

`npm run audit` reads the built pages in `site/dist` and checks them against the rules of the design and of the content. The checks are listed, with a sentence for each, in `site/scripts/audit/checks.mjs`; every check has a test that gives it a page it must accept and a page it must reject. They include: every page parses and has one `h1`, a title, a description and a skip link; no images, no italics, no web fonts, no border over one pixel, no rounded corner; every colour is one of the design tokens in `site/src/styles/tokens.css`; every internal link and `#fragment` resolves; every article links to its receipts page and has `NewsArticle` data; every claim marker in an article leads to its claim; and the feed, the sitemap, `robots.txt` and the 404 page are there and agree.

## Reading the scoreboard
```

**with:**
```markdown
## The audit

`npm run audit` reads the built pages in `site/dist` and checks them against the rules of the design and of the content. The checks are listed, with a sentence for each, in `site/scripts/audit/checks.mjs`; every check has a test that gives it a page it must accept and a page it must reject. They include: every page parses and has one `h1`, a title, a description and a skip link; no images, no italics, no web fonts, no border over one pixel, no rounded corner; every colour, in the CSS and in the colour attributes of an inline SVG, is one of the design tokens in `site/src/styles/tokens.css`; every internal link and `#fragment` resolves; every article links to its receipts page and has `NewsArticle` data; every claim marker in an article leads to its claim; every article shows its fact card, a figure with a label that holds an inline SVG drawn in the tokens' colours; and the feed, the sitemap, `robots.txt` and the 404 page are there and agree.

## Reading the scoreboard
```

- [ ] **Step 11: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 12: Look at the card in the fixture site, and audit it**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Every article has the figure, labelled with the title and the figures, and the SVG inside is hidden from assistive technology.

Run: `grep -o '<figure class="fact-card" data-fact-card role="img" aria-label="Fact card: Fixture Robotics ships its FX-1 warehouse arm to a second plant (key figures: funding round USD 450 million, cycle-time cut 18 per cent, list price $38,000)">' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: PASS — `data-fact-card role="img" aria-label="Fact card: Fixture Robotics ships its FX-1 warehouse arm to a second plant (key figures: funding round USD 450 million, cycle-time cut 18 per cent, list price $38,000)"`

Run: `grep -o '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" aria-hidden="true" focusable="false">' site/dist/news/fixture-robotics-ships-fx-5-to-second-plant/index.html`
Expected: PASS — `viewBox="0 0 1200 630" aria-hidden="true" focusable="false"`

The share image is unchanged: the file is still the light card, with hex colours.

Run: `grep -c 'var(--' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/card.svg`
Expected: FAIL — `0`

Run: `npm run audit`
Expected: PASS — `ok    A12`, `ok    A17` and `Passed: 16 checks.`

Take a copy of the build, take the `data-fact-card` attribute off the card of one article, and audit the copy.

Run:

```bash
copy=$(mktemp -d)
cp -R site/dist/. "$copy"
sed -i.bak 's# data-fact-card##' "$copy/news/fixture-robotics-ships-fx-1-to-second-plant/index.html"
node site/scripts/audit.mjs --dir "$copy"
status=$?
rm -rf "$copy"
exit $status
```
Expected: FAIL — `FAIL  A17` and `news/fixture-robotics-ships-fx-1-to-second-plant/index.html: has no fact card (a <figure data-fact-card>)`.

Take another copy and write a colour that is not a token into the card.

Run:

```bash
copy=$(mktemp -d)
cp -R site/dist/. "$copy"
sed -i.bak 's|fill="var(--bg)"|fill="#123456"|' "$copy/news/fixture-robotics-ships-fx-1-to-second-plant/index.html"
node site/scripts/audit.mjs --dir "$copy"
status=$?
rm -rf "$copy"
exit $status
```
Expected: FAIL — `FAIL  A12` and `news/fixture-robotics-ships-fx-1-to-second-plant/index.html (inline svg): #123456 is not a colour of the design tokens`.

- [ ] **Step 13: Measure the fixture site**

The card adds markup to every article, so Lighthouse has to be run again.

Run: `npm run lighthouse`
Expected: PASS — `Lighthouse, 5 pages` and `All scores are 95 or more.`

- [ ] **Step 14: Commit**

```bash
git add README.md site/scripts site/src site/test
git commit -m "feat: draw the fact card into the article page with a label, and audit it (A17)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 82: The site says only what is running

**Files:**
- Create: `site/src/lib/live.ts` (the switchboard: which parts of the Desk run)
- Create: `site/src/lib/copy.ts` (every sentence whose tense depends on a flag, as pure functions)
- Modify: `site/src/lib/method.ts` (the nine rules as the code enforces them; the known limits; the owner-release sentence moves to `copy.ts`)
- Modify: `site/src/lib/nav.ts` (the footer disclosure moves to `copy.ts`), `site/src/lib/feed.ts`
- Modify: `site/src/components/Footer.astro`, `site/src/pages/index.astro`, `site/src/pages/news/[slug]/receipts/index.astro`, `site/src/pages/method/index.astro`
- Modify: `package.json` (the description), `README.md`
- Test: `site/test/copy.test.ts` (new), `site/test/known-limits.test.ts` (new), `site/test/method.test.ts`, `site/test/nav.test.ts`, `site/test/feed.test.ts`

Plan 1 builds the gate, the ledger, the renderer and the pages. It does not build the Desk: nothing finds, fetches or writes a story, nothing runs on a schedule, the full text of a source is kept nowhere, no second model checks a sentence, no hold becomes a pull request, nobody can release a held draft, and no command records a correction. The review of Plan 1 found places where the public copy says otherwise, in the present tense, and places where it describes the gate in words that stopped being true when Part A of this milestone changed the gate:

- The receipts page says "Each number in the article links to a claim", but a marker follows a sentence, not a number. It says the source snapshot "is kept in a private evidence store", and that store does not exist.
- The footer says that the site "is written by an automated pipeline". The home page description and the feed say the same. The description of the repository calls it a daily site.
- The method page describes the hold pull request, the owner's release and the daily schedule as if they ran, and its list of what is "not running yet" does not name the hold, the release or the correction command.
- The method page describes the nine rules in the words of the first version of the gate: "an author is named", "every number, date and name", "describes one claim's basis or status", "a recent title". Part A made the checks stricter and different (headings are checked text, numbers in words are read, the first word of a sentence is grounded, one limitation sentence covers a group of claims, the title window is 14 days), and the page says none of it. It also lists no limits, although the checks have known ones.
- The scoreboard has no caveat on the site. The README has one.

This task fixes the copy in one way, so that it cannot go wrong again:

1. `site/src/lib/live.ts` is a switchboard of four flags (`evidenceStore`, `verifier`, `scheduler`, `publishing`). All are `false`. Plan 2 turns each on when its part really runs.
2. Every sentence whose tense depends on a flag is written by a pure function in `site/src/lib/copy.ts` that takes the switchboard: in the future tense, with "is not running yet" where that helps, while its flag is off, and in the present tense once it is on. `site/test/copy.test.ts` says, with exact strings, what each function writes for each of the sixteen settings of the four flags.
3. The same test scans the source of the site and fails if any file but `copy.ts` and `live.ts` writes such a sentence itself, or if a function of `copy.ts` is never used.
4. The method page uses those functions, lists the correction, hold and owner-release flows as not running yet, describes each rule as the code enforces it, lists the known limits (each shown with a sentence the real token reader cannot see anything in), and carries the scoreboard caveat.

- [ ] **Step 1: Write the failing test for the copy**

The test has one block for each function. A function that depends on one flag is run in all sixteen settings and must give one of two exact strings, so it also proves that the other three flags do not matter. `notRunningYet`, which depends on all four, is checked for each flag in turn. The last two blocks scan the source of the site and the description of the repository.

**Create `site/test/copy.test.ts`:**
```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deskIntro,
  disclosure,
  gateIntro,
  holdsText,
  meaningLimit,
  methodDisclosure,
  modelCheckText,
  notRunningNote,
  notRunningYet,
  ownerReleaseText,
  receiptsIntro,
  scoreboardCaveat,
  siteDescription,
  trialText,
} from '../src/lib/copy';
import { LIVE } from '../src/lib/live';
import type { Live } from '../src/lib/live';
import { releaseNote } from '../src/lib/receipts';

// The Desk is not running in Plan 1, and a page that says it is would be a lie. Every
// sentence of the site whose tense depends on a part of the Desk being live is written
// by a function in copy.ts that takes the LIVE switchboard. These tests say, with exact
// strings, what each function writes for every setting of the four flags, so that the
// present tense cannot come back by accident, and so that flipping a flag in Plan 2
// changes the copy and the tests together.

const FLAGS = ['evidenceStore', 'verifier', 'scheduler', 'publishing'] as const;

/** Every setting of the four flags: sixteen of them. */
const COMBOS: Live[] = Array.from({ length: 16 }, (_, n) => ({
  evidenceStore: (n & 1) !== 0,
  verifier: (n & 2) !== 0,
  scheduler: (n & 4) !== 0,
  publishing: (n & 8) !== 0,
}));
const name = (live: Live): string => FLAGS.map((flag) => `${flag}=${live[flag]}`).join(' ');
const CASES = COMBOS.map((live) => [name(live), live] as const);
const NONE: Live = { evidenceStore: false, verifier: false, scheduler: false, publishing: false };
const ALL: Live = { evidenceStore: true, verifier: true, scheduler: true, publishing: true };

describe('LIVE', () => {
  it('has the four flags, each true or false', () => {
    expect(Object.keys(LIVE).sort()).toEqual(['evidenceStore', 'publishing', 'scheduler', 'verifier']);
    for (const flag of FLAGS) expect(typeof LIVE[flag], flag).toBe('boolean');
  });

  it('has every flag off in Plan 1: nothing of the Desk runs yet. Plan 2 turns them on one by one, and changes this test with each', () => {
    expect(LIVE).toEqual(NONE);
  });

  it('is what every copy function uses when it is given no setting', () => {
    expect(receiptsIntro()).toBe(receiptsIntro(LIVE));
    expect(disclosure()).toBe(disclosure(LIVE));
    expect(siteDescription()).toBe(siteDescription(LIVE));
    expect(notRunningYet()).toEqual(notRunningYet(LIVE));
  });

  it('is tried here in all sixteen settings, no two alike', () => {
    expect(new Set(COMBOS.map(name)).size).toBe(16);
  });
});

describe('receiptsIntro', () => {
  const START =
    'Each sentence of the article links to the claims it rests on, listed below: the passage of the source that each claim rests on, word for word, and where and when that source was fetched.';
  const OFF = `${START} The full source snapshot will be kept in a private evidence store, which is not running yet; this public record keeps its hash, the retrieval time and the quoted passage.`;
  const ON = `${START} The full source snapshot is kept in a private evidence store; this public record keeps its hash, the retrieval time and the quoted passage.`;

  it.each(CASES)('says what the evidence store does only when it is live (%s)', (_name, live) => {
    expect(receiptsIntro(live)).toBe(live.evidenceStore ? ON : OFF);
  });

  it('says each sentence links to the claims it rests on, not each number to a claim', () => {
    expect(receiptsIntro(NONE)).not.toContain('Each number');
    expect(receiptsIntro(ALL)).not.toContain('Each number');
  });
});

describe('disclosure', () => {
  const OFF =
    'Robywire will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
  const ON =
    'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(disclosure(live)).toBe(live.publishing ? ON : OFF);
  });

  it.each([NONE, ALL])('names the pipeline and the rule, and claims no second model, human review or editor', (live) => {
    const text = disclosure(live);
    expect(text).toContain('automated pipeline');
    expect(text).toContain('every factual sentence');
    expect(text).toContain('primary source');
    expect(text).not.toMatch(/second model|verifier|independent|review|human|editor/i);
    expect(text.length).toBeLessThan(400);
  });
});

describe('siteDescription', () => {
  const OFF = 'A robotics news site built so that every factual sentence links to the passage of a primary source it rests on. An automated pipeline will write it.';
  const WRITTEN = 'Robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on.';
  const DAILY = 'Daily robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on.';

  it.each(CASES)('claims a running service, and a daily one, only when they are live (%s)', (_name, live) => {
    expect(siteDescription(live)).toBe(!live.publishing ? OFF : live.scheduler ? DAILY : WRITTEN);
  });

  it('says nothing of a daily site while the schedule is off, in any setting', () => {
    for (const live of COMBOS.filter((item) => !item.scheduler)) expect(siteDescription(live)).not.toMatch(/daily/i);
  });

  it('is a description of a length a search result shows', () => {
    for (const live of COMBOS) expect(siteDescription(live).length).toBeLessThanOrEqual(160);
  });
});

describe('deskIntro', () => {
  const OFF =
    'Robywire is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
  const ON =
    'Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(deskIntro(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('methodDisclosure', () => {
  const OFF =
    "Every page says in its footer that the site will be written by an automated pipeline, and the byline of every article already names the Desk and says the piece is automated. No piece carries a human author's name, and none pretends to have been reported by a person.";
  const ON =
    "Every page says in its footer that the site is written by an automated pipeline, and the byline of every article says the same. No piece carries a human author's name, and none pretends to have been reported by a person.";

  it.each(CASES)('follows the footer (%s)', (_name, live) => {
    expect(methodDisclosure(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('gateIntro', () => {
  const OFF =
    'The gate is code, and it is built and tested. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published: the gate reports the exact failures, and the Desk will send the draft back for revision with them. In plain English the rules are these.';
  const ON =
    'The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published; it goes back for revision with the exact failures. In plain English the rules are these.';

  it.each(CASES)('says the revision loop runs only when the Desk does (%s)', (_name, live) => {
    expect(gateIntro(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('notRunningYet', () => {
  // The parts that do not run, each tied to the flag that says it does.
  const ITEMS: Record<(typeof FLAGS)[number], string[]> = {
    publishing: [
      'the pipeline that finds, fetches and writes stories',
      'the draft pull request that sends a held draft to the owner',
      "the owner's release of a held draft",
      'the command that records a correction or a retraction',
    ],
    evidenceStore: ['the private evidence store for the full text of each source'],
    verifier: ['the independent model check'],
    scheduler: ['the daily schedule'],
  };
  const FULL = [
    'the pipeline that finds, fetches and writes stories',
    'the private evidence store for the full text of each source',
    'the independent model check',
    'the daily schedule',
    'the draft pull request that sends a held draft to the owner',
    "the owner's release of a held draft",
    'the command that records a correction or a retraction',
  ];

  it('lists everything that is not live, in a fixed order, while nothing is', () => {
    expect(notRunningYet(NONE)).toEqual(FULL);
  });

  it('names the correction, the hold and the owner release, which the review found missing from the list', () => {
    const text = notRunningYet(NONE).join(' | ');
    expect(text).toContain('the command that records a correction or a retraction');
    expect(text).toContain('the draft pull request that sends a held draft to the owner');
    expect(text).toContain("the owner's release of a held draft");
  });

  it('lists nothing once every part is live', () => {
    expect(notRunningYet(ALL)).toEqual([]);
  });

  it.each(CASES)('lists exactly the parts whose flag is off (%s)', (_name, live) => {
    const expected = FULL.filter((item) => FLAGS.some((flag) => !live[flag] && ITEMS[flag].includes(item)));
    expect(notRunningYet(live)).toEqual(expected);
  });

  it.each(FLAGS)('drops exactly the items of %s when only that flag is turned on', (flag) => {
    const without = notRunningYet({ ...NONE, [flag]: true });
    expect(without).toEqual(FULL.filter((item) => !ITEMS[flag].includes(item)));
    expect(FULL.length - without.length).toBe(ITEMS[flag].length);
  });
});

describe('notRunningNote', () => {
  const NOTE =
    'Where this page says what the Desk does in the present tense, it describes a rule that the gate already enforces or the way the Desk is designed to behave; the parts that are not running are described in the future tense.';

  it.each(CASES)('is given exactly while some part is not running (%s)', (_name, live) => {
    expect(notRunningNote(live)).toBe(FLAGS.every((flag) => live[flag]) ? undefined : NOTE);
  });
});

describe('trialText', () => {
  const TEXT =
    'Before the Desk publishes on its own it will run for five days in shadow, writing and checking but publishing nothing, and then for fourteen days in public, and a short written report will cover that trial.';

  it.each(CASES)('is given only while the Desk does not publish (%s)', (_name, live) => {
    expect(trialText(live)).toBe(live.publishing ? undefined : TEXT);
  });
});

describe('modelCheckText', () => {
  const OFF =
    'On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a second layer on top of the nine rules, never the only one. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted. It is not running yet.';
  const ON =
    'On every piece, a second model call reads each factual sentence beside the passages it cites and judges whether they say the same thing, and whether the basis and status labels fit. It uses a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece is held. This check is a second layer on top of the nine rules, never the only one. Its accuracy was measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted, before it was relied on.';

  it.each(CASES)('is in the future tense until the verifier is live (%s)', (_name, live) => {
    expect(modelCheckText(live)).toBe(live.verifier ? ON : OFF);
  });
});

describe('holdsText', () => {
  const OFF =
    "The gate holds a piece when it cannot clear it: a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting, or, once the pipeline runs, a check still fails after two rounds of revision. A held draft is not published. It will go to the owner as a draft pull request that carries the gate report; that flow is not running yet.";
  const ON =
    "The gate holds a piece when it cannot clear it: a check still fails after two rounds of revision, or a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting. A held draft is not published. It goes to the owner as a draft pull request that carries the gate report.";

  it.each(CASES)('says the pull request flow is running only when the Desk publishes (%s)', (_name, live) => {
    expect(holdsText(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('ownerReleaseText', () => {
  const NOTE = releaseNote('owner');
  const OFF = `A held draft will be published only if the owner decides to release it, and the piece will then say so: its receipts page will read "${NOTE}", and each sentence that rests on another outlet will be labelled "Unconfirmed." in the article; the site already does both for a piece whose ledger says that the owner released it.`;
  const ON = `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${NOTE}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the article.`;

  it.each(CASES)('says the release happens only when the Desk publishes (%s)', (_name, live) => {
    expect(ownerReleaseText(live)).toBe(live.publishing ? ON : OFF);
  });

  it.each([NONE, ALL])('is one sentence', (live) => {
    const text = ownerReleaseText(live);
    expect(text).toMatch(/^[A-Z]/);
    expect(text.endsWith('.')).toBe(true);
    expect(text.slice(0, -1).replaceAll(/"[^"]*"/g, '')).not.toMatch(/[.!?](\s|$)/);
  });

  it('quotes what the receipts page of an owner-released piece says, so the two cannot drift apart', () => {
    expect(NOTE).toBe('Held by the gate, then released by the owner.');
    expect(ownerReleaseText(NONE)).toContain(`"${NOTE}"`);
    expect(ownerReleaseText(ALL)).toContain(`"${NOTE}"`);
  });
});

describe('scoreboardCaveat', () => {
  const START =
    'The scoreboard is a floor, not a proof. It measures the checks against defects that were seeded on purpose, not how accurate the Desk is on live stories: it says nothing about the defects that nobody thought to seed.';
  const OFF = `${START} The independent model check is not part of it; that check is not running yet, and its accuracy will be measured on its own labelled set.`;
  const ON = `${START} The independent model check is not part of it; its accuracy is measured on its own labelled set.`;

  it.each(CASES)('says the model check is not running only while it is not (%s)', (_name, live) => {
    expect(scoreboardCaveat(live)).toBe(live.verifier ? ON : OFF);
  });

  it('says what the README says: a floor, not a proof, and live accuracy is not measured', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('The scoreboard is a floor, not a proof.');
    for (const live of COMBOS) expect(scoreboardCaveat(live)).toContain('The scoreboard is a floor, not a proof.');
  });
});

describe('meaningLimit', () => {
  const START =
    'Meaning is not checked by code. The checks make sure that every figure, name and quotation in a sentence comes from a claim the sentence cites, not that the sentence says what the claim says, or that a paraphrase is fair.';
  const OFF = `${START} That will be the job of the independent model check, which is not running yet.`;
  const ON = `${START} That is the job of the independent model check.`;

  it.each(CASES)('hands meaning to the model check, in the tense of its flag (%s)', (_name, live) => {
    expect(meaningLimit(live)).toBe(live.verifier ? ON : OFF);
  });
});

// --- Where the copy may be written ---------------------------------------------------

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return /^(content|content-fixtures|data)$/.test(entry) ? [] : sourceFiles(full);
    return /\.(astro|ts)$/.test(entry) ? [full] : [];
  });
}

describe('the source of the site', () => {
  const files = sourceFiles(SRC).filter((file) => !['copy.ts', 'live.ts'].includes(path.basename(file)));

  it('looks at the pages, the components and the lib, so the scan is not made of nothing', () => {
    const names = files.map((file) => path.relative(SRC, file));
    expect(names).toContain(path.join('pages', 'method', 'index.astro'));
    expect(names).toContain(path.join('components', 'Footer.astro'));
    expect(names).toContain(path.join('lib', 'method.ts'));
    expect(files.length).toBeGreaterThan(20);
  });

  it('uses every function of copy.ts: a page, a component or the feed calls each one, so no old sentence is left beside a new one', () => {
    const exported = [...readFileSync(path.join(SRC, 'lib', 'copy.ts'), 'utf8').matchAll(/^export function (\w+)/gm)].map((match) => match[1]!);
    expect(exported.length).toBeGreaterThanOrEqual(14);
    const everything = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const name of exported) expect(everything, name).toContain(`${name}(`);
  });

  // Sentences that say a part of the Desk exists belong in copy.ts, behind a flag. A page or a
  // function elsewhere that writes one itself would not change when the flag does.
  it.each([
    ['the private evidence store', /evidence store/i],
    ['a pipeline that writes the site', /(?:is|are|will be) written by an automated pipeline/i],
    ['a daily site or schedule', /\bdaily\b/i],
    ['what each number links to', /Each number in the article/i],
  ])('has no file that writes a sentence about %s outside copy.ts and live.ts', (_what, pattern) => {
    const found = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => path.relative(SRC, file));
    expect(found).toEqual([]);
  });
});

describe('the description of the repository', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { description: string };

  it('does not call the site a running daily service while the schedule and the pipeline are off', () => {
    if (!LIVE.scheduler) expect(pkg.description).not.toMatch(/\bdaily\b/i);
    if (!LIVE.publishing) expect(pkg.description).not.toMatch(/\bwritten by\b/i);
    expect(pkg.description).toMatch(/^Robywire: /);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test --workspace @robywire/site -- test/copy.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/copy'`

- [ ] **Step 3: Write the switchboard and the copy**

The switchboard is a type and one constant. It says what each flag means, so that Plan 2 knows what turning it on promises.

**Create `site/src/lib/live.ts`:**
```ts
// Which parts of the Desk are running. The Desk is the pipeline that will write
// the site; Plan 1 builds the gate, the ledger, the renderer and the pages, and
// none of the parts below. A sentence on the site that says one of them exists
// is true only when its flag is true, so every such sentence is written by a
// function in copy.ts that takes this switchboard, and site/test/copy.test.ts
// says what each function writes for every setting.
//
// Plan 2 turns the flags on one by one, as each part really runs. Turning a
// flag on is a change to this file and to the tests that name its setting
// (copy.test.ts and, for `publishing`, the tense of the pipeline stages in
// method.test.ts); the tests fail until the copy has been checked.

export interface Live {
  /** The private store that keeps the full text of every source the Desk fetched (a Cloudflare R2 bucket). */
  evidenceStore: boolean;
  /** The independent model check (G10): a second model reads each sentence beside the passages it cites. */
  verifier: boolean;
  /** The daily schedule that starts a run. */
  scheduler: boolean;
  /**
   * The Desk writes pieces and publishes them: the pipeline that finds, fetches and writes stories, the draft
   * pull request that carries a hold to the owner, the owner's release of a held draft, and the command that
   * records a correction or a retraction.
   */
  publishing: boolean;
}

/** Nothing of the Desk runs in Plan 1. */
export const LIVE: Live = {
  evidenceStore: false,
  verifier: false,
  scheduler: false,
  publishing: false,
};
```

The copy is one function for each place where a sentence depends on a flag. Where the old sentence is still true, the function gives it back unchanged when the flag is on.

**Create `site/src/lib/copy.ts`:**
```ts
import { LIVE } from './live';
import type { Live } from './live';
import { releaseNote } from './receipts';

// Every sentence of the site whose tense depends on a part of the Desk being
// live. Each function takes the switchboard (live.ts) and says in the future
// tense what is not running and in the present tense what is. A page or a
// function elsewhere must not write such a sentence itself, so that turning a
// flag on changes all of them together; site/test/copy.test.ts checks what
// each one says for every setting of the flags, and that no other file of the
// site says it.

/** The description of the site for search results and the feed. */
export function siteDescription(live: Live = LIVE): string {
  const rule = 'Every factual sentence links to the passage of a primary source that it rests on.';
  if (!live.publishing) return 'A robotics news site built so that every factual sentence links to the passage of a primary source it rests on. An automated pipeline will write it.';
  return live.scheduler ? `Daily robotics news written by an automated pipeline. ${rule}` : `Robotics news written by an automated pipeline. ${rule}`;
}

/** The disclosure in the footer of every page. It names no second model, human or editor, because the method page describes those as plans. */
export function disclosure(live: Live = LIVE): string {
  return live.publishing
    ? 'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.'
    : 'Robywire will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
}

/** The introduction of a receipts page. */
export function receiptsIntro(live: Live = LIVE): string {
  const start =
    'Each sentence of the article links to the claims it rests on, listed below: the passage of the source that each claim rests on, word for word, and where and when that source was fetched.';
  const store = live.evidenceStore
    ? 'The full source snapshot is kept in a private evidence store; this public record keeps its hash, the retrieval time and the quoted passage.'
    : 'The full source snapshot will be kept in a private evidence store, which is not running yet; this public record keeps its hash, the retrieval time and the quoted passage.';
  return `${start} ${store}`;
}

/** The first paragraph of the method page. */
export function deskIntro(live: Live = LIVE): string {
  return live.publishing
    ? 'Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.'
    : 'Robywire is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
}

/** The parts that do not run, each with the flag that says it does, in the order the method page lists them. */
const NOT_RUNNING: readonly { flag: keyof Live; text: string }[] = [
  { flag: 'publishing', text: 'the pipeline that finds, fetches and writes stories' },
  { flag: 'evidenceStore', text: 'the private evidence store for the full text of each source' },
  { flag: 'verifier', text: 'the independent model check' },
  { flag: 'scheduler', text: 'the daily schedule' },
  { flag: 'publishing', text: 'the draft pull request that sends a held draft to the owner' },
  { flag: 'publishing', text: "the owner's release of a held draft" },
  { flag: 'publishing', text: 'the command that records a correction or a retraction' },
];

/** What is not running yet, one phrase for each part, for the list on the method page. Empty once every part is live. */
export function notRunningYet(live: Live = LIVE): string[] {
  return NOT_RUNNING.filter((part) => !live[part.flag]).map((part) => part.text);
}

/** The sentence under the list of what is not running, or undefined when every part is. */
export function notRunningNote(live: Live = LIVE): string | undefined {
  return notRunningYet(live).length === 0
    ? undefined
    : 'Where this page says what the Desk does in the present tense, it describes a rule that the gate already enforces or the way the Desk is designed to behave; the parts that are not running are described in the future tense.';
}

/** The trial the Desk will go through before it publishes by itself, or undefined once it does. */
export function trialText(live: Live = LIVE): string | undefined {
  return live.publishing
    ? undefined
    : 'Before the Desk publishes on its own it will run for five days in shadow, writing and checking but publishing nothing, and then for fourteen days in public, and a short written report will cover that trial.';
}

/** The paragraph that introduces the nine rules of the gate. */
export function gateIntro(live: Live = LIVE): string {
  return live.publishing
    ? 'The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published; it goes back for revision with the exact failures. In plain English the rules are these.'
    : 'The gate is code, and it is built and tested. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published: the gate reports the exact failures, and the Desk will send the draft back for revision with them. In plain English the rules are these.';
}

/** The section about the independent model check. */
export function modelCheckText(live: Live = LIVE): string {
  return live.verifier
    ? 'On every piece, a second model call reads each factual sentence beside the passages it cites and judges whether they say the same thing, and whether the basis and status labels fit. It uses a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece is held. This check is a second layer on top of the nine rules, never the only one. Its accuracy was measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted, before it was relied on.'
    : 'On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a second layer on top of the nine rules, never the only one. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted. It is not running yet.';
}

/** The start of the section about holds: when a piece is held and where a held draft goes. The page adds what the holds page shows. */
export function holdsText(live: Live = LIVE): string {
  return live.publishing
    ? "The gate holds a piece when it cannot clear it: a check still fails after two rounds of revision, or a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting. A held draft is not published. It goes to the owner as a draft pull request that carries the gate report."
    : "The gate holds a piece when it cannot clear it: a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting, or, once the pipeline runs, a check still fails after two rounds of revision. A held draft is not published. It will go to the owner as a draft pull request that carries the gate report; that flow is not running yet.";
}

/** What the site shows for a held draft that the owner decides to publish. The words quoted are the ones the receipts page uses. */
export function ownerReleaseText(live: Live = LIVE): string {
  const note = releaseNote('owner');
  return live.publishing
    ? `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${note}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the article.`
    : `A held draft will be published only if the owner decides to release it, and the piece will then say so: its receipts page will read "${note}", and each sentence that rests on another outlet will be labelled "Unconfirmed." in the article; the site already does both for a piece whose ledger says that the owner released it.`;
}

/** The paragraph about disclosure on the method page. It follows the footer. */
export function methodDisclosure(live: Live = LIVE): string {
  return live.publishing
    ? "Every page says in its footer that the site is written by an automated pipeline, and the byline of every article says the same. No piece carries a human author's name, and none pretends to have been reported by a person."
    : "Every page says in its footer that the site will be written by an automated pipeline, and the byline of every article already names the Desk and says the piece is automated. No piece carries a human author's name, and none pretends to have been reported by a person.";
}

/** The caveat of the scoreboard: what the number does and does not measure. The README says the same. */
export function scoreboardCaveat(live: Live = LIVE): string {
  const start =
    'The scoreboard is a floor, not a proof. It measures the checks against defects that were seeded on purpose, not how accurate the Desk is on live stories: it says nothing about the defects that nobody thought to seed.';
  return live.verifier
    ? `${start} The independent model check is not part of it; its accuracy is measured on its own labelled set.`
    : `${start} The independent model check is not part of it; that check is not running yet, and its accuracy will be measured on its own labelled set.`;
}

/** The last of the known limits of the checks: what no rule of code can see. */
export function meaningLimit(live: Live = LIVE): string {
  const start =
    'Meaning is not checked by code. The checks make sure that every figure, name and quotation in a sentence comes from a claim the sentence cites, not that the sentence says what the claim says, or that a paraphrase is fair.';
  return live.verifier ? `${start} That is the job of the independent model check.` : `${start} That will be the job of the independent model check, which is not running yet.`;
}
```

- [ ] **Step 4: Run the test and confirm that the exact strings pass and the scan fails**

The functions say the right thing in every setting. The pages do not use them yet, so the scan finds the old sentences in the files that still write them, and the description of the repository still says "daily".

Run: `npm test --workspace @robywire/site -- test/copy.test.ts`
Expected: FAIL — `has no file that writes a sentence about the private evidence store outside copy.ts and live.ts`, `has no file that writes a sentence about a pipeline that writes the site outside copy.ts and live.ts`, `has no file that writes a sentence about a daily site or schedule outside copy.ts and live.ts`, `has no file that writes a sentence about what each number links to outside copy.ts and live.ts`, `uses every function of copy.ts` and `does not call the site a running daily service while the schedule and the pipeline are off`.

- [ ] **Step 5: Write the failing test for the feed, and move the footer test**

The feed describes the site in the words of the home page. The footer's tests move into `copy.test.ts` (they are the tests of `disclosure`), so they leave `nav.test.ts`.

**In `site/test/feed.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { feedOptions, rssItems } from '../src/lib/feed';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { siteDescription } from '../src/lib/copy';
import { feedOptions, rssItems } from '../src/lib/feed';

```

**In `site/test/feed.test.ts`, replace:**
```ts
  });

  it('lists every piece, newest first, with an absolute link, a date and its categories', async () => {
    const { rss } = parse(await feed([FX1, FX2]));
```

**with:**
```ts
  });

  it('describes the site in the words the home page uses, which claim only what is running', async () => {
    const { rss } = parse(await feed([FX1]));
    expect(rss.channel.description).toBe(siteDescription());
    expect(rss.channel.description).toBe('A robotics news site built so that every factual sentence links to the passage of a primary source it rests on. An automated pipeline will write it.');
  });

  it('lists every piece, newest first, with an absolute link, a date and its categories', async () => {
    const { rss } = parse(await feed([FX1, FX2]));
```

**In `site/test/nav.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { BEATS } from '@robywire/gate';
import { DISCLOSURE, FOOTER_LINKS, NAV_ITEMS, isCurrent } from '../src/lib/nav';
import { beatLabel } from '../src/lib/format';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { BEATS } from '@robywire/gate';
import { FOOTER_LINKS, NAV_ITEMS, isCurrent } from '../src/lib/nav';
import { beatLabel } from '../src/lib/format';

```

**In `site/test/nav.test.ts`, replace:**
```ts
});

describe('DISCLOSURE', () => {
  it('says the pieces come from an automated pipeline and are published only when every factual sentence is traced to a primary source', () => {
    expect(DISCLOSURE).toContain('automated pipeline');
    expect(DISCLOSURE).toContain('every factual sentence');
    expect(DISCLOSURE).toContain('primary source');
  });

  it('claims nothing the site does not do yet: no second model, no independent check, no human review', () => {
    expect(DISCLOSURE).not.toMatch(/second model|verifier|independent|review|human|editor/i);
  });

  it('is a short passage, not a page', () => {
    expect(DISCLOSURE.length).toBeLessThan(400);
  });
});

describe('isCurrent', () => {
  it('is true for the page itself', () => {
```

**with:**
```ts
});

describe('isCurrent', () => {
  it('is true for the page itself', () => {
```

Run: `npm test --workspace @robywire/site -- test/feed.test.ts`
Expected: FAIL — `describes the site in the words the home page uses, which claim only what is running`

- [ ] **Step 6: Use the copy in the footer, the home page, the feed, the receipts page and the package description**

The footer's text leaves `nav.ts`, and the footer asks `copy.ts` for it.

**In `site/src/lib/nav.ts`, replace:**
```ts
import { beatLabel } from './format';

// What the header and footer link to, and what the footer says. The wordmark
// is the link home, so the header lists the seven beats and Method.

export interface NavItem {
```

**with:**
```ts
import { beatLabel } from './format';

// What the header and footer link to. The wordmark is the link home, so the
// header lists the seven beats and Method. What the footer says is in copy.ts.

export interface NavItem {
```

**In `site/src/lib/nav.ts`, replace:**
```ts
];

/**
 * The disclosure shown on every page. It says only what is true of the
 * design: it does not mention a second model or a human, because the page for
 * the method describes those, as plans, where they belong.
 */
export const DISCLOSURE =
  'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

/** True when `pathname` is the page `href` or a page below it. The home page matches only itself. */
export function isCurrent(href: string, pathname: string): boolean {
```

**with:**
```ts
];

/** True when `pathname` is the page `href` or a page below it. The home page matches only itself. */
export function isCurrent(href: string, pathname: string): boolean {
```

**In `site/src/components/Footer.astro`, replace:**
```astro
---
import { DISCLOSURE, FOOTER_LINKS } from '../lib/nav';
---

<footer class="site-footer">
  <div class="container">
    <p class="disclosure">{DISCLOSURE}</p>
    <nav aria-label="About this site">
      <ul class="footer-links">
```

**with:**
```astro
---
import { disclosure } from '../lib/copy';
import { FOOTER_LINKS } from '../lib/nav';
---

<footer class="site-footer">
  <div class="container">
    <p class="disclosure">{disclosure()}</p>
    <nav aria-label="About this site">
      <ul class="footer-links">
```

The home page and the feed describe the site with the same function.

**In `site/src/pages/index.astro`, replace:**
```astro
import PieceList from '../components/PieceList.astro';
import Base from '../layouts/Base.astro';
import { getDeskState } from '../lib/desk-state';
import { beatLabel, formatDate } from '../lib/format';
```

**with:**
```astro
import PieceList from '../components/PieceList.astro';
import Base from '../layouts/Base.astro';
import { siteDescription } from '../lib/copy';
import { getDeskState } from '../lib/desk-state';
import { beatLabel, formatDate } from '../lib/format';
```

**In `site/src/pages/index.astro`, replace:**
```astro
import '../styles/home.css';

// How many pieces below the lead the home page lists: about two weeks of a daily site.
const RECENT = 14;

```

**with:**
```astro
import '../styles/home.css';

// How many pieces below the lead the home page lists: about two weeks of pieces, if one is published a day.
const RECENT = 14;

```

**In `site/src/pages/index.astro`, replace:**
```astro
---

<Base
  title="Robywire"
  description="Robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on."
  canonicalPath="/"
>
  <div class="container">
    <h1 class="home-title">Robotics news with a receipt for every claim.</h1>
```

**with:**
```astro
---

<Base title="Robywire" description={siteDescription()} canonicalPath="/">
  <div class="container">
    <h1 class="home-title">Robotics news with a receipt for every claim.</h1>
```

**In `site/src/lib/feed.ts`, replace:**
```ts
import type { RSSFeedItem, RSSOptions } from '@astrojs/rss';
import { SITE_NAME, beatLabel } from './format';
import { articlePath } from './paths';
```

**with:**
```ts
import type { RSSFeedItem, RSSOptions } from '@astrojs/rss';
import { siteDescription } from './copy';
import { SITE_NAME, beatLabel } from './format';
import { articlePath } from './paths';
```

**In `site/src/lib/feed.ts`, replace:**
```ts
  return {
    title: SITE_NAME,
    description: 'Robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on.',
    site,
    items: rssItems(pieces),
```

**with:**
```ts
  return {
    title: SITE_NAME,
    description: siteDescription(),
    site,
    items: rssItems(pieces),
```

The receipts page asks for its introduction.

**In `site/src/pages/news/[slug]/receipts/index.astro`, replace:**
```astro
---
import Base from '../../../../layouts/Base.astro';
import { formatDateTime, plural } from '../../../../lib/format';
import { articlePath, receiptsPath } from '../../../../lib/paths';
```

**with:**
```astro
---
import Base from '../../../../layouts/Base.astro';
import { receiptsIntro } from '../../../../lib/copy';
import { formatDateTime, plural } from '../../../../lib/format';
import { articlePath, receiptsPath } from '../../../../lib/paths';
```

**In `site/src/pages/news/[slug]/receipts/index.astro`, replace:**
```astro
    <p class="back"><a href={articlePath(view.slug)}>&larr; Back to the article</a></p>
    <h1>Receipts &mdash; {view.title}</h1>
    <p class="receipts-intro">
      Each number in the article links to a claim below: the passage of the source it rests on, word for word, and where and when that source was fetched. The full source snapshot is kept in a private
      evidence store; this public record keeps its hash, the retrieval time and the quoted passage.
    </p>

    <section aria-labelledby="gate-heading">
```

**with:**
```astro
    <p class="back"><a href={articlePath(view.slug)}>&larr; Back to the article</a></p>
    <h1>Receipts &mdash; {view.title}</h1>
    <p class="receipts-intro">{receiptsIntro()}</p>

    <section aria-labelledby="gate-heading">
```

The description of the repository says what it is and that the Desk is still to come.

**In `package.json`, replace:**
```json
  "private": true,
  "type": "module",
  "description": "Robywire: a daily robotics news site, written by the Desk and checked by a code gate.",
  "engines": {
    "node": ">=22"
```

**with:**
```json
  "private": true,
  "type": "module",
  "description": "Robywire: a robotics news site built so that every factual sentence traces to a primary source, with a code gate that checks it and the Desk, the pipeline that will write it.",
  "engines": {
    "node": ">=22"
```

Run: `npm test --workspace @robywire/site -- test/feed.test.ts test/nav.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 7: Write the failing tests for the method page's rules and limits**

Each rule now says what the code does. The configuration supplies the numbers, including the heading length and the title window, and the claims that G4 makes about words are shown with the real token reader (`extractTokens` of the gate). The seven stages of the pipeline stay in the future tense while the Desk does not publish, and a test demands the present tense once `LIVE.publishing` is on, so that turning it on cannot leave them behind. The sentence about the owner's release leaves this file, because it depends on a flag and now lives in `copy.ts`.

**In `site/test/method.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig } from '@robywire/gate';
import { releaseNote } from '../src/lib/receipts';
import { OWNER_RELEASE_TEXT, PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
// about itself. These tests keep its numbers in step with the gate, and keep
// the parts of the pipeline that are not built yet in the future tense.

describe('gateRules', () => {
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig, extractTokens } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
// about itself. These tests keep its numbers in step with the gate, keep each
// rule honest about what the code really does, and keep the parts of the
// pipeline that are not built yet in the future tense. The known limits of the
// rules are tested in known-limits.test.ts.

describe('gateRules', () => {
```

**In `site/test/method.test.ts`, replace:**
```ts
    expect(text('G2')).toContain('3 to 5 key takeaways');
    expect(text('G2')).toContain('600 to 850 words');
    expect(text('G7')).toContain('at most 20 percent');
  });

  it('follows the configuration it is given', () => {
    const config = { ...defaultConfig(), descriptionMax: 99, analysisShareCap: 0.35, bodyWords: { min: 100, max: 200 } };
    const text = (id: string) => gateRules(config).find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 99 characters');
    expect(text('G2')).toContain('100 to 200 words');
    expect(text('G7')).toContain('at most 35 percent');
  });

```

**with:**
```ts
    expect(text('G2')).toContain('3 to 5 key takeaways');
    expect(text('G2')).toContain('600 to 850 words');
    expect(text('G2')).toContain('at most 80 characters');
    expect(text('G7')).toContain('at most 20 percent');
    expect(text('G9')).toContain('in the last 14 days');
    expect(text('G9')).toContain('by 60 percent or more');
  });

  it('follows the configuration it is given', () => {
    const config = {
      ...defaultConfig(),
      descriptionMax: 99,
      headingMax: 40,
      analysisShareCap: 0.35,
      bodyWords: { min: 100, max: 200 },
      titleWindowDays: 7,
      titleSimilarityThreshold: 0.5,
    };
    const text = (id: string) => gateRules(config).find((rule) => rule.id === id)?.text ?? '';
    expect(text('G1')).toContain('at most 99 characters');
    expect(text('G2')).toContain('100 to 200 words');
    expect(text('G2')).toContain('at most 40 characters');
    expect(text('G7')).toContain('at most 35 percent');
    expect(text('G9')).toContain('in the last 7 days');
    expect(text('G9')).toContain('by 50 percent or more');
  });

  // What the rules say the code does is true of the code: the claims that G4 makes about words are shown with the real reader.
  describe('what G4 says about words', () => {
    const g4 = rules.find((rule) => rule.id === 'G4')?.text ?? '';

    it('reads numbers written in words like digits', () => {
      expect(g4).toContain('numbers written in words are read like digits ("twelve kilograms" is 12 kg)');
      expect(extractTokens('It weighs twelve kilograms.').numbers).toEqual([{ raw: 'twelve kilograms', value: '12', unit: 'kg' }]);
    });

    it.each(['half', 'twice', 'doubled', 'tenfold'])('refuses "%s", a word that states an amount with no figure to check', (word) => {
      expect(g4).toContain(`"${word}"`);
      expect(extractTokens(`It grew ${word} last quarter.`).uncheckable).toEqual([word]);
    });

    it('names the rules for the first word of a sentence and for headings, which Part A of this milestone added', () => {
      expect(g4).toContain('a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites');
      expect(g4).toContain('a section heading has no number, date or quotation');
    });
  });

  it('says in G6 that the article labels a sentence that rests on another outlet "Unconfirmed."', () => {
    expect(rules.find((rule) => rule.id === 'G6')?.text).toContain('the article labels such a sentence "Unconfirmed."');
  });

  it('says in G2 and G8 what a limitation sentence is and what covers a claim', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('is covered by a sentence under "What we couldn\'t verify"');
    expect(rules.find((rule) => rule.id === 'G8')?.text).toContain('a group of claims that share one basis or one status');
  });

  it('says in G7 that analysis may not use a number in words and must open with an ordinary word', () => {
    const g7 = rules.find((rule) => rule.id === 'G7')?.text ?? '';
    expect(g7).toContain('a number (written in digits or words)');
    expect(g7).toContain('must open with an ordinary function word or a word that some factual sentence uses');
  });

  it('says in G1 that the author is the Desk', () => {
    expect(rules.find((rule) => rule.id === 'G1')?.text).toContain('the author is the Desk');
  });

```

**In `site/test/method.test.ts`, replace:**
```ts
  });

  it('describes every stage in the future tense, because none of them runs yet', () => {
    for (const stage of PIPELINE_STAGES) expect(stage.text, stage.name).toMatch(/\bwill\b/);
  });

```

**with:**
```ts
  });

  it('describes every stage in the future tense while the Desk does not publish, and in the present once it does', () => {
    // Turning LIVE.publishing on means rewriting these seven texts; this test fails until it is done.
    for (const stage of PIPELINE_STAGES) {
      if (LIVE.publishing) expect(stage.text, stage.name).not.toMatch(/\bwill\b/);
      else expect(stage.text, stage.name).toMatch(/\bwill\b/);
    }
  });

```

**In `site/test/method.test.ts`, replace:**
```ts
});

describe('OWNER_RELEASE_TEXT', () => {
  it('is one sentence', () => {
    expect(OWNER_RELEASE_TEXT).toMatch(/^[A-Z]/);
    expect(OWNER_RELEASE_TEXT.endsWith('.')).toBe(true);
    expect(OWNER_RELEASE_TEXT.slice(0, -1).replaceAll(/"[^"]*"/g, '')).not.toMatch(/[.!?](\s|$)/);
  });

  it('says that a held draft is published only if the owner decides to release it', () => {
    expect(OWNER_RELEASE_TEXT).toContain('A held draft is published only if the owner decides to release it');
  });

  it('quotes what the receipts page of an owner-released piece says, so the two cannot drift apart', () => {
    expect(OWNER_RELEASE_TEXT).toContain(`"${releaseNote('owner')}"`);
  });

  it('says that a sentence resting on another outlet is labelled Unconfirmed. in the article', () => {
    expect(OWNER_RELEASE_TEXT).toContain('each sentence that rests on another outlet is labelled "Unconfirmed." in the article');
  });
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
```

**with:**
```ts
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
```

The known limits have a file of their own. A limit that stops being true must fail a test, so each one is shown with the same reader. For a limit of kind `unseen` the reader finds no number, date, name or amount in the example sentence, so no claim could be compared with it, and the opening word of the example is one the gate lets through, so the sentence is not stopped for another reason. A positive control shows that the reader does find a number, a date and a name when there is one. For the one limit of kind `strict` the gate refuses the first word of the example unless a claim contains it.

**Create `site/test/known-limits.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { extractTokens, isSentenceStarter, openingWordAccepted } from '@robywire/gate';
import { KNOWN_LIMITS } from '../src/lib/method';

// The method page lists what the checks cannot see. A limit that stops being true
// must fail a test, so each one is shown here with the real token reader of the gate.

describe('KNOWN_LIMITS', () => {
  const unseen = KNOWN_LIMITS.filter((limit) => limit.kind === 'unseen');
  const strict = KNOWN_LIMITS.filter((limit) => limit.kind === 'strict');

  it('lists what the review asked for: ordinals, vague quantities, lowercase names, and the false alarms of the name check', () => {
    const text = KNOWN_LIMITS.map((limit) => limit.text).join(' ');
    expect(text).toContain('Ordinals such as first, second and third');
    expect(text).toContain('"a couple", "several"');
    expect(text).toContain('iRobot or xAI');
    expect(text).toContain('The name check is strict on purpose');
    expect(unseen.length).toBeGreaterThanOrEqual(5);
    expect(strict).toHaveLength(1);
  });

  it.each(KNOWN_LIMITS.map((limit) => [limit.text.slice(0, 40), limit] as const))('is written as plain sentences: %s', (_name, limit) => {
    expect(limit.text).toMatch(/^[A-Z]/);
    expect(limit.text.endsWith('.')).toBe(true);
    expect(limit.example.endsWith('.')).toBe(true);
  });

  // A limit that stops being true must fail a test. Each example is a sentence that the real token reader looks at.
  it.each(unseen.map((limit) => [limit.example, limit] as const))('is true: the gate reads no number, date, name or amount in "%s"', (example) => {
    const tokens = extractTokens(example);
    expect(tokens.numbers).toEqual([]);
    expect(tokens.dates).toEqual([]);
    expect(tokens.uncheckable).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it.each(unseen.map((limit) => [limit.example, limit] as const))('has an example that the opening-word rule lets through, so the sentence is not stopped for another reason: "%s"', (example) => {
    const { initialWord } = extractTokens(example);
    expect(initialWord === undefined || isSentenceStarter(initialWord), example).toBe(true);
  });

  it('shows with the same reader that a number, a date and a name that the gate can see are seen, so the examples above are not empty by accident', () => {
    expect(extractTokens('The plant shipped 12 arms on 3 October 2026, and Mercer Wire reported it.')).toMatchObject({
      numbers: [{ value: '12' }],
      dates: [{ iso: '2026-10-03' }],
      names: ['mercer', 'wire'],
    });
  });

  it('is true of the strict limit: an ordinary capitalised noun at the start of a sentence is refused unless a claim contains it', () => {
    const [limit] = strict;
    const { initialWord } = extractTokens(limit!.example);
    expect(initialWord).toBe('Output');
    expect(openingWordAccepted('Output', new Set(), new Set())).toBe(false);
    expect(openingWordAccepted('Output', new Set(['output']), new Set())).toBe(true);
  });

  it('says what the strictness costs and what it buys', () => {
    const [limit] = strict;
    expect(limit!.text).toContain('A false alarm costs a revision round; a name that slipped through would cost a wrong claim.');
  });
});
```

Run: `npm test --workspace @robywire/site -- test/method.test.ts test/known-limits.test.ts`
Expected: FAIL — `takes its numbers from the gate configuration`, `what G4 says about words` and `Cannot read properties of undefined (reading 'filter')`

- [ ] **Step 8: Write the rules and the limits**

The rule texts, with the numbers still taken from the configuration, and the list of known limits. The sentence for the owner's release is gone from this file.

**In `site/src/lib/method.ts`, replace:**
```ts
import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';
import { releaseNote } from './receipts';

// The words of the method page that a test needs to reach: the nine rules of
// the gate, whose numbers come from the gate's own configuration, and the
// seven stages of the pipeline, which are written in the future tense because
// none of them is running yet.

export interface GateRule {
```

**with:**
```ts
import { defaultConfig } from '@robywire/gate';
import type { CheckId, GateConfig } from '@robywire/gate';

// The words of the method page that a test needs to reach: the nine rules of
// the gate, whose numbers come from the gate's own configuration, the known
// limits of those rules, and the seven stages of the pipeline, which are
// written in the future tense because none of them is running yet. The
// sentences whose tense depends on a part of the Desk being live are in copy.ts.

export interface GateRule {
```

**In `site/src/lib/method.ts`, replace:**
```ts
}

/** The nine deterministic checks in plain English, with the limits taken from `config`. */
export function gateRules(config: GateConfig = defaultConfig()): GateRule[] {
  const { openingWords, takeaways, bodyWords } = config;
  const share = Math.round(config.analysisShareCap * 100);
  return [
    {
      id: 'G1',
      name: 'Frontmatter',
      text: `The title is not empty, the description is at most ${config.descriptionMax} characters, the date is a real date, the page address is lowercase words joined by hyphens, there are 1 to 3 categories from the closed list with at least one beat among them, and an author is named.`,
    },
    {
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, no heading asks a question, and a piece that rests on a company's own datasheet, press release, briefing or demo has a section on what could not be verified.`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence cites at least one claim, and every claim a sentence cites exists.',
    },
    {
      id: 'G4',
      name: 'Values',
      text: 'Every number, date and name in a factual sentence appears among the values of a claim that sentence cites, and every value a claim lists is really in its quoted passage; the name check is strict on purpose, because a false alarm only sends a draft back for revision.',
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in quotation marks is word for word inside the quoted passage of a claim that the sentence cites.',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet may appear only as an attribution that names the outlet, never in analysis, and a piece that uses one is held for the owner instead of being published.',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title, description, opening and takeaways, makes up at most ${share} percent of the body's sentences, and may not bring in a number, date or name that no factual sentence contains.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each comes from a fixed template that describes one claim's basis or status, and the gate writes the sentence again and requires an exact match.`,
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: 'The page address is not already in use, the title is not a near-duplicate of a recent title, and none of the banned filler phrases appears.',
    },
  ];
}

/** What the site shows for a held draft that the owner decides to publish. The words quoted are the ones the receipts page uses. */
export const OWNER_RELEASE_TEXT = `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${releaseNote('owner')}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the article.`;

export interface PipelineStage {
```

**with:**
```ts
}

/**
 * The nine deterministic checks in plain English, with the limits taken from `config`. Each sentence says what the code
 * really checks: method.test.ts shows the claims it makes about words with the real reader, and the gate's own tests
 * show the rest.
 */
export function gateRules(config: GateConfig = defaultConfig()): GateRule[] {
  const { openingWords, takeaways, bodyWords, headingMax } = config;
  const share = Math.round(config.analysisShareCap * 100);
  const overlap = Math.round(config.titleSimilarityThreshold * 100);
  return [
    {
      id: 'G1',
      name: 'Frontmatter',
      text: `The title and the description are not empty, the description is at most ${config.descriptionMax} characters, the date is a real date, the page address is lowercase letters and digits joined by single hyphens, there are 1 to 3 categories, all different, from the closed list, with at least one beat among them, and the author is the Desk, so a piece cannot carry a human's name.`,
    },
    {
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
      id: 'G3',
      name: 'Coverage',
      text: 'Every factual sentence, the title and the description included, cites at least one claim, and every claim a sentence cites exists.',
    },
    {
      id: 'G4',
      name: 'Values',
      text: 'Every number, date and name in a factual sentence appears among the values of a claim that sentence cites; numbers written in words are read like digits ("twelve kilograms" is 12 kg) and words that state an amount with no figure to check ("half", "twice", "doubled", "tenfold") are refused; a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites; a section heading has no number, date or quotation and no capitalised word that no claim cited in that section contains; and every value a claim lists is really in its quoted passage.',
    },
    {
      id: 'G5',
      name: 'Quotes',
      text: 'Any passage in double quotation marks in the title, the description or a factual or analysis sentence is word for word inside the quoted passage of a claim that the sentence cites, where spacing, dashes and the shape of quotation marks and apostrophes do not matter and case and punctuation do.',
    },
    {
      id: 'G6',
      name: 'Sourcing',
      text: 'A claim that comes from another outlet may appear only in a factual sentence that names the outlet and is marked as an attribution, never in analysis; the article labels such a sentence "Unconfirmed.", and a piece that uses one is held for the owner instead of being published.',
    },
    {
      id: 'G7',
      name: 'Analysis',
      text: `Analysis, the Desk's own reading of the facts, is labelled, stays out of the title, description, opening and takeaways, makes up at most ${share} percent of the body's sentences, may not bring in a number (written in digits or words), date or name that no factual sentence contains, and must open with an ordinary function word or a word that some factual sentence uses.`,
    },
    {
      id: 'G8',
      name: 'Limitations',
      text: `The sentences under "What we couldn't verify" are never freely written: each describes a group of claims that share one basis or one status through a fixed template, cites each claim once in ascending order, and the gate writes the sentence again and requires an exact match.`,
    },
    {
      id: 'G9',
      name: 'Hygiene',
      text: `The page address is not already in use, the title is not a near-duplicate of a title published in the last ${config.titleWindowDays} days (its words overlap theirs by ${overlap} percent or more, counting shared words over all words), and none of the banned filler phrases appears in the title, description, headings, body or limitations.`,
    },
  ];
}

/** One thing the checks cannot do, with a sentence that shows it with the real token reader. */
export interface KnownLimit {
  /**
   * `unseen`: the reader finds no number, date, name or amount in the example, so no claim is compared with it.
   * `strict`: the reader refuses the example's first word although the sentence may be fine.
   */
  kind: 'unseen' | 'strict';
  text: string;
  example: string;
}

/**
 * What the code cannot see, and where it refuses more than it should. The limit that meaning is not checked is
 * written in copy.ts, because who checks it is a matter of what is live.
 */
export const KNOWN_LIMITS: readonly KnownLimit[] = [
  {
    kind: 'unseen',
    text: 'Ordinals such as first, second and third are not read, so a sentence can say "the second plant" and the gate compares it with no claim.',
    example: 'The second plant opened in the third quarter.',
  },
  {
    kind: 'unseen',
    text: 'Vague quantities such as "a couple", "several", "a few" and "dozens" are not read either.',
    example: 'The plant shipped several arms and a couple of grippers, and dozens of units followed.',
  },
  {
    kind: 'unseen',
    text: 'The words "zero", "none" and "no" are not read as numbers.',
    example: 'The plants shipped zero arms, and none were left.',
  },
  {
    kind: 'unseen',
    text: 'A date that is not written out, such as "last year" or "next month", is not read.',
    example: 'It shipped last year and will ship next month.',
  },
  {
    kind: 'unseen',
    text: 'A name that starts with a lowercase letter, such as iRobot or xAI, cannot be seen by a rule that looks for capital letters.',
    example: 'iRobot and xAI joined the round.',
  },
  {
    kind: 'strict',
    text: 'The name check is strict on purpose: it reads every capitalised word as a name, so an ordinary capitalised word, such as a noun that opens a sentence or a word in a Title Case heading, sends a draft back for revision. A false alarm costs a revision round; a name that slipped through would cost a wrong claim.',
    example: 'Output rose 5 percent.',
  },
];

export interface PipelineStage {
```

Run: `npm test --workspace @robywire/site -- test/method.test.ts test/known-limits.test.ts test/copy.test.ts`
Expected: FAIL — `has no file that writes a sentence about a pipeline that writes the site outside copy.ts and live.ts` (the method page still writes its own sentences; it is the only file left).

- [ ] **Step 9: Rewrite the method page to use the copy**

The page asks `copy.ts` for every paragraph that depends on a flag, draws the list of what is not running from `notRunningYet`, and gets two new sections: the known limits (the limits of `method.ts` and the limit on meaning from `copy.ts`) and, at the end of the scoreboard, the caveat.

**In `site/src/pages/method/index.astro`, replace:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { OWNER_RELEASE_TEXT, PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

const rules = gateRules();
---

<Base
  title="Method"
  description="How Robywire is made: the two kinds of source, the claim ledger, the nine rules of the gate, what the Desk never does, and the scoreboard of defects the gate was tested against."
  canonicalPath="/method/"
>
```

**with:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import {
  deskIntro,
  gateIntro,
  holdsText,
  meaningLimit,
  methodDisclosure,
  modelCheckText,
  notRunningNote,
  notRunningYet,
  ownerReleaseText,
  scoreboardCaveat,
  trialText,
} from '../../lib/copy';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { KNOWN_LIMITS, PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

const rules = gateRules();
const notRunning = notRunningYet();
const note = notRunningNote();
const trial = trialText();
---

<Base
  title="Method"
  description="How Robywire is made: the two kinds of source, the claim ledger, the nine rules of the gate and their known limits, what the Desk never does, and the scoreboard of defects the gate was tested against."
  canonicalPath="/method/"
>
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
    <div class="prose">
      <h2 id="what">What the Desk is</h2>
      <p>
        Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code
        decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot
        trace is not published.
      </p>

      <h2 id="today">What exists today, and what does not</h2>
      <p>
        Built and tested: the gate with its nine checks, the format of the claim ledger, the renderer that turns a checked draft into a page, the receipts pages, the status, holds and corrections
        pages, and the scoreboard at the end of this page.
      </p>
      <p>
        Not running yet: the pipeline that finds, fetches and writes stories, the independent model check, and the daily schedule. Before the Desk publishes on its own it will run for five days in
        shadow, writing and checking but publishing nothing, and then for fourteen days in public, and a short written report will cover that trial. The parts that are not running are described in
        the future tense below.
      </p>

      <h2 id="sources">Two kinds of source</h2>
```

**with:**
```astro
    <div class="prose">
      <h2 id="what">What the Desk is</h2>
      <p>{deskIntro()}</p>

      <h2 id="today">What exists today, and what does not</h2>
      <p>
        Built and tested: the gate with its nine checks, the format of the claim ledger, the renderer that turns a checked draft into a page, the receipts pages, the fact card, the status, holds and
        corrections pages, the checks that stop the site from building a piece whose article, ledger or record of corrections disagree, and the scoreboard at the end of this page.
      </p>
      {
        notRunning.length > 0 && (
          <>
            <p>Not running yet:</p>
            <ul>
              {notRunning.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </>
        )
      }
      {trial !== undefined && <p>{trial}</p>}
      {note !== undefined && <p>{note}</p>}

      <h2 id="sources">Two kinds of source</h2>
```

**In `site/src/pages/method/index.astro`, replace:**
```astro

      <h2 id="gate">The gate: nine rules</h2>
      <p>
        The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same
        answer. If one fails, the draft is not published; it goes back for revision with the exact failures. In plain English the rules are these.
      </p>
    </div>
    <dl class="facts rules">
```

**with:**
```astro

      <h2 id="gate">The gate: nine rules</h2>
      <p>{gateIntro()}</p>
    </div>
    <dl class="facts rules">
```

**In `site/src/pages/method/index.astro`, replace:**
```astro

    <div class="prose">
      <h2 id="model-check">The independent model check</h2>
      <p>
        On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and
        status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a
        second layer on top of the nine rules, never the only one. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some
        subtly distorted. It is not running yet.
      </p>

      <h2 id="holds">Holds</h2>
      <p>
        A piece is held when the gate cannot clear it: a check still fails after two rounds of revision, or a rule asks for a human decision, as G6 does for any piece that uses another outlet's
        reporting. A held draft is not published. It is designed to go to the owner as a draft pull request that carries the gate report. What was stopped and why is public on the
        <a href="/holds/">holds page</a>: the date, the beats and the reasons. The held text is not. A hold is the normal result when the Desk is unsure. A day with no piece is better than a day with a
        wrong one.
      </p>
      <p>{OWNER_RELEASE_TEXT}</p>

      <h2 id="corrections">Corrections and retractions</h2>
```

**with:**
```astro

    <div class="prose">
      <h2 id="limits">What the checks cannot see</h2>
      <p>
        The rules above do what they say, and no more. These are the known limits: the places where a sentence can say something that no rule compares with a claim, and one place where the gate
        refuses more than it should.
      </p>
      <ul>
        {
          KNOWN_LIMITS.map((limit) => (
            <li>{limit.text}</li>
          ))
        }
        <li>{meaningLimit()}</li>
      </ul>

      <h2 id="model-check">The independent model check</h2>
      <p>{modelCheckText()}</p>

      <h2 id="holds">Holds</h2>
      <p>
        {holdsText()} What was stopped and why is public on the <a href="/holds/">holds page</a>: the date, the beats and the reasons. The held text is not. A hold is the normal result when the Desk is
        unsure. A day with no piece is better than a day with a wrong one.
      </p>
      <p>{ownerReleaseText()}</p>

      <h2 id="corrections">Corrections and retractions</h2>
```

**In `site/src/pages/method/index.astro`, replace:**
```astro

      <h2 id="disclosure">Disclosure</h2>
      <p>
        Every page says in its footer that the site is written by an automated pipeline, and the byline of every article says the same. No piece carries a human author's name, and none pretends to
        have been reported by a person.
      </p>

      <h2 id="never">What the Desk never does</h2>
```

**with:**
```astro

      <h2 id="disclosure">Disclosure</h2>
      <p>{methodDisclosure()}</p>

      <h2 id="never">What the Desk never does</h2>
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
      <p class="figure">{scoreboardHeadline(board)}</p>
      <p>The unbroken golden piece {board.baselinePasses ? 'publishes' : 'does not publish'}.</p>
    </div>
    <TableWrap label="Seeded defects and the gate's result for each">
```

**with:**
```astro
      <p class="figure">{scoreboardHeadline(board)}</p>
      <p>The unbroken golden piece {board.baselinePasses ? 'publishes' : 'does not publish'}.</p>
      <p>{scoreboardCaveat()}</p>
    </div>
    <TableWrap label="Seeded defects and the gate's result for each">
```

Run: `npm test --workspace @robywire/site -- test/method.test.ts test/known-limits.test.ts test/copy.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 10: Update the README**

**In `README.md`, replace:**
```markdown
# Robywire

Robywire is a daily robotics news site. The Desk is the pipeline that writes it. A piece publishes without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify is held for the owner.

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).
```

**with:**
```markdown
# Robywire

Robywire is a robotics news site, and the Desk is the pipeline that will write it. A piece will publish without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify will be held for the owner. This repository holds the gate, the ledger format, the renderer and the site; the Desk itself is not built yet (see Which parts are live).

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).
```

**In `README.md`, replace:**
```markdown
Every `status` starts as `unverified`; the Desk changes it as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Requirements

```

**with:**
```markdown
Every `status` starts as `unverified`; the Desk changes it as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that Plan 1 does not build: the evidence store, the independent model check, the daily schedule and the pipeline that writes and publishes. Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## Requirements

```

- [ ] **Step 11: Run everything**

Every Milestone 3 failure code already has its plain-English label: the test of the labels, `site/test/reasons.test.ts`, fails for a code that has none, and it runs here with the rest.

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 12: Read the copy in the built site**

The production build has no piece, and says only what is running.

Run: `npm run build`
Expected: PASS — `Complete!`

Run: `grep -o '<meta name="description" content="A robotics news site built so that every factual sentence links to the passage of a primary source it rests on. An automated pipeline will write it.">' site/dist/index.html`
Expected: PASS — `An automated pipeline will write it.`

Run: `grep -o 'Robywire will be written by an automated pipeline, the Desk.' site/dist/index.html`
Expected: PASS — `Robywire will be written by an automated pipeline, the Desk.`

Run: `grep -c 'is written by an automated pipeline' site/dist/index.html site/dist/method/index.html`
Expected: FAIL — `site/dist/index.html:0` and `site/dist/method/index.html:0`

The method page lists what is not running, with the hold, the owner's release and the correction command in the list, and says what the checks cannot see.

Run: `grep -o '<li>the command that records a correction or a retraction</li>' site/dist/method/index.html`
Expected: PASS — `<li>the command that records a correction or a retraction</li>`

Run: `grep -o '<li>the owner&#39;s release of a held draft</li>' site/dist/method/index.html`
Expected: PASS — `<li>the owner&#39;s release of a held draft</li>`

Run: `grep -o '<h2 id="limits">What the checks cannot see</h2>' site/dist/method/index.html`
Expected: PASS — `What the checks cannot see`

Run: `grep -o 'Ordinals such as first, second and third are not read' site/dist/method/index.html`
Expected: PASS — `Ordinals such as first, second and third are not read`

Run: `grep -o 'The scoreboard is a floor, not a proof.' site/dist/method/index.html`
Expected: PASS — `The scoreboard is a floor, not a proof.`

The audit passes on the production build, which still carries no trace of the fixtures.

Run: `npm run audit:prod`
Expected: PASS — `ok    A13` and `Passed: 17 checks.`

Now the fixture build. The receipts page of a piece says that the store will be kept, not that it is.

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Run: `grep -o 'The full source snapshot will be kept in a private evidence store, which is not running yet' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/index.html`
Expected: PASS — `will be kept in a private evidence store, which is not running yet`

Run: `grep -c 'Each number in the article' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/index.html`
Expected: FAIL — `0`

Run: `npm run audit`
Expected: PASS — `Passed: 16 checks.`

- [ ] **Step 13: Measure the fixture site**

Run: `npm run lighthouse`
Expected: PASS — `Lighthouse, 5 pages` and `All scores are 95 or more.`

- [ ] **Step 14: Commit**

```bash
git add README.md package.json site/src site/test
git commit -m "feat: say only what is running: a LIVE switchboard for the copy, the nine rules as the code enforces them, their known limits, and the scoreboard caveat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 83: Verify Milestone 3 from a clean install

This task changes nothing and makes no commit. It is the proof that the four milestones of Plan 1 (the three of the first version and the hardening that Milestone 3 added) hold together: everything installed from the lock file alone, and every check passing, in the order CI runs them. It then writes down what this proof does not cover.

- [ ] **Step 1: Start from nothing**

Delete every installed package, as a fresh clone would have none.

Run: `rm -rf node_modules gate/node_modules evals/node_modules site/node_modules`
Expected: PASS

Run: `npm ci --no-audit --no-fund`
Expected: PASS — `added`, followed by the number of packages.

`npm ci` fails if `package-lock.json` and the `package.json` files disagree, so this also proves the lock file is complete. Milestone 3 installed nothing.

- [ ] **Step 2: Run every check**

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `Passed: 17 checks.`, `Passed: 16 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a minute or two. In order, you will see: `Result` from `astro check` with `0 errors`; the test summaries of `gate`, `evals` and `site`, none of them failed; the table of the seeded defects, ending with `53 of 53 cases caught (100.0%)` and `PASS: every seeded defect was caught.`; `Fixtures are up to date.`; the production build, which prints an Astro warning for each page that the collections `news` and `ledger` are empty (that is right: a production build has no pieces yet); `Passed: 17 checks.` from `audit:prod` (the audit has 17 checks, and the production run adds the fixture check, A13); the fixture build; `Passed: 16 checks.` from `audit`; and last the Lighthouse table.

The lines of the output that matter, in the order they appear, as they were when this plan was verified (on another machine a score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the finished Milestone 3 and change when a test is added; the rest of the output is build and test noise:

```text
Result (99 files):
- 0 errors

Test Files  34 passed (34)
Tests  1958 passed (1958)
Test Files  5 passed (5)
Tests  154 passed (154)
Test Files  36 passed (36)
Tests  1057 passed (1057)

53 of 53 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

Passed: 17 checks.   (audit:prod)
Passed: 16 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

- [ ] **Step 3: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing.

The checks wrote no file that is not already committed: `evals/scoreboard/seeded.json` is rewritten with the same content, and `site/dist` and `.astro` are ignored by git.

- [ ] **Step 4: Match the milestones to their proof**

Section 14 of the design spec gives each milestone of Plan 1 a "done when" line. Milestone 3 of this plan (the hardening, in three parts) was added after a review of Plan 1, and its "done when" is written here; it is a different thing from the spec's own milestone 3, which is the pipeline of Plan 2. Each line has a command that shows it.

| Milestone | Done when | The command that shows it |
|---|---|---|
| 0. Foundations: repo, workspaces, schemas, CI skeleton, `sources.yml` | Typecheck and CI pass | `npm run typecheck` prints `0 errors` for `astro check` and exits 0 for `tsc` in `gate` and `evals`. CI runs the steps of `npm run verify`, and `site/test/verify.test.ts` keeps the two identical. `sources.yml` is validated by `gate/test/sources.test.ts`, which runs in `npm test`. **The CI half is deferred, see below.** |
| 1. Gate, built test-first against the seeded-defect fixtures | 100% of deterministic defects caught | `npm run evals:seeded` prints `53 of 53 cases caught (100.0%)` and `PASS: every seeded defect was caught.` Every failure code of G1 to G9 (43 of them) is covered, and a test fails if one is not. |
| 2. Site shell and design system, rendered from fixture pieces | Build, schema, link and Lighthouse checks pass | Build: `npm run build` and `npm run build:fixtures` finish with `[build] Complete!`. Schema: the content collections validate every piece and ledger against the gate's own schemas, and a bad file stops the build. Link: check A8 of `npm run audit` resolves every internal link, file and `#fragment`, and A9 and A11 check the receipts pages and claim markers. Lighthouse: `npm run lighthouse` prints 95 or more in every category for five pages. **The CI half is deferred, see below.** |
| 3a. Gate hardening (Tasks 71 to 76) | Every hole the review found in the gate is closed, and each closure has a seeded defect | `npm run evals:seeded` (53 cases, 13 more than before Milestone 3) and `gate/test/failure-codes.test.ts`, `evals/test/coverage.test.ts` and `site/test/reasons.test.ts`, which fail for a failure code without a unit test, a seeded case or a plain-English label. |
| 3b. Publishing integrity (Tasks 77 to 80) | What a reader sees is what the gate cleared, and the page says so when it is not the whole story | `npm test` (the tests of `match-pieces`, `render`, `desk-state` and `receipts`), `npm run fixtures:check`, and A16 of `npm run audit`, which fails an article that rests on another outlet and has no `Unconfirmed.` label. The build stops when an article, its ledger and the record of corrections disagree. |
| 3c. The fact card, honest copy and this check (Tasks 81 to 83) | The card is on the page, the public copy claims only what is running, and everything above holds from a clean install | A17 and A12 of `npm run audit`; `site/test/copy.test.ts`, which says what the copy is for every setting of the `LIVE` flags; Lighthouse; and this task. |

- [ ] **Step 5: Write down what is deferred**

These are not proved by anything above. They are entry checks for Plan 2, and none of them is a reason to doubt the work of Plan 1:

- **CI has never run on GitHub.** `site/test/verify.test.ts` proves that `.github/workflows/ci.yml` runs the steps of `npm run verify` in the same order, and this task proves that they pass on a clean local install. Nobody has seen a run on GitHub, because the repository is not on GitHub yet. The first push must show every step green, including Lighthouse on `ubuntu-latest` (Chrome is installed there and the workflow starts it without its sandbox because GitHub sets `CI=true`). Do not start the pipeline of Plan 2 before it has.
- **Lighthouse is measured on one machine**, with simulated throttling. The threshold is 95 and the scores here are 100, so there is room, but another machine can differ.
- **The byline wording is the owner's.** `DESK_BYLINE_LABEL` in `gate/src/constants.ts` ("automated, with sources linked") says nothing that is not true, and the owner has not confirmed it. The publication name and the domain (`https://robywire.example`, set by `SITE_URL`) are placeholders until the owner decides them.
- **Plan 2 passes `release` and `updatedAt` to `renderDraft`.** `release` is `auto` for a piece that the gate cleared and `owner` for a held piece that the owner released; `updatedAt` is the UTC day of the latest correction. `renderDraft` refuses a release that the gate's route contradicts, and the site build refuses a piece whose body is not what `renderBody` writes from its ledger, whose `updatedAt` does not match the corrections in the desk state, or whose ledger `renderBody` cannot write.
- **The present-tense copy of every flag was written ahead of time.** `site/src/lib/copy.ts` has a sentence for each flag turned on. Nobody has read those against a Desk that runs. When Plan 2 turns a flag on, read the sentences that `copy.test.ts` names, and rewrite the seven stages of the pipeline in `site/src/lib/method.ts` in the present tense (a test fails until they are).

- [ ] **Step 6: Write down the limits that remain**

These are known, and each is a decision, not an oversight. The first group is on the method page; the second is for whoever writes Plan 2.

On the method page, as limits of the checks: ordinals (first, second); vague quantities ("a couple", "several"); "zero", "none" and "no"; dates that are not written out ("last year"); names that start with a lowercase letter (iRobot, xAI); and meaning, which no code checks. The model check of Plan 2 is the answer to the last, and it is not running.

For the author of Plan 2:

- **The opening-word and heading-name rules are strict.** A capitalised ordinary word that no cited claim contains (a noun that opens a sentence, such as "Output rose ...", or a Title Case heading) is refused (`G4_INITIAL_WORD_UNSUPPORTED`, `G4_HEADING_NAME`) and costs a revision round. The composer prompt must tell the model to open a sentence with a word from its claims or a plain function word (the list is `SENTENCE_STARTERS` in `gate/src/grounding.ts`), and to write headings in lowercase except for the words of the claims it cites.
- **A grouped limitation sentence reads awkwardly when a claim has no number value.** The figure of a claim is its first number value, or else its first value of any kind, so the press-release sentence of the golden piece begins "The Fixture Robotics Tarnmoor shipment, 1 October 2026 announcement date, ...", and one group can list a dozen items. G8 pins the exact text, so improving the wording means changing the templates in `gate/src/limitations.ts`, the figure rule and the golden piece together. There is no cap on the size of a group.
- **Two neighbouring body sections with the same heading cannot be told apart in the ledger**, and a section with no sentence cannot be kept: the rendered article merges the first and drops the second. The composer must emit neither.
- **The basis of a claim from another outlet.** The fifth fixture's claim from Mercer Wire has the basis `filing`, because the basis vocabulary has no "reported by another outlet" value and adding one needs a new limitation sentence. The extractor of Plan 2 decides what a tier-2 claim's basis is.
- **G9 compares calendar days in UTC.** The Desk must pass real `YYYY-MM-DD` dates for the recent titles: a date that is not real makes the title be compared, which can only add false alarms. `NewsFrontmatter` accepts a date before the year 1000 that G1 rejects.
- **The scoreboard measures the checks, not the Desk.** It is a floor: 53 defects that were thought of and seeded. Measuring the Desk on live stories starts with the shadow week of Plan 3.

Plan 1 is finished. Plan 2 builds the Desk on top of it: the pipeline stages, the model check G10, the daily run, and the deploy.

