import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LedgerEntry, defaultContext, runGate } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import { defaultConfig } from '../../src/config';
import { HeldArtifact } from '../../src/run/artifacts';
import { heldPieceFiles, holdPrBody, holdPrTitle, renderHeldPiece } from '../../src/stages/hold-pr';
import { useScratch } from '../support/context';
import { heldOf, verdicts } from '../support/held';
import { outsideFences } from '../support/markdown';
import { placePiece, readPieces, splitPiece } from '../support/pieces';
import { makeSite } from '../support/site';

// What a held piece becomes for the owner. Two things must hold. The piece that goes on the branch must be one that the site accepts, so that merging the pull
// request is all it takes: its two files must pass the rules by which the site refuses a piece and a ledger that do not belong together. And the text of the
// pull request is written from what a model wrote, so none of it may become a link, a mention or a heading: it must all be in fenced blocks that it cannot close.

const scratch = useScratch();
const made = verdicts(scratch);

/**
 * The three ways that a piece is held, each as the Hold stage keeps it. A piece that cites another outlet is held by the model check, which does not clear
 * the sentence that attributes the claim: the gate clears it, because another outlet no longer forces a hold.
 */
const KINDS = {
  'cites another outlet': () => made.tier2(),
  'fails a check of the gate': () => made.gateFailure(),
  'fails the model check, which the gate cleared': () => made.modelCheck(),
} as const;
const heldBy = async (kind: keyof typeof KINDS): Promise<HeldArtifact> => heldOf(scratch, await KINDS[kind]());

/** The ledger of the fifth fixture piece of the site: the piece that the owner released after a hold. The fixture generator writes it, and no stage of the Desk is run for it. */
const FIXTURE_5_LEDGER = fileURLToPath(new URL('../../../site/src/content-fixtures/ledger/fixture-robotics-ships-fx-5-to-second-plant.json', import.meta.url));

/** The held artifact of a released hold as the hold flow keeps it: the piece of the fifth fixture of the site (the tier-2 variant of the golden piece), held by the model check. */
function releasedHold(): HeldArtifact {
  const variant = makeTier2Variant(cloneGolden());
  const gate = runGate(variant, defaultContext());
  const verifier = { model: 'model-a', passed: false, notes: ['The model check could not tell if a sentence was supported.'] };
  return HeldArtifact.parse({
    date: '2026-10-05',
    slug: variant.draft.slug,
    runId: 'fixture-run-5',
    reasons: ['G10_AMBIGUOUS'],
    draft: variant.draft,
    claims: variant.claims,
    rounds: 0,
    gate,
    verifier,
    history: [{ round: 0, gate, verifier, verifierFailures: [{ id: 's1', kind: 'sentence', code: 'ambiguous', reason: 'The passages do not say it.' }], sent: [] }],
  });
}

/** `releasedHold()` with fields of its gate overridden. */
const heldWith = (gate: Partial<HeldArtifact['gate']>): HeldArtifact => {
  const held = releasedHold();
  return { ...held, gate: { ...held.gate, ...gate } };
};

describe('outsideFences (the check that the tests below rely on)', () => {
  it('leaves out what is in a fenced block, and a block is closed only by a fence that is as long as the one that opened it', () => {
    const text = ['before', '```text', 'in', '```` not a closing fence: it has words', '````', 'after', '````text', 'in again', '```', 'still in', '````', 'end'].join('\n');
    expect(outsideFences(text)).toEqual({ outside: ['before', 'after', 'end'], blocks: 2, closed: true });
  });

  it('says when a block is never closed', () => {
    expect(outsideFences('a\n```text\nb')).toEqual({ outside: ['a'], blocks: 1, closed: false });
  });
});

describe('renderHeldPiece', () => {
  it.each(Object.keys(KINDS) as (keyof typeof KINDS)[])('writes a piece that the owner releases, whatever the way it was held: it %s', async (kind) => {
    const held = await heldBy(kind);
    const { mdx, ledger } = renderHeldPiece(held);
    expect(LedgerEntry.safeParse(ledger).success).toBe(true);
    // The owner released it, so the gate did not: the route is hold even when the gate cleared the draft and the model check did not.
    expect(ledger.release).toBe('owner');
    expect(ledger.gate.route).toBe('hold');
    expect(ledger.gate.holdReasons).toEqual(held.reasons);
    expect(ledger.gate.checks).toEqual(held.gate.checks);
    expect(ledger.verifier).toEqual(held.verifier);
    expect(ledger.runId).toBe(held.runId);
    expect(ledger.slug).toBe(held.draft.slug);
    // The piece has never been corrected, so it has no updatedAt.
    expect(splitPiece(mdx).data.updatedAt).toBeUndefined();
  });

  it.each(Object.keys(KINDS) as (keyof typeof KINDS)[])('writes the two files of a piece that the site accepts, with the rules by which it refuses a piece and a ledger that do not belong together: it %s', async (kind) => {
    const held = await heldBy(kind);
    const repoDir = makeSite(scratch());
    placePiece(repoDir, heldPieceFiles(held));
    const { news, ledgers } = readPieces(repoDir);
    const matched = matchPieces(news, ledgers, []);
    expect(matched.map((piece) => piece.slug)).toEqual([held.draft.slug]);
  });

  it('is the same piece every time', async () => {
    const held = await heldBy('cites another outlet');
    expect(renderHeldPiece(held)).toEqual(renderHeldPiece(held));
    expect(heldPieceFiles(held)).toEqual(heldPieceFiles(held));
  });

  it('gives the ledger as the file the Desk writes: two-space JSON with a final newline', async () => {
    const held = await heldBy('cites another outlet');
    const files = heldPieceFiles(held);
    expect(files.slug).toBe(held.draft.slug);
    expect(files.ledger).toBe(`${JSON.stringify(renderHeldPiece(held).ledger, null, 2)}\n`);
    expect(files.mdx).toBe(renderHeldPiece(held).mdx);
  });

  it('refuses a draft that cannot be written as a piece, as the renderer does, and says why', async () => {
    const held = await heldBy('cites another outlet');
    const broken = structuredClone(held);
    broken.draft.title = { ...broken.draft.title, claimIds: ['c-99'] } as HeldArtifact['draft']['title'];
    expect(() => renderHeldPiece(broken)).toThrow('a sentence cites c-99, but no claim has that id');
    expect(() => heldPieceFiles(broken)).toThrow('c-99');
  });

  it('refuses a slug that is not a plain slug, because the slug is a file name', async () => {
    const held = await heldBy('cites another outlet');
    const odd = structuredClone(held);
    odd.draft.slug = '../outside';
    expect(() => heldPieceFiles(odd)).toThrow('"../outside" is not a plain slug');
  });

  it('carries the notes of the gate into the ledger of a released hold, by code and place only, and has none when the held record is older than notes', () => {
    // A held artifact whose gate has one note with a message: the ledger keeps the code and the place, not the message.
    const withNote = heldWith({ warnings: [{ check: 'G2', code: 'G2_BODY_LENGTH', message: 'a message that must not be stored', where: 'body' }] });
    const { ledger } = renderHeldPiece(withNote);
    expect(ledger.gate.warnings).toStrictEqual([{ code: 'G2_BODY_LENGTH', where: 'body' }]);
    expect(JSON.stringify(ledger)).not.toContain('must not be stored');
    // A held record written before notes existed has no `warnings` at all.
    const older = heldWith({});
    delete (older.gate as { warnings?: unknown }).warnings;
    expect(renderHeldPiece(older).ledger.gate.warnings).toEqual([]);
  });
});

describe('renderHeldPiece and the fixture of the site that stands for a released hold', () => {
  // The fixture generator (site/scripts/generate-fixtures.ts) cannot call the Desk, so it makes the gate of the fifth fixture by hand: the result of the gate with the
  // route hold and the reasons of the hold, and the release owner. This test makes the same piece the way the hold flow does and compares the two, so that if either
  // side changes the shape of what it writes, one of them fails. Only the gate and the release are compared: the fixture has no model check (`verifier`) and its run
  // and its slug are its own.
  it('writes the gate and the release of a released hold as the fixture generator writes them', () => {
    const held = releasedHold();
    const fixture = LedgerEntry.parse(JSON.parse(readFileSync(FIXTURE_5_LEDGER, 'utf8')));
    const { ledger } = renderHeldPiece(held);
    expect(fixture.release).toBeDefined();
    expect(ledger.release).toEqual(fixture.release);
    // The route, the result of every check, the reasons of the hold and the notes (when the ledger has them).
    expect(ledger.gate).toEqual(fixture.gate);
  });
});

describe('holdPrTitle', () => {
  it('is Held: and the headline', async () => {
    const held = await heldBy('cites another outlet');
    expect(holdPrTitle(held)).toBe(`Held: ${GOLDEN_DRAFT.title.text}`);
  });

  it('is one line, cut at 100 characters of the headline with three dots, and starts with Held: whatever the headline is', async () => {
    const base = await heldBy('cites another outlet');
    const titled = (text: string): HeldArtifact => {
      const held = structuredClone(base);
      held.draft.title.text = text;
      return held;
    };
    expect(holdPrTitle(titled('a\n\nb\t  c'))).toBe('Held: a b c');
    expect(holdPrTitle(titled('-R other/repository --web'))).toBe('Held: -R other/repository --web');
    expect(holdPrTitle(titled('x'.repeat(100)))).toBe(`Held: ${'x'.repeat(100)}`);
    expect(holdPrTitle(titled('x'.repeat(101)))).toBe(`Held: ${'x'.repeat(97)}...`);
    expect(holdPrTitle(titled('   '))).toBe(`Held: ${base.draft.slug}`);
  });
});

describe('holdPrBody', () => {
  it('says what was held, why, what each check said, and how to publish or discard it: a piece that cites another outlet', async () => {
    const held = await heldBy('cites another outlet');
    const slug = held.draft.slug;
    // The one sentence that the model check did not clear is the one that attributes the claim to the other outlet.
    const failed = (held.history.at(-1) as HeldArtifact['history'][number]).verifierFailures;
    expect(failed).toHaveLength(1);
    expect(held.reasons).toEqual(['G10_NOT_ENTAILED']);
    expect(holdPrBody(held)).toBe(
      [
        `# Held by the Desk: \`${slug}\``,
        '',
        'The Desk did not publish this piece by itself, so it is here for you to decide. It is a draft pull request: nothing on the site changes until you merge it.',
        '',
        '## Why it was held',
        '',
        `- \`G10_NOT_ENTAILED\`: ${REASON_LABELS.G10_NOT_ENTAILED}`,
        '',
        '## The piece',
        '',
        '| | |',
        '|---|---|',
        `| Slug | \`${slug}\` |`,
        '| Day | `2026-10-05` |',
        `| Categories | ${held.draft.categories.map((category) => `\`${category}\``).join(', ')} |`,
        '| Run | `2026-10-05-043100` |',
        `| Rounds of revision | ${defaultConfig().maxRevisionRounds} |`,
        `| The article | \`site/src/content/news/${slug}.mdx\` |`,
        `| Its ledger | \`site/src/content/ledger/${slug}.json\` |`,
        '',
        'The headline, as the model wrote it. Everything below in a grey box was written by a model and is shown as it is, as data, and nobody has checked it.',
        '',
        '```text',
        GOLDEN_DRAFT.title.text,
        '```',
        '',
        '## What the gate said',
        '',
        '9 of 9 checks passed. It found no failure in the last draft.',
        '',
        '## What the model check said',
        '',
        'The model check (`claude-sonnet-5-5`) did not pass the last draft.',
        '',
        'Its notes:',
        '',
        '```text',
        ...held.verifier.notes,
        '```',
        '',
        'What it did not clear:',
        '',
        '```text',
        ...failed.map((failure) => `${failure.id} (${failure.kind}, ${failure.code}): ${failure.reason}`),
        '```',
        '',
        '## To publish it',
        '',
        '1. Open **Files changed** and read the article and its ledger.',
        '2. If you agree with every sentence, click **Ready for review** and merge the pull request. The site is built again and shows the piece, and its receipts page says that the owner released it.',
        '',
        '## To discard it',
        '',
        'Close the pull request without merging it. Nothing is published, and the hold stays on record in the desk state.',
        '',
      ].join('\n'),
    );
  });

  it('gives the failures of the gate, with the checks that failed and the words for the reason: a piece that fails a check', async () => {
    const held = await heldBy('fails a check of the gate');
    const body = holdPrBody(held);
    expect(body).toContain(`- \`G4_NUMBER_UNSUPPORTED\`: ${REASON_LABELS.G4_NUMBER_UNSUPPORTED}`);
    expect(body).toContain('8 of 9 checks passed. Failed: `G4`. It found 1 failure in the last draft.');
    expect(body).toContain('G4_NUMBER_UNSUPPORTED: the number "15 kg"');
    expect(body).toContain(`| Rounds of revision | ${defaultConfig().maxRevisionRounds} |`);
    // The model was not asked about a draft that the gate had sent back, and the text says so.
    expect(body).toContain('was not asked about the last draft: the gate had sent it back');
    expect(body).not.toContain('What it did not clear');
  });

  it('gives what the model check did not clear, one line for each: a piece that the gate cleared and the model check did not', async () => {
    const held = await heldBy('fails the model check, which the gate cleared');
    const body = holdPrBody(held);
    for (const code of ['G10_AMBIGUOUS', 'G10_NOT_JUDGED', 'G10_LABEL_UNSUPPORTED'] as const) expect(body).toContain(`- \`${code}\`: ${REASON_LABELS[code]}`);
    expect(body).toContain('9 of 9 checks passed. It found no failure in the last draft.');
    expect(body).toContain('did not pass the last draft.');
    expect(body).toContain('What it did not clear:');
    expect(body).toContain('s3 (sentence, ambiguous): The passages do not say it (s3).');
    expect(body).toContain('c-1 (label, unsupported)');
  });

  it('says in the Desk\'s own words that it has no words for a code that the holds page does not know, and never repeats the code as if it were an explanation', async () => {
    const held = structuredClone(await heldBy('cites another outlet'));
    held.reasons = ['G10_NOT_ENTAILED', 'G99_NOT_A_CODE'];
    expect(holdPrBody(held)).toContain('- `G99_NOT_A_CODE`: no plain words are written for this code');
    held.reasons = ['constructor'];
    expect(holdPrBody(held)).toContain('- `constructor`: no plain words are written for this code');
  });

  it('still gives the words for the retired reason of a hold recorded before the gate stopped holding for another outlet', async () => {
    // Plain data, not the output of a stage: no check asks for TIER2_ATTRIBUTION any more, but an old hold has it, and its pull request is written again from the held draft.
    const held = structuredClone(await heldBy('cites another outlet'));
    held.reasons = ['TIER2_ATTRIBUTION'];
    expect(holdPrBody(held)).toContain(`- \`TIER2_ATTRIBUTION\`: ${REASON_LABELS.TIER2_ATTRIBUTION}`);
  });

  it('is the same text every time', async () => {
    const held = await heldBy('fails a check of the gate');
    expect(holdPrBody(held)).toBe(holdPrBody(held));
  });
});

/** Texts that a model could write that GitHub would turn into a notification, a link, an image, a heading, a table, a list or html, or that would close a fence. */
const HOSTILE = [
  '@everyone please review #123 and https://evil.example/phish',
  '[click here](https://evil.example/login) or ![pixel](https://evil.example/pixel.png)',
  '```\nclosing the fence early\n````\n# A heading\n- a list item',
  '~~~\n| a | table |\n|---|---|\n~~~',
  '<img src=x onerror=alert(1)> <script>alert(1)</script> <!-- a comment -->',
  `${'`'.repeat(7)} seven backticks ${'`'.repeat(3)} and one \` more`,
  'line one\r\nline two\rline three\n\n\n',
  '$(touch /tmp/pwned) ${HOME} \\ %s',
];

/** What the harmless text of the pull request never has in it, and what the hostile texts above all have. */
const MARKERS = ['@everyone', '#123', 'evil.example', '<img', '<script', 'onerror', 'closing the fence early', 'A heading', 'a list item', 'a table', 'seven backticks', 'pwned', 'line two'];

/** `base` with `text` in every place where the text of a pull request has what a model wrote. */
function hostileHeld(base: HeldArtifact, text: string): HeldArtifact {
  const held = structuredClone(base);
  held.draft.title.text = text;
  held.verifier.notes = [text, text];
  held.gate.failures = [
    { check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', message: text, where: text },
    { check: 'G2', code: 'G2_BODY_LENGTH', message: text },
  ];
  const last = held.history.at(-1) as HeldArtifact['history'][number];
  last.verifierFailures = [{ id: 's1', kind: 'sentence', code: 'not_entailed', reason: text }];
  return held;
}

describe('holdPrBody, with text that a model wrote to do harm', () => {
  it.each(HOSTILE)('puts what a model wrote in fenced blocks that it cannot close, and nothing of it outside: %j', async (text) => {
    const body = holdPrBody(hostileHeld(await heldBy('fails a check of the gate'), text));
    const { outside, blocks, closed } = outsideFences(body);
    // The headline, the failures of the gate, the notes and what the model check did not clear: four blocks, all closed, and no text of the model between them.
    expect(blocks).toBe(4);
    expect(closed).toBe(true);
    const visible = outside.join('\n');
    for (const marker of MARKERS) expect(visible).not.toContain(marker);
    // Nothing outside the blocks is anything but the Desk's own: the same lines as for harmless text, except the counts that depend on the failures.
    const harmless = outsideFences(holdPrBody(hostileHeld(await heldBy('fails a check of the gate'), 'harmless text'))).outside;
    expect(outside).toEqual(harmless);
  });

  it('keeps the text, whole, inside its block', async () => {
    const text = '```\nclosing the fence early\n````\n# A heading';
    const body = holdPrBody(hostileHeld(await heldBy('fails a check of the gate'), text));
    // The fence is longer than the longest run of backticks in the text (four), so five, and no longer.
    expect(body).toContain(`\`\`\`\`\`text\n${text}\n\`\`\`\`\``);
    expect(body.split('\n')).toContain('`````text');
    expect(body).not.toContain('``````');
  });

  it('writes a code span that the text cannot close, for a slug, a code or an id with backticks in it, and one that starts or ends with a backtick has a space inside', async () => {
    const held = structuredClone(await heldBy('cites another outlet'));
    held.reasons = ['A`B', '`C`', '`start', 'end`', '  spaced \n  code  '];
    held.runId = 'run``id';
    const body = holdPrBody(held);
    expect(body).toContain('- ``A`B``: no plain words are written for this code');
    expect(body).toContain('- `` `C` ``: no plain words are written for this code');
    expect(body).toContain('- `` `start ``: no plain words are written for this code');
    expect(body).toContain('- `` end` ``: no plain words are written for this code');
    expect(body).toContain('- `spaced code`: no plain words are written for this code');
    expect(body).toContain('| Run | ```run``id``` |');
  });

  it('gives each failure of the gate on a line of its own, with the place when the gate said one and without it when it did not', async () => {
    const held = structuredClone(await heldBy('fails a check of the gate'));
    held.gate.failures = [
      { check: 'G4', code: 'G4_NUMBER_UNSUPPORTED', message: 'the number is not in a claim', where: 'takeaways, sentence 2' },
      { check: 'G2', code: 'G2_BODY_LENGTH', message: 'the piece is too short' },
    ];
    const lines = holdPrBody(held).split('\n');
    expect(lines).toContain('G4_NUMBER_UNSUPPORTED: the number is not in a claim (takeaways, sentence 2)');
    expect(lines).toContain('G2_BODY_LENGTH: the piece is too short');
  });

  it('says none for the categories of a piece that has none, and names one that has one', async () => {
    const held = structuredClone(await heldBy('cites another outlet'));
    held.draft.categories = [];
    expect(holdPrBody(held)).toContain('| Categories | (none) |');
    held.draft.categories = ['humanoids'];
    expect(holdPrBody(held)).toContain('| Categories | `humanoids` |');
  });

  it('cuts a block at 4000 characters and not before, says how many were left out, and does not cut a pair of characters in two', async () => {
    const base = await heldBy('fails a check of the gate');
    const pair = String.fromCharCode(0xd83d, 0xde00);
    // The text is the one note of the model check, so the block that has it has nothing else.
    const noted = (text: string): string => {
      const held = structuredClone(base);
      held.verifier.notes = [text];
      return holdPrBody(held);
    };
    const exact = noted('x'.repeat(4000));
    expect(exact).toContain(`\n${'x'.repeat(4000)}\n`);
    expect(exact).not.toContain('[cut:');
    const over = noted('x'.repeat(4001));
    expect(over).toContain(`\n${'x'.repeat(4000)}\n[cut: 1 more characters]\n`);
    const split = noted(`${'x'.repeat(3999)}${pair}`);
    expect(split).toContain(`\n${'x'.repeat(3999)}\n[cut: 2 more characters]\n`);
    expect(split).not.toContain(String.fromCharCode(0xd83d));
  });

  it('cuts a block that is too long, and says how much was left out, so that the text never goes over what GitHub takes', async () => {
    const held = hostileHeld(await heldBy('fails a check of the gate'), 'x'.repeat(200_000));
    const body = holdPrBody(held);
    expect(body.length).toBeLessThan(40_000);
    expect(body).toContain('[cut: 196000 more characters]');
    expect(outsideFences(body).blocks).toBe(4);
  });
});
