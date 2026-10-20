## Plan 3b (part 2) — The vocabulary of the new domain

**Goal:** the Desk, the gate and the site speak about AI agents in crypto. After this part the seven beats are the crypto ones, the two robotics-only bases are renamed, every reader-facing and model-facing sentence is about the new domain, and price predictions, advice to buy or sell, hype and cashtags are blockers.

| Task | What it does |
|---|---|
| 6 | The beats (`payments-commerce`, `identity-trust`, `wallets-keys`, `protocols-standards`, `agent-infrastructure`, `security-incidents`, `policy-regulation`, plus `funding`) and the two renamed bases (`datasheet` → `docs`, `press-release` → `announcement`), applied by a one-off script and by hand where a table needs words; the golden story stays as it is and is remapped. |
| 7 | The words: three prompts, the site copy, the footer, the labels of the beats and bases, the notes for the new bases, the banned filler, the README. |
| 8 | `G9_POLICY_PHRASE` (a blocker) and the cashtag rule. |

**Starting state:** Part 01 done; `npm run verify` green.

**Rules for every task in this part:** those of Part 01. The one-off script of Task 6 is written outside the repository and is not committed.

**Decision recorded here (it replaces decision 5 of the index).** The vocabulary changes as little as the domain allows. Bases: `docs` (what a project says about its own work in its documentation, blog or paper-like post), `announcement` (a project's or company's own announcement or press release), `briefing`, `demo`, `paper`, `filing`, `standard` (a published standard, specification or proposal: an EIP, an ERC, an RFC, a W3C note), `measured`, `reported`. The safe bases (no note needed) are unchanged: `filing`, `standard`, `paper`, `measured`. A basis for chain data or for source code is added when the Desk has a reader for them; until then no source kind may grant one, and a vocabulary that has a word nobody can use would only invite the model to use it.

---

### Task 6: The beats and the bases of the domain

**Files:**
- Modify: `gate/src/constants.ts`, `desk/src/sources.ts` (`COMPANY_GROUP_BEATS`), `desk/src/stages/claim-grounding.ts` (`ALLOWED_BASES`, `KIND_WORDS`), `gate/src/limitations.ts` (`BASIS_NOTES`), `desk/src/prompts/verify.ts` (`BASIS_MEANING`), `site/src/lib/format.ts` (`LABELS`, `BLURBS`), `site/src/lib/card.ts` (`BASIS_WORDS`)
- Modify (by script, then by hand where the compiler says): every file that names an old beat or a quoted old basis, found by `grep -rlE "humanoids|home-consumer|industrial-warehouse|field-mobility|software-autonomy|components-supply-chain|policy-standards" gate desk site evals scripts sources.yml README.md docs/runbook.md --include='*.ts' --include='*.astro' --include='*.json' --include='*.yml' --include='*.md' --include='*.mdx' | grep -v content-fixtures`
- Create: `gate/test/vocabulary.test.ts`
- Regenerate: `site/src/content-fixtures/**`, `evals/scoreboard/seeded.json`

The mapping of the beats (mechanical; the golden story is a robot arm and it will be filed under a crypto beat, which is harmless: it is a made-up world for tests and for the preview of the site):

| Old | New | Label on the site |
|---|---|---|
| `humanoids` | `payments-commerce` | Payments & commerce |
| `home-consumer` | `wallets-keys` | Wallets & keys |
| `industrial-warehouse` | `agent-infrastructure` | Agent infrastructure |
| `field-mobility` | `identity-trust` | Identity & trust |
| `software-autonomy` | `protocols-standards` | Protocols & standards |
| `components-supply-chain` | `security-incidents` | Security & incidents |
| `policy-standards` | `policy-regulation` | Policy & regulation |
| `funding` | `funding` | Funding |

The mapping of the bases: `datasheet` → `docs`, `press-release` → `announcement`. Nothing else changes.

- [ ] **Step 1: Write the failing test**

`gate/test/vocabulary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BASES, BEATS, CATEGORY_VOCAB, CROSS_TAGS, SAFE_BASES } from '../src/constants';
import { BASIS_NOTES } from '../src/limitations';

// The closed vocabularies of the domain. A piece is filed under these beats and each claim has one of these bases; the gate refuses anything else.

describe('the beats', () => {
  it('are the seven of AI agents in crypto, in the order of the site', () => {
    expect(BEATS).toEqual([
      'payments-commerce',
      'identity-trust',
      'wallets-keys',
      'protocols-standards',
      'agent-infrastructure',
      'security-incidents',
      'policy-regulation',
    ]);
  });

  it('have one cross tag, funding, and the vocabulary of categories is the beats and the tag', () => {
    expect(CROSS_TAGS).toEqual(['funding']);
    expect(CATEGORY_VOCAB).toEqual([...BEATS, 'funding']);
  });
});

describe('the bases', () => {
  it('are the nine of the domain: documentation and announcements of a project instead of datasheets and press releases', () => {
    expect([...BASES].sort()).toEqual(['announcement', 'briefing', 'demo', 'docs', 'filing', 'measured', 'paper', 'reported', 'standard']);
  });

  it('keep the safe ones: a filing, a standard, a paper or a measurement needs no note; what a project says of itself and what another outlet reports does', () => {
    expect([...SAFE_BASES].sort()).toEqual(['filing', 'measured', 'paper', 'standard']);
    for (const basis of ['docs', 'announcement', 'briefing', 'demo', 'reported'] as const) expect((SAFE_BASES as readonly string[]).includes(basis), basis).toBe(false);
  });

  it('have a note for each, and none says datasheet or press release', () => {
    for (const basis of BASES) expect(BASIS_NOTES[basis], basis).toBeTruthy();
    for (const note of Object.values(BASIS_NOTES)) expect(note).not.toMatch(/datasheet|press release/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/gate -- test/vocabulary.test.ts`
Expected: FAIL (`BEATS` is still `humanoids ...`).

- [ ] **Step 3: Change the constants**

`gate/src/constants.ts`: replace the doc comment and the array of `BEATS` with

```ts
/** The seven beats of the publication (AI agents in crypto). A closed vocabulary. */
export const BEATS = [
  'payments-commerce',
  'identity-trust',
  'wallets-keys',
  'protocols-standards',
  'agent-infrastructure',
  'security-incidents',
  'policy-regulation',
] as const;
```

(the comment "The seven beats from the content contract (section 4)" becomes "The seven beats of the publication, from the design of the blog-first redesign"), and in `BASES` replace `'datasheet',` with `'docs',` and `'press-release',` with `'announcement',`, in the same positions. Replace the comment above `SAFE_BASES` ("not a company's own claim") with "not a project's or a company's own claim".

- [ ] **Step 4: Run the one-off script**

Write this to `$TMPDIR/remap-vocabulary.mjs` (outside the repository) and run it from the repository root with `node $TMPDIR/remap-vocabulary.mjs`. It prints every file it changed.

```js
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BEATS = {
  humanoids: 'payments-commerce',
  'home-consumer': 'wallets-keys',
  'industrial-warehouse': 'agent-infrastructure',
  'field-mobility': 'identity-trust',
  'software-autonomy': 'protocols-standards',
  'components-supply-chain': 'security-incidents',
  'policy-standards': 'policy-regulation',
};
const BASES = { datasheet: 'docs', 'press-release': 'announcement' };

const ROOTS = ['gate', 'desk', 'site', 'evals', 'scripts', 'sources.yml', 'README.md', 'docs/runbook.md'];
const SKIP = new Set(['node_modules', 'dist', '.astro', 'runs', 'evidence', '.claude', '.git', 'coverage']);
const CODE = /\.(ts|tsx|astro|json|mjs|yml|yaml|mdx|html|xml)$/;

function* files(entry) {
  const stat = statSync(entry, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isFile()) return yield entry;
  for (const name of readdirSync(entry)) if (!SKIP.has(name)) yield* files(path.join(entry, name));
}

const bounded = (slug) => new RegExp(`(?<![A-Za-z0-9-])${slug}(?![A-Za-z0-9-])`, 'g');
const quoted = (slug) => new RegExp(`(?<=['"\`])${slug}(?=['"\`])`, 'g');

let changed = 0;
for (const root of ROOTS) {
  for (const file of files(root)) {
    if (file.includes('content-fixtures')) continue; // regenerated
    const markdown = file.endsWith('.md');
    if (!markdown && !CODE.test(file)) continue;
    let text = readFileSync(file, 'utf8');
    const before = text;
    for (const [from, to] of Object.entries(BEATS)) {
      text = markdown ? text.replaceAll(`\`${from}\``, `\`${to}\``) : text.replace(bounded(from), to);
    }
    for (const [from, to] of Object.entries(BASES)) {
      text = markdown ? text.replaceAll(`\`${from}\``, `\`${to}\``) : text.replace(quoted(from), to);
    }
    if (text !== before) {
      writeFileSync(file, text);
      changed++;
      console.log(file);
    }
  }
}
console.log(`${changed} files changed`);
```

- [ ] **Step 5: Do by hand what a script cannot see (unquoted keys and words)**

Run `npm run typecheck`. The compiler lists every table that is keyed by `Category` or `Basis` and now lacks a key. Fix each as follows; these are all of them as far as the code is read, and the compiler is the proof:

- `gate/src/limitations.ts`, `BASIS_NOTES`: the keys `datasheet` and `'press-release'` become `docs` and `announcement`, with the sentences

```ts
  docs: "What is cited here comes from the project's own documentation; no independent testing was available.",
  announcement: "What is cited here comes from the project's own announcement; no independent confirmation was available.",
```

  and the sentence of `briefing` becomes `'What is cited here was given by the project in a briefing; no independent confirmation was available.'`, of `demo` `'What is cited here was shown in a demonstration or a test; the source does not describe independent testing.'` (the order of the keys follows `BASES`).
- `desk/src/prompts/verify.ts`, `BASIS_MEANING`: `docs: "the passage is from a project's own documentation or its own post"`, `announcement: "the passage is a project's or a company's own announcement"` (these replace the lines for `datasheet` and `'press-release'`).
- `site/src/lib/card.ts`, `BASIS_WORDS`: `docs: 'documentation'`, `announcement: 'announcement'`.
- `site/src/lib/format.ts`: `LABELS` and `BLURBS` become

```ts
const LABELS: Record<Category, string> = {
  'payments-commerce': 'Payments & commerce',
  'identity-trust': 'Identity & trust',
  'wallets-keys': 'Wallets & keys',
  'protocols-standards': 'Protocols & standards',
  'agent-infrastructure': 'Agent infrastructure',
  'security-incidents': 'Security & incidents',
  'policy-regulation': 'Policy & regulation',
  funding: 'Funding',
};
```

```ts
const BLURBS: Record<Category, string> = {
  'payments-commerce': 'Agents that pay and get paid: stablecoin rails, micropayments, checkout and agent-to-agent commerce.',
  'identity-trust': 'Who an agent is and why to trust it: credentials, attestations, reputation and verification.',
  'wallets-keys': 'How agents hold and use keys: smart accounts, session keys, custody and signing.',
  'protocols-standards': 'The specifications agents use to talk, pay and prove: proposals, standards and open protocols.',
  'agent-infrastructure': 'The software under agents on chain: runtimes, oracles, data, indexing and tooling.',
  'security-incidents': 'Exploits, failures and audits that involve agents, and how they were found and fixed.',
  'policy-regulation': 'Law, regulators and guidance that touch agents and the money they handle.',
  funding: 'Rounds, acquisitions, public listings and shutdowns, filed under the beat they concern.',
};
```

- `desk/src/sources.ts`, `COMPANY_GROUP_BEATS`: the table maps the two groups of the made-up world (`industrial`, `software`) to beats; the script has already remapped its values to `agent-infrastructure` and `protocols-standards`. Check that, and change its comment to "A group of companies in `sources.yml` named for a beat of the vocabulary is that beat; the two groups of the made-up world of the tests are named for a field, and the table says their beats. Any other group has no beat, and its stories are not selected, because the Desk does not guess which beat a story is about." (Task 9 rewrites this file and keeps the table.)
- `desk/src/stages/claim-grounding.ts`: `ALLOWED_BASES['company-newsroom']` is `['announcement', 'docs', 'briefing', 'demo']` (the script has renamed the two; check the order); the doc comment above it says "A company's own page is a press release, a datasheet, a briefing or a demonstration" and becomes "A project's or a company's own page is an announcement, documentation, a briefing or a demonstration". `KIND_WORDS['company-newsroom']` becomes `'a project or company page'`.
- The tests that assert the old labels (`site/test/format.test.ts:69-72` and the lines around it, `site/test/desk-pages.test.ts:65`, `site/test/feed.test.ts:30,75`, `gate/test/frontmatter-consistency.test.ts:117`) are changed to the new labels from the table above (`'Humanoids'` → `'Payments & commerce'`, `'Industrial & warehouse'` → `'Agent infrastructure'`, and so on). The test `gives the labels the header and the chips show` lists all eight.

- [ ] **Step 6: Regenerate, run, and look for what is left**

```bash
npm run fixtures:generate --workspace @robywire/site
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
grep -rnE "humanoids|home-consumer|industrial-warehouse|field-mobility|software-autonomy|components-supply-chain|policy-standards" gate desk site evals scripts sources.yml --include='*.ts' --include='*.astro' --include='*.json' --include='*.yml' --include='*.mdx' | grep -v node_modules | head
```

Expected: all green; the last command prints only prose that the script left (a comment about "humanoids" in a test of the made-up world is fine; a table, a type or an assertion is not). `sources.yml` still lists robotics companies until Task 12, under group names the script has remapped (`humanoids:` became `payments-commerce:`, and the `beats:` of the outlets follow); the file parses, and `gate/test/sources.test.ts` and `desk/test/sources.test.ts` pass on it as they were, with the remapped names. Task 12 replaces the content.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: the beats are the seven of AI agents in crypto and the bases datasheet and press-release are docs and announcement" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The words of the new domain

Prompts, site copy, footer, banned filler and the README say "robotics" and "primary source" in places that a reader or a model sees. Nothing here changes a rule; it changes what the Desk and the site say.

**Files:**
- Modify: `desk/src/prompts/select.ts`, `desk/src/prompts/extract.ts`, `desk/src/prompts/verify.ts`, `desk/src/prompts/compose.ts`, `gate/src/config.ts`, `gate/src/limitations.ts` (`STATUS_NOTES`), `site/src/lib/copy.ts`, `site/src/lib/method.ts`, `README.md`, `docs/runbook.md`, `sources.yml` (header comment only)
- Modify (tests): `desk/test/prompts/*.test.ts`, `site/test/copy.test.ts`, `site/test/method.test.ts`, `site/test/known-limits.test.ts`, `gate/test/limitations.test.ts`, `gate/test/config.test.ts`

- [ ] **Step 1: Write the failing tests**

`site/test/copy-domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deskIntro, disclosure, siteDescription } from '../src/lib/copy';
import { LIVE } from '../src/lib/live';

const EVERY_SETTING = [
  { ...LIVE, publishing: false, scheduler: false },
  { ...LIVE, publishing: true, scheduler: false },
  { ...LIVE, publishing: true, scheduler: true },
];

describe('the words of the site', () => {
  it.each(EVERY_SETTING)('say AI agents in crypto and not robotics, whatever is live (%#)', (live) => {
    for (const text of [siteDescription(live), deskIntro(live), disclosure(live)]) {
      expect(text).not.toMatch(/robot/i);
    }
    expect(siteDescription(live)).toMatch(/AI agents in crypto/);
  });

  it.each(EVERY_SETTING)('say what is true in the footer: the sources are linked, the pipeline writes, and it is not advice (%#)', (live) => {
    const text = disclosure(live);
    expect(text).toContain('automated pipeline');
    expect(text).toContain('Nothing here is financial advice.');
    expect(text).not.toMatch(/primary source/i);
  });
});
```

`desk/test/prompts/domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { composeSystem } from '../../src/prompts/compose';
import { extractSystem } from '../../src/prompts/extract';
import { selectSystem } from '../../src/prompts/select';
import { verifySystem } from '../../src/prompts/verify';

describe('the prompts say what the publication is', () => {
  it.each([
    ['select', selectSystem()],
    ['extract', extractSystem()],
    ['verify', verifySystem()],
    ['compose', composeSystem()],
  ])('%s: AI agents in crypto, no robotics', (_name, prompt) => {
    expect(prompt).not.toMatch(/robot/i);
  });

  it('the compose prompt says there is no price, no market call and no advice', () => {
    expect(composeSystem()).toContain('no price prediction, no market call and no advice to buy, sell or hold');
  });

  it('the select prompt says what the publication covers', () => {
    expect(selectSystem()).toContain('AI agents in crypto');
  });
});
```

(`selectSystem` is the name `desk/src/prompts/select.ts` exports; `grep -n "export function" desk/src/prompts/select.ts` shows it — use the real name.)

Also in `gate/test/config.test.ts` (or the file that tests `DEFAULT_BANNED_PHRASES`) add:

```ts
  it('has no phrase about robotics, and has the filler of the new domain', () => {
    expect(DEFAULT_BANNED_PHRASES.some((phrase) => /robot/.test(phrase))).toBe(false);
    expect(DEFAULT_BANNED_PHRASES).toContain("in today's fast-moving world of crypto");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/site -- test/copy-domain.test.ts` and `npm test --workspace @robywire/desk -- test/prompts/domain.test.ts`
Expected: FAIL (`robotics` in the text).

- [ ] **Step 3: Change the words**

`desk/src/prompts/select.ts:14`: `You are the story selector of ${PUBLICATION_NAME}, a publication about AI agents in crypto: agents that pay, hold keys, prove who they are, follow protocols, run on chain, get attacked and get regulated. Every claim of a piece comes from a source that the piece links.` and in line 18 replace `Tier 1 means a company\'s own newsroom, which is a primary source.` with `Tier 1 means a project's, a company's, a standards body's or a researcher's own page, which is a primary source.`. Add to the rubric of the same prompt (find the list of what makes a story worth it with `grep -n "worth\|rubric\|bar" desk/src/prompts/select.ts`) the sentence `Never choose a story whose point is a price, a market move or a token to buy.`

`desk/src/prompts/extract.ts:17`: `You are the claim extractor of ${PUBLICATION_NAME}, a publication about AI agents in crypto whose every sentence traces to a passage of a source.` In the rule about product names (the line that starts `- List in "values" every name`) replace the example `("Digit 5", "Salem, Oregon")` with `("x402", "Ethereum Foundation")` and `A product name that ends in a number, such as "Digit 5", is listed as a name ("Digit 5") and its number is listed too as a number ("5").` with `A name that ends in a number, such as "ERC-8004" or "x402", is listed as a name ("ERC-8004") and its number is listed too as a number ("8004").` In the line about the label example, `"delivery within 12 weeks"` becomes `"settles within 2 seconds"` (and `"lead time"` becomes `"settlement time"`).

`desk/src/prompts/verify.ts:38`: `You are the independent checker of ${PUBLICATION_NAME}, a publication about AI agents in crypto whose every sentence must be supported by a passage of a source. You did not write the piece. Your job is to find what the passages do not support.`

`desk/src/prompts/compose.ts`: in `composeInstructions` (find the first line of the instructions with `grep -n "PUBLICATION_NAME" desk/src/prompts/compose.ts`) replace the domain description by `a publication about AI agents in crypto`, and add to `composeRules` the rule (placed with the other blocking rules; the marker is the one the file already uses)

```ts
    '- (blocks) Write no price prediction, no market call and no advice to buy, sell or hold. Do not say where a price will go, do not call a token or a project a good or bad investment, and do not write a ticker with a dollar sign.',
```

`gate/src/config.ts`: in `DEFAULT_BANNED_PHRASES` replace `"in today's fast-moving world of robotics",` with

```ts
  "in today's fast-moving world of crypto",
  'in the ever-changing world of web3',
  'the future of finance is here',
```

`gate/src/limitations.ts`, `STATUS_NOTES`: replace `demonstrated` with `'What is cited here was demonstrated; the source does not report it live in production.'` and update the same strings in `gate/test/limitations.test.ts` (the `writes the demonstrated note` case).

`site/src/lib/copy.ts`:
- `siteDescription`: `const rule = 'Every factual sentence links to the passage of a source that it rests on.';` and the three returns become `'A publication about AI agents in crypto, built so that every factual sentence links to the passage of a source it rests on. An automated pipeline will write it.'`, `` `Daily writing on AI agents in crypto by an automated pipeline. ${rule}` `` and `` `Writing on AI agents in crypto by an automated pipeline. ${rule}` ``.
- `disclosure`: the two strings become `` `${PUBLICATION_NAME} is written by an automated pipeline, the Desk. Every factual sentence is traced to a passage of a source that the piece links; a sentence that rests on another outlet's reporting names the outlet; analysis is labelled. Nothing here is financial advice.` `` and the same with `will be written` / `will be traced` (`...is traced ...` becomes `...will be traced ...`; the future form says `Nothing here will be financial advice.`).
- `deskIntro`: `is a robotics news site` becomes `is a publication about AI agents in crypto`; `a passage quoted from a primary source` becomes `a passage quoted from a source that the piece links`.
- The sentence `const tiers = ...` (line 146) becomes `"A tier 1 source is a primary one: a project's, a company's or a researcher's own post, announcement or documentation, a paper, a regulatory filing, a standard or a proposal."`

`site/src/lib/method.ts`: the example sentence `'The plant shipped one robot.'` and its rule text `"one robot"` become `'The wallet signed one transaction.'` and `"one transaction"` (lines 128-129); the G2 note that lists `datasheet, press release, briefing or demo` becomes `documentation, an announcement, a briefing or a demo` (and `site/test/method.test.ts` quotes the same words: change them).

`README.md`: the first paragraph and the section "What it is" say what the publication is: replace "robotics" by "AI agents in crypto" and the list of beats by the seven of Task 6 (`grep -n -i "robot\|humanoid\|datasheet\|press release" README.md docs/runbook.md` lists the lines; change those that describe the publication, leave the lines that are about `robots.txt`).

- [ ] **Step 4: Apply Rule R7 to the tests**

**Rule R7:** a test that quotes a sentence of the prompts, the site copy or `STATUS_NOTES` quotes the new sentence; a test that asserts the footer asserts the new one. `grep -rn "robotics news site\|robotics\b" desk/test site/test gate/test | grep -v content-fixtures | grep -v "robots.txt"` finds them. The tests of the made-up world (fixture pages about a robot arm) are not changed: they test the pipeline on made-up text.

- [ ] **Step 5: Pin how the forms of crypto read, with a test and no change of code**

The gate was written for kilograms and metres. A read-only run of its readers on the forms that crypto pages use (2026-10-20) shows that they already do what is wanted, and a later change to the units or to the rule for figures could break that unseen. This test pins it. Amounts of a token ("0.5 ETH", "25 USDC", "12 gwei", "25 bps", "2,000 TPS") read as a number without a unit (a sentence that gives no unit meets any claim value of the same number) and the token as a name, which is a note when no claim lists it; a word that mixes letters and digits ("x402", "ERC-8004", "0x1234abcd5678ef90", "10x", "FY2027") is a figure and blocks (`G4_FIGURE_UNSUPPORTED`) unless a claim that the sentence cites has the word in its quoted passage; a dollar amount keeps its unit.

`gate/test/crypto-forms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkG4 } from '../src/checks/g4-values';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Claim } from '../src/schemas';
import { extractTokens } from '../src/tokens';

/** The codes G4 reports for the first sentence of the opening, when it says `text` and cites c-1, whose passage is `quote` and whose values are `values`. */
const g4 = (text: string, quote: string, values: Claim['values'] = []): string[] => {
  const input = cloneGolden();
  const claim = input.claims.find((item) => item.id === 'c-1')!;
  claim.span = { start: 0, end: quote.length, quote };
  claim.values = values;
  input.draft.opening[0] = { kind: 'fact', text, claimIds: ['c-1'] };
  return checkG4(input, defaultContext()).failures.filter((failure) => failure.where === 'opening, sentence 1').map((failure) => failure.code);
};

describe('how the forms of crypto read', () => {
  it('reads an amount of a token as a number with no unit, and the token as a name', () => {
    expect(extractTokens('The agent paid 0.5 ETH and 25 USDC in fees.')).toMatchObject({ numbers: [{ raw: '0.5', value: '0.5' }, { raw: '25', value: '25' }], names: ['eth', 'usdc'] });
    expect(extractTokens('Gas cost fell to 12 gwei, a 3.5% drop, with 2,000 TPS at peak.')).toMatchObject({
      numbers: [{ raw: '12', value: '12' }, { raw: '3.5%', value: '3.5', unit: '%' }, { raw: '2,000', value: '2000' }],
      names: ['tps'],
    });
    expect(extractTokens('Fees are 25 bps.').numbers).toEqual([{ raw: '25', value: '25' }]);
  });

  it('keeps the unit of a dollar amount, and reads a magnitude', () => {
    expect(extractTokens('It settles for $0.001 per call.').numbers).toEqual([{ raw: '$0.001', value: '0.001', unit: 'USD' }]);
    expect(extractTokens('The foundation raised $12.5 million.').numbers).toEqual([{ raw: '$12.5 million', value: '12500000', unit: 'USD' }]);
  });

  it('reads a word that mixes letters and digits as a name, whatever it is', () => {
    expect(extractTokens('The x402 protocol and ERC-8004 and 10x.').names).toEqual(expect.arrayContaining(['x402', '10x']));
    expect(extractTokens('The agent holds 0x1234abcd5678ef90.').names).toContain('0x1234abcd5678ef90');
  });
});

describe('G4 on the forms of crypto', () => {
  it.each([
    ['x402', 'The x402 protocol settles payments.'],
    ['ERC-8004', 'ERC-8004 registers an agent.'],
    ['a hex address', 'The agent holds 0x1234abcd5678ef90 on mainnet.'],
    ['10x', 'Fees are 10x lower than before.'],
  ])('blocks %s when no claim that the sentence cites has it', (_name, text) => {
    expect(g4(text, 'A passage that has none of those words.')).toContain('G4_FIGURE_UNSUPPORTED');
  });

  it.each([
    ['x402', 'The x402 protocol settles payments.', 'The x402 protocol settles payments in stablecoins.'],
    ['ERC-8004', 'ERC-8004 registers an agent.', 'ERC-8004 registers an agent on chain.'],
    ['a hex address', 'The agent holds 0x1234abcd5678ef90.', 'The agent holds 0x1234abcd5678ef90 on mainnet.'],
  ])('passes %s when the passage of a claim that the sentence cites has it', (_name, text, quote) => {
    expect(g4(text, quote)).toEqual([]);
  });

  it('passes an amount of a token when a claim lists the number, and blocks one that no claim lists', () => {
    const values: Claim['values'] = [
      { kind: 'number', raw: '0.5 ETH', normalised: '0.5', unit: 'ETH' },
      { kind: 'name', raw: 'ETH', normalised: 'eth' },
    ];
    expect(g4('The wallet paid 0.5 ETH in fees.', 'The wallet paid 0.5 ETH in fees.', values)).toEqual([]);
    expect(g4('The wallet paid 0.7 ETH in fees.', 'The wallet paid 0.5 ETH in fees.', values)).toContain('G4_NUMBER_UNSUPPORTED');
  });
});
```

Run it: `npm test --workspace @robywire/gate -- test/crypto-forms.test.ts`. Expected: PASS at once (it pins behaviour that exists). If a line fails, the reader changed since 2026-10-20: stop and say which; do not change the reader to make the test pass.

- [ ] **Step 6: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "feat: the prompts, the site copy, the footer and the filler list speak about AI agents in crypto, and say that nothing here is financial advice" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green. If `fixtures:check` fails, `npm run fixtures:generate --workspace @robywire/site` and commit the result in the same commit.

---

### Task 8: Price predictions, advice and cashtags are blockers

The publication says nothing about where a price will go, never tells a reader to buy, sell or hold, and does not write a ticker with a dollar sign. This is a rule about the Desk's voice, so it is a blocker and not a note, and it is checked by words, not by substrings: "price target" is refused and "prices targeted by the attack" is not.

**Files:**
- Modify: `gate/src/config.ts`, `gate/src/checks/g9-hygiene.ts`, `gate/src/text.ts` (one helper), `site/src/lib/reasons.ts`, `site/src/lib/method.ts`, `evals/src/cases/limitations-hygiene.ts`
- Modify (tests): `gate/test/g9-hygiene.test.ts`, `gate/test/failure-codes.test.ts`, `gate/test/config.test.ts`, `evals/test/seeded.test.ts`, `evals/test/notes.test.ts`, `site/test/method.test.ts`
- Create: `gate/test/g9-policy.test.ts`
- Regenerate: `evals/scoreboard/seeded.json`

What is refused (all compared in lowercase with plain quotes, by whole words):

```
price target(s), price prediction(s), price forecast(s), will skyrocket, will moon, to the moon, buy the dip,
guaranteed returns, guaranteed profit, risk-free returns, you should buy, you should sell,
we recommend buying, we recommend selling, is a strong buy, is a strong sell, load up on, not financial advice
```

and a cashtag: a dollar sign directly followed by two to ten letters (`$ETH`, `$TAO`), not preceded by a letter, a digit or another dollar sign. `$38,000` and `US$5` are not cashtags. "Not financial advice" is on the list because a piece that has to say it is giving something that needs saying; the footer says it once for the whole site.

- [ ] **Step 1: Write the failing tests**

`gate/test/g9-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkG9 } from '../src/checks/g9-hygiene';
import { DEFAULT_POLICY_PHRASES, defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { allSentences } from '../src/sentences';
import { mutate } from './helpers';

const run = (change: (copy: GateInput) => void) => checkG9(mutate(cloneGolden(), change), defaultContext());
const policy = (output: ReturnType<typeof run>) => output.failures.filter((failure) => failure.code === 'G9_POLICY_PHRASE');

/** Change the text of the first sentence of the opening. */
const say = (text: string) => (g: GateInput) => {
  g.draft.opening[0] = { kind: 'fact', text, claimIds: ['c-1'] };
};

describe('G9_POLICY_PHRASE', () => {
  it('passes the golden piece', () => {
    expect(policy(run(() => undefined))).toEqual([]);
  });

  it('has the phrases listed above, in lowercase with plain apostrophes', () => {
    expect(DEFAULT_POLICY_PHRASES).toContain('price target');
    expect(DEFAULT_POLICY_PHRASES).toContain('you should buy');
    for (const phrase of DEFAULT_POLICY_PHRASES) expect(phrase).toBe(phrase.toLowerCase());
  });

  it.each(['The analysts set a price target for the token.', 'You should buy before the launch.', 'The token will moon after the launch.', 'This is not financial advice.'])(
    'refuses %s in a sentence, where the sentence is',
    (text) => {
      const failures = policy(run(say(text)));
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ check: 'G9', code: 'G9_POLICY_PHRASE', where: 'opening, sentence 1' });
      expect(failures[0]?.message).toContain('the phrase');
    },
  );

  it('matches whole words, so a longer word is not caught', () => {
    expect(policy(run(say('Prices targeted by the attack fell and a pricetarget file was left.')))).toEqual([]);
  });

  it('ignores case, the shape of quotation marks and the spacing', () => {
    expect(policy(run(say('The note said:  PRICE   TARGET  was raised.')))).toHaveLength(1);
  });

  it('refuses a phrase in the title, in analysis and in a heading, and in a quotation', () => {
    const title = policy(run((g) => (g.draft.title = { kind: 'fact', text: 'A price target for agents', claimIds: ['c-1'] })));
    expect(title).toHaveLength(1);
    expect(title[0]?.where).toBe('title');
    const analysis = policy(run((g) => (g.draft.opening[1] = { kind: 'analysis', text: 'This is a strong buy for the long run.', claimIds: [] })));
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.where).toBe('opening, sentence 2');
    const heading = policy(run((g) => (g.draft.sections[0]!.heading = 'You should buy now')));
    expect(heading).toHaveLength(1);
    expect(heading[0]?.where).toBe('section "You should buy now"');
    expect(policy(run(say('The post said "price target" in capitals.')))).toHaveLength(1);
  });

  it('refuses the plural, which a longer word would otherwise let through', () => {
    expect(policy(run(say('Analysts raised their price targets again.')))).toHaveLength(1);
  });

  it('does not read the limitation sentences, which code writes', () => {
    const output = run((g) => {
      g.draft.limitations[0]!.text = 'You should buy this; it is not financial advice.';
    });
    expect(policy(output)).toEqual([]);
  });

  it('refuses a cashtag, and not a dollar amount or a letter before the dollar sign', () => {
    expect(policy(run(say('The $ETH token moved.')))).toHaveLength(1);
    expect(policy(run(say('The fee is $38,000 and US$5 and A$B are fine.')))).toEqual([]);
    expect(policy(run(say('Holders of $TAO and $BTC.')))).toHaveLength(1);
    expect(policy(run(say('The sum of $$ETH is odd.')))).toEqual([]);
  });

  it('says the cashtag in the message', () => {
    expect(policy(run(say('The $ETH token moved.')))[0]?.message).toContain('$ETH');
  });

  it('reports a sentence once for each phrase it has, and a phrase once for each place', () => {
    const failures = policy(run(say('A price target, and a price target again, and you should buy.')));
    expect(failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['price target', 'you should buy']);
  });

  it('is a blocker: it is not on the list of notes', async () => {
    const { NOTE_CODES } = await import('../src/severity');
    expect(NOTE_CODES).not.toContain('G9_POLICY_PHRASE');
  });

  it('can be sent back: its place is the place of a sentence, which the Desk can point the composer at', () => {
    expect(policy(run(say('You should buy now.')))[0]?.where).toBe('opening, sentence 1');
    expect(policy(run((g) => (g.draft.sections[0]!.heading = 'You should buy now')))[0]?.where).toMatch(/^section "/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace @robywire/gate -- test/g9-policy.test.ts`
Expected: FAIL (`DEFAULT_POLICY_PHRASES` is not exported).

- [ ] **Step 3: Implement**

`gate/src/config.ts`: add to `GateConfig` after `bannedPhrases`

```ts
  /**
   * G9: phrases of the Desk's own voice that are never allowed: a price prediction, a market call, advice to buy, sell or hold. Lowercase, plain apostrophes.
   * Unlike the banned phrases they are matched by whole words and they block.
   */
  policyPhrases: readonly string[];
```

and, after `DEFAULT_BANNED_PHRASES`:

```ts
/** What the publication never says in its own voice. Compared in lowercase, by whole words (see `G9_POLICY_PHRASE`). */
export const DEFAULT_POLICY_PHRASES: readonly string[] = [
  'price target',
  'price targets',
  'price prediction',
  'price predictions',
  'price forecast',
  'price forecasts',
  'will skyrocket',
  'will moon',
  'to the moon',
  'buy the dip',
  'guaranteed returns',
  'guaranteed profit',
  'risk-free returns',
  'you should buy',
  'you should sell',
  'we recommend buying',
  'we recommend selling',
  'is a strong buy',
  'is a strong sell',
  'load up on',
  'not financial advice',
];
```

and `policyPhrases: [...DEFAULT_POLICY_PHRASES],` in `defaultConfig()` after `bannedPhrases`.

`gate/src/text.ts`: add

```ts
/** `text` and `phrase` already folded (lowercase, plain quotes): does `phrase` occur in `text` as whole words, with no letter or digit next to it on either side? */
export function hasWholePhrase(text: string, phrase: string): boolean {
  if (phrase === '') return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(phrase, from);
    if (at === -1) return false;
    const before = text[at - 1];
    const after = text[at + phrase.length];
    const edge = (char: string | undefined) => char === undefined || !/[\p{L}\p{N}]/u.test(char);
    if (edge(before) && edge(after)) return true;
    from = at + 1;
  }
}
```

and export it from `gate/src/index.ts` only if the file re-exports `./text` already (`grep -n "text" gate/src/index.ts`); the test for the export list (`golden-gate.test.ts`) then needs the name added.

`gate/src/checks/g9-hygiene.ts`: `G9_CODES` gains `'G9_POLICY_PHRASE'`; import `hasWholePhrase`; after the banned phrases loop, before `return`, add

```ts
  // What the Desk never says in its own voice. The title, the description, every fact and analysis sentence and every heading are read; the
  // limitation sentences are written by code from fixed notes and are not. `where` is the place, so that a sentence or a heading that has one can be sent back.
  const CASHTAG = /(?<![\p{L}\p{N}$])\$[A-Za-z]{2,10}(?![A-Za-z0-9])/gu;
  const voice = [
    ...allSentences(draft)
      .filter((item) => item.sentence.kind !== 'limitation')
      .map((item) => ({ where: describeLocation(item), text: item.sentence.text })),
    ...draft.sections.map((section) => ({ where: `section "${section.heading}"`, text: section.heading })),
  ];
  const policy = ctx.config.policyPhrases.map((phrase) => ({ phrase, folded: normaliseQuotes(phrase).toLowerCase().replace(/\s+/g, ' ') })).filter((item) => item.folded !== '');
  for (const place of voice) {
    const text = normaliseQuotes(place.text).toLowerCase().replace(/\s+/g, ' ');
    for (const { phrase, folded } of policy) {
      if (hasWholePhrase(text, folded)) {
        failures.push({ check: 'G9', code: 'G9_POLICY_PHRASE', message: `the phrase "${phrase}" appears at ${place.where}: the Desk makes no price prediction, no market call and gives no advice to buy, sell or hold`, where: place.where });
      }
    }
    for (const tag of new Set(place.text.match(CASHTAG) ?? [])) {
      failures.push({ check: 'G9', code: 'G9_POLICY_PHRASE', message: `the cashtag "${tag}" appears at ${place.where}: write the name of the token, not a ticker with a dollar sign`, where: place.where });
    }
  }
```

and extend the doc comment of `checkG9` with a bullet for it. The doc of the other bullet that says `where is the phrase` stays.

- [ ] **Step 4: Run the new test, then fix the places that list codes**

Run: `npm test --workspace @robywire/gate -- test/g9-policy.test.ts` → PASS.

Then `npm run typecheck && npm test`. The tests that list every code fail until each is updated: `gate/test/failure-codes.test.ts` (add `'G9_POLICY_PHRASE'` to the G9 list and to the list of blockers), `site/src/lib/reasons.ts` (add `G9_POLICY_PHRASE: 'The piece made a price prediction, gave advice to buy or sell, or wrote a ticker with a dollar sign',` after `G9_BANNED_PHRASE`; the test that every code has a label then passes), `gate/test/config.test.ts` (the defaults), `evals/test/notes.test.ts` (the list of blockers: add the code). `site/src/lib/method.ts`: add to the rule G9 (find it with `grep -n "'G9'" site/src/lib/method.ts`) the sentence `The piece makes no price prediction, no market call and no advice to buy, sell or hold, and writes no ticker with a dollar sign; the gate refuses a fixed list of phrases (matched by whole words) and any word of two to ten letters after a dollar sign, in the title, the description, every sentence and every heading.` and change the assertions of `site/test/method.test.ts` that quote the G9 text.

- [ ] **Step 5: Add the seeded defects**

In `evals/src/cases/limitations-hygiene.ts` add three cases to the array, after the case that seeds `G9_BANNED_PHRASE` (look at it for the shape; `base` is the golden piece):

```ts
  {
    id: 'policy-price-target',
    check: 'G9',
    code: 'G9_POLICY_PHRASE',
    description: 'A fact sentence says the analysts set a price target.',
    apply: (base) => {
      base.draft.opening[0] = { kind: 'fact', text: 'The analysts set a price target for the token.', claimIds: ['c-1'] };
      return base;
    },
  },
  {
    id: 'policy-buy-advice',
    check: 'G9',
    code: 'G9_POLICY_PHRASE',
    description: 'A section heading tells the reader what to buy.',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'You should buy now';
      return base;
    },
  },
  {
    id: 'policy-cashtag',
    check: 'G9',
    code: 'G9_POLICY_PHRASE',
    description: 'A fact sentence writes a ticker with a dollar sign.',
    apply: (base) => {
      base.draft.opening[0] = { kind: 'fact', text: 'Holders of $ETH saw the change.', claimIds: ['c-1'] };
      return base;
    },
  },
```

and in `evals/test/seeded.test.ts` add `['policy-price-target', 'G9_POLICY_PHRASE'], ['policy-buy-advice', 'G9_POLICY_PHRASE'], ['policy-cashtag', 'G9_POLICY_PHRASE']` to the table that pairs a case with its code.

- [ ] **Step 6: Say it to the composer, regenerate, run everything**

The compose rule of Task 7 already tells the writer; add to `desk/test/prompts/compose.test.ts` the assertion that the sentence is a rule that blocks (it starts with `(blocks)`).

```bash
npm run evals:seeded
npm run fixtures:generate --workspace @robywire/site
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
```

Expected: green; `evals/scoreboard/seeded.json` has three cases more (62 of 62 if Part 01 left 59 of 59).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(gate): a price prediction, advice to buy or sell, and a cashtag block a piece (G9_POLICY_PHRASE, matched by whole words)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
