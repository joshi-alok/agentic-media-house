import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ClaimValue } from '@robywire/gate';
import { GOLDEN_CLAIMS } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { DEMO_CLAIMS } from '../../src/demo/story';
import { ModelError } from '../../src/model/types';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { buildExtractUser, extractSystem } from '../../src/prompts/extract';
import { ExtractArtifact, readArtifact } from '../../src/run/artifacts';
import { CLAIM_PROBLEM_CODES, normalisedMismatch } from '../../src/stages/claim-grounding';
import { EXTRACT_MAX_OUTPUT_TOKENS, extractReplySchema, kindOfSnapshot, runExtract } from '../../src/stages/extract';
import type { Snapshot } from '../../src/stages/fetch';
import { FETCHED_AT, URLS, stageContext, useScratch } from '../support/context';
import { blocksOf, outsideBlocks } from '../support/prompts';
import { smallRegistry } from '../support/registry';
import { ARTICLE, selectedStory, storySnapshots } from '../support/story';

// Extract turns the pages that Fetch stored into claims. The model proposes, code decides: these tests give the stage a fake model
// that answers from a script, and the script is sometimes honest and sometimes not. The honest script is the first seven claims of
// the golden piece of the gate, which were written from the release page of Fixture Robotics.

const scratch = useScratch();
const SNAPSHOTS = await storySnapshots(scratch);
const RELEASE = SNAPSHOTS[0] as Snapshot;
const REPORT = SNAPSHOTS[1] as Snapshot;

/** What the model says for a golden claim, from the page `source` (1 is the release, 2 is the report). */
function proposed(id: string, overrides: Record<string, unknown> = {}) {
  const claim = GOLDEN_CLAIMS.find((item) => item.id === id);
  if (claim === undefined) throw new Error(`no golden claim ${id}`);
  return { text: claim.text, label: claim.label, type: claim.type, quote: claim.span.quote, values: structuredClone(claim.values), basis: claim.basis, status: claim.status, source: 1, ...overrides };
}

const CLEAN = ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7'].map((id) => proposed(id));

/** A claim from the report of the outlet, which only reports. */
const REPORTED = {
  text: 'The arm is priced from $38,000.',
  label: 'priced from $38,000',
  type: 'number',
  quote: 'The arm is priced from $38,000, the outlet reported.',
  values: [{ kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' }],
  basis: 'reported',
  status: 'unspecified',
  source: 2,
};

/** A stage, with a model that will say `claims` for the extract role. */
function setup(claims: unknown[], overrides: Parameters<typeof stageContext>[1] = {}) {
  const made = stageContext(scratch, overrides);
  made.fake.script('extract', { claims });
  return made;
}

describe('runExtract: a clean script', () => {
  it('keeps every claim, as the golden claims of the gate say it, with a source and a span that code gives', async () => {
    const { ctx } = setup(CLEAN);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.ok).toBe(true);
    const strip = <T extends { source: unknown; span: unknown }>({ source: _source, span: _span, ...rest }: T) => rest;
    expect(result.artifact.claims.map(strip)).toEqual(GOLDEN_CLAIMS.slice(0, 7).map(strip));
    expect(result.artifact.dropped).toEqual([]);
  });

  it('numbers the claims c-1, c-2 and so on, in the order of the reply', async () => {
    const { ctx } = setup(CLEAN);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.claims.map((claim) => claim.id)).toEqual(['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7']);
  });

  it('takes the source of a claim from the page, with no outlet for a primary source', async () => {
    const { ctx } = setup(CLEAN);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    for (const claim of result.artifact.claims) {
      expect(claim.source).toEqual({ url: URLS.release, tier: 1, snapshotHash: RELEASE.hash, retrievedAt: FETCHED_AT.toISOString() });
    }
  });

  it('takes the span from the page as the page has it: the offsets are found by code and the quote is the page\'s own text', async () => {
    const { ctx } = setup(CLEAN);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    for (const claim of result.artifact.claims) {
      expect(RELEASE.text.slice(claim.span.start, claim.span.end)).toBe(claim.span.quote);
    }
    expect(result.artifact.claims[1]?.span.start).toBe(RELEASE.text.indexOf('Tarnmoor, 1 October 2026'));
  });

  it('writes 04-extract.json, which reads back as the artifact, and holds no text of a page but the quoted spans', async () => {
    const { ctx } = setup(CLEAN);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual(result.artifact);
    const raw = readFileSync(path.join(ctx.runDir, '04-extract.json'), 'utf8');
    expect(raw).toContain('Fixture Robotics has begun shipping FX-1 warehouse arms');
    expect(raw).not.toContain('Specifications are in');
  });

  it('asks one model, once, in the role extract, with the model of the configuration, the pages of the story and nothing else', async () => {
    const { ctx, fake } = setup(CLEAN);
    await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(Object.keys(call ?? {}).sort()).toEqual(['maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    expect(call?.role).toBe('extract');
    expect(call?.model).toBe(ctx.config.models.extract);
    expect(call?.maxOutputTokens).toBe(EXTRACT_MAX_OUTPUT_TOKENS);
    expect(call?.system).toBe(extractSystem());
    expect(call?.system.startsWith(UNTRUSTED_PREAMBLE)).toBe(true);
    expect(call?.user).toBe(
      buildExtractUser([
        { tier: 1, kind: 'company-newsroom', text: RELEASE.text },
        { tier: 2, kind: 'tier2', outlet: 'Mercer Wire', text: REPORT.text },
      ]),
    );
  });

  it('shows the model the text of a page only inside a block', async () => {
    const { ctx, fake } = setup(CLEAN);
    await runExtract(ctx, SNAPSHOTS, selectedStory());
    const user = fake.calls[0]?.user ?? '';
    expect(blocksOf(user).map((block) => block.text)).toEqual([RELEASE.text, REPORT.text]);
    expect(outsideBlocks(user)).not.toContain('Fixture Robotics has begun shipping');
    expect(outsideBlocks(user)).not.toContain('the outlet reported');
  });

  it('logs how many claims were proposed, kept and dropped', async () => {
    const { ctx, logs } = setup(CLEAN);
    await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(logs).toEqual(['extract: 7 claims proposed, 7 kept, 0 dropped']);
  });
});

describe('runExtract: a claim from the page of the outlet', () => {
  it('is kept with the tier of the page, the outlet that Select recorded and the basis reported', async () => {
    const { ctx } = setup([...CLEAN, REPORTED]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    const claim = result.artifact.claims[7];
    expect(claim?.id).toBe('c-8');
    expect(claim?.source).toEqual({ url: URLS.mercerArticle, tier: 2, snapshotHash: REPORT.hash, retrievedAt: FETCHED_AT.toISOString(), outlet: 'Mercer Wire' });
    expect(claim?.basis).toBe('reported');
    expect(REPORT.text.slice(claim?.span.start, claim?.span.end)).toBe(claim?.span.quote);
  });

  it('is dropped when its basis is not reported, with the rule of the gate', async () => {
    const { ctx } = setup([...CLEAN, { ...REPORTED, basis: 'press-release' }]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped).toEqual([
      { index: 7, text: REPORTED.text, reasons: [{ code: 'tier-basis', message: 'a claim that rests on another outlet has the basis "reported", not "press-release" (check G6)' }] },
    ]);
  });

  it('is dropped when it names the outlet in its text, which the quotation does not', async () => {
    const { ctx } = setup([...CLEAN, { ...REPORTED, text: 'Mercer Wire says the arm is priced from $38,000.' }]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.code))).toEqual([['text-not-in-quote']]);
  });
});

describe('runExtract: a claim that breaks a rule is dropped, and the others are kept', () => {
  it('drops a claim with an invented quotation', async () => {
    const invented = proposed('c-4', { quote: 'Fixture Robotics lists the FX-1 from $28,000 per arm, with delivery within 12 weeks of an order.' });
    const { ctx } = setup([CLEAN[0], invented, CLEAN[1], CLEAN[2], CLEAN[4]]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped).toHaveLength(1);
    expect(result.artifact.dropped[0]).toMatchObject({ index: 1, text: invented.text, reasons: [{ code: 'quote-not-found' }] });
    expect(result.artifact.dropped[0]?.reasons[0]?.message).toContain('the quotation is not on the page: "Fixture Robotics lists the FX-1 from $28,000');
    expect(result.artifact.claims.map((claim) => claim.label)).toEqual(['second plant', 'deliveries started', 'existing conveyor frames', 'arms due at Tarnmoor']);
  });

  it('logs how many claims were proposed, kept and dropped, when some are dropped', async () => {
    const { ctx, logs } = setup([CLEAN[0], proposed('c-4', { quote: 'Not on the page.' }), CLEAN[1], CLEAN[2], CLEAN[4]]);
    await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(logs).toEqual(['extract: 5 claims proposed, 4 kept, 1 dropped']);
  });

  it('numbers the claims that are kept without a gap', async () => {
    const { ctx } = setup([CLEAN[0], proposed('c-4', { quote: 'Not on the page.' }), CLEAN[1], CLEAN[2]]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.claims.map((claim) => claim.id)).toEqual(['c-1', 'c-2', 'c-3']);
    expect(result.artifact.dropped.map((item) => item.index)).toEqual([1]);
  });

  it('drops a claim with an invented name in its label', async () => {
    const { ctx } = setup([...CLEAN, proposed('c-3', { label: 'Harlow existing conveyor frames' })]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.code))).toEqual([['label-not-in-quote']]);
    expect(result.artifact.dropped[0]?.reasons[0]?.message).toBe('the label says what the quotation does not: "Harlow"');
  });

  it('drops a claim with an invented number or name in its text', async () => {
    const { ctx } = setup([...CLEAN, proposed('c-5', { text: 'Tarnmoor is due to receive 600 arms by 30 November 2026.' }), proposed('c-7', { text: 'Harlow Logistics will use the funds to expand FX-1 production.' })]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => [item.index, ...item.reasons.map((reason) => reason.code)])).toEqual([
      [7, 'text-not-in-quote'],
      [8, 'text-not-in-quote'],
    ]);
  });

  it('drops a claim whose label or text has a word that the quotation lacks, and records each reason as a sentence that a person can read', async () => {
    const label = proposed('c-4', { label: 'list price' });
    const text = proposed('c-4', { text: 'the harlow dynamics arm lists the FX-1 from $38,000 per arm' });
    const tooLong = proposed('c-4', { label: 'Fixture Robotics lists the FX-1 from arm' });
    const { ctx } = setup([...CLEAN, label, text, tooLong]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => [item.index, item.reasons])).toEqual([
      [7, [{ code: 'label-not-in-quote', message: 'the label says what the quotation does not: "list", "price"' }]],
      [8, [{ code: 'text-not-in-quote', message: 'the text says what the quotation does not: "harlow", "dynamics"' }]],
      [9, [{ code: 'label-too-long', message: 'the label has 7 words, and the longest allowed is 6' }]],
    ]);
    const stored = await readArtifact(ctx.runDir, '04-extract', ExtractArtifact);
    expect(stored.dropped.flatMap((item) => item.reasons.map((reason) => reason.message))).toEqual(
      result.artifact.dropped.flatMap((item) => item.reasons.map((reason) => reason.message)),
    );
    expect(result.artifact.claims).toHaveLength(7);
  });

  it('drops a claim with a value that its quotation lacks', async () => {
    const { ctx } = setup([...CLEAN, proposed('c-6', { values: [{ kind: 'number', raw: '900', normalised: '900' }] })]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.code))).toEqual([['value-not-in-quote']]);
  });

  it('drops a claim whose basis the page does not allow', async () => {
    const { ctx } = setup([...CLEAN, proposed('c-3', { basis: 'filing' }), proposed('c-3', { basis: 'measured' })]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.code))).toEqual([['basis-not-allowed'], ['basis-not-allowed']]);
    expect(result.artifact.dropped[0]?.reasons[0]?.message).toBe('the basis "filing" does not fit a company newsroom: the bases for it are press-release, datasheet, briefing, demo');
  });

  it('checks a claim against the page it names, not another: a quotation of the release is not on the report', async () => {
    const { ctx } = setup([...CLEAN, proposed('c-3', { source: 2, basis: 'reported' })]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.code))).toEqual([['quote-not-found']]);
  });

  it('records every reason a claim has, and every code is one that claimProblems knows', async () => {
    const bad = proposed('c-3', { text: 'Harlow mounts on a cage.', label: 'Harlow mount', values: [{ kind: 'name', raw: 'Harlow', normalised: 'harlow' }], basis: 'filing' });
    const { ctx } = setup([...CLEAN, bad]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    const codes = result.artifact.dropped[0]?.reasons.map((reason) => reason.code) ?? [];
    expect(codes).toEqual(['value-not-in-quote', 'text-not-in-quote', 'label-not-in-quote', 'basis-not-allowed']);
    for (const code of codes) expect(CLAIM_PROBLEM_CODES as readonly string[]).toContain(code);
  });

  it('keeps a quotation as the page has it when the model wrote it with plain quotation marks and one space', async () => {
    const text = `Dana said ${String.fromCharCode(0x201c)}we went live${String.fromCharCode(0x201d)}.\nThe company${String.fromCharCode(0x2019)}s FX-1 arm is on trial.`;
    const page: Snapshot = { ...RELEASE, text };
    const claim = { ...proposed('c-1'), text: 'Dana said the arm went live.', label: 'went live', quote: `Dana said "we went live". The company's FX-1 arm is on trial.`, values: [] };
    const { ctx } = setup([claim, claim, claim]);
    const result = await runExtract(ctx, [page], selectedStory(ARTICLE, null));
    expect(result.artifact.claims[0]?.span).toEqual({ start: 0, end: text.length, quote: text });
  });
});

describe('runExtract: a value that says other than its raw text', () => {
  // The release page with one more sentence, which has a number in words: the case in which the gate trusts the normalised form of a value, because it cannot read the raw text as digits.
  const WITH_TWELVE: Snapshot = { ...RELEASE, text: `${RELEASE.text}\nThe arm lifts twelve kg.` };
  const lifts = (normalised: string, unit = 'kg') => ({
    text: 'The arm lifts twelve kg.',
    label: 'lifts twelve kg',
    type: 'spec',
    quote: 'The arm lifts twelve kg.',
    values: [{ kind: 'number', raw: 'twelve kg', normalised, unit }],
    basis: 'datasheet',
    status: 'unspecified',
    source: 1,
  });

  it('keeps the claim whose number in words says what its normalised form says', async () => {
    const { ctx } = setup([...CLEAN, lifts('12')]);
    const result = await runExtract(ctx, [WITH_TWELVE, REPORT], selectedStory());
    expect(result.artifact.dropped).toEqual([]);
    expect(result.artifact.claims[7]?.values).toEqual([{ kind: 'number', raw: 'twelve kg', normalised: '12', unit: 'kg' }]);
  });

  it('drops the probe of the review, a claim that lists twelve kg as 15 kg, so that no claim of the record has a 15 that a sentence could cite', async () => {
    const { ctx, logs } = setup([...CLEAN, lifts('15')]);
    const result = await runExtract(ctx, [WITH_TWELVE, REPORT], selectedStory());
    expect(result.artifact.dropped).toEqual([
      { index: 7, text: 'The arm lifts twelve kg.', reasons: [{ code: 'value-normalised-mismatch', message: 'the number "twelve kg" reads as 12 kg, but the claim gives 15 kg' }] },
    ]);
    expect(result.artifact.claims).toHaveLength(7);
    expect(result.artifact.claims.flatMap((claim) => claim.values).some((value) => value.normalised === '15')).toBe(false);
    expect(logs).toEqual(['extract: 8 claims proposed, 7 kept, 1 dropped']);
  });

  it('drops a claim for a unit that is not the unit of its raw text, and for a unit that is left out', async () => {
    const { ctx } = setup([...CLEAN, lifts('12', 'g'), { ...lifts('12'), values: [{ kind: 'number', raw: 'twelve kg', normalised: '12' }] }]);
    const result = await runExtract(ctx, [WITH_TWELVE, REPORT], selectedStory());
    expect(result.artifact.dropped.map((item) => item.reasons.map((reason) => reason.message))).toEqual([
      ['the number "twelve kg" reads as 12 kg, but the claim gives 12 g'],
      ['the number "twelve kg" reads as 12 kg, but the claim gives 12'],
    ]);
  });

  it('drops a claim for a number in digits, a date and a name that say other than their raw text, with a reason for each claim and the code that names it', async () => {
    const number = proposed('c-4', { values: [{ kind: 'number', raw: '12', normalised: '15' }] });
    const date = proposed('c-2', { values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-02' }] });
    const named = proposed('c-1', { values: [{ kind: 'name', raw: 'Brindle Logistics', normalised: 'Brindle Logistics' }] });
    const { ctx } = setup([...CLEAN, number, date, named]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped.map((item) => [item.index, item.reasons.map((reason) => reason.code)])).toEqual([
      [7, ['value-normalised-mismatch']],
      [8, ['value-normalised-mismatch']],
      [9, ['value-normalised-mismatch']],
    ]);
    expect(result.artifact.dropped.map((item) => item.reasons[0]?.message)).toEqual([
      'the number "12" reads as 12, but the claim gives 15',
      'the date "1 October 2026" reads as 2026-10-01, but the claim gives 2026-10-02',
      'the name "Brindle Logistics" in lowercase with single spaces is "brindle logistics", but the claim gives "Brindle Logistics"',
    ]);
    expect(result.artifact.claims).toHaveLength(7);
  });

  it('does not compare a value whose raw text is not a number or a date that the gate reads: the claim is kept, as the gate treats such a value', async () => {
    const { ctx } = setup([...CLEAN.slice(0, 4), proposed('c-5', { values: [{ kind: 'number', raw: 'Tarnmoor', normalised: '99' }, { kind: 'date', raw: 'Tarnmoor', normalised: 'soon' }] }), CLEAN[5], CLEAN[6]]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.artifact.dropped).toEqual([]);
    expect(result.artifact.claims).toHaveLength(7);
  });

  it('keeps every claim of the clean story: the values of its claims, and of the golden claims of the gate, all say what their raw texts say', () => {
    for (const claim of [...GOLDEN_CLAIMS, ...DEMO_CLAIMS]) {
      for (const value of claim.values) expect(normalisedMismatch(value as ClaimValue), `${claim.text} / ${value.raw}`).toBeUndefined();
    }
  });
});

describe('runExtract: too few claims is no story', () => {
  it('ends with no-story when fewer claims than minClaims are kept, and still writes the artifact, with the ones kept and the ones dropped', async () => {
    const { ctx } = setup([CLEAN[0], CLEAN[1], proposed('c-3', { quote: 'Not on the page.' })]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.outcome).toBe('no-story');
    expect(result.reason).toBe('2 of the 3 claims proposed survived the checks, and at least 3 are needed to write a piece');
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual(result.artifact);
    expect(result.artifact.claims).toHaveLength(2);
    expect(result.artifact.dropped).toHaveLength(1);
  });

  it('keeps going with exactly minClaims claims', async () => {
    const { ctx } = setup(CLEAN.slice(0, 3));
    expect((await runExtract(ctx, SNAPSHOTS, selectedStory())).ok).toBe(true);
  });

  it('follows the configuration: with minClaims 2, two claims are enough', async () => {
    const { ctx } = setup(CLEAN.slice(0, 2), { config: { ...defaultConfig(), minClaims: 2 } });
    expect((await runExtract(ctx, SNAPSHOTS, selectedStory())).ok).toBe(true);
  });

  it('ends with no-story when the model finds no claim at all', async () => {
    const { ctx } = setup([]);
    const result = await runExtract(ctx, SNAPSHOTS, selectedStory());
    expect(result.ok).toBe(false);
    expect(result.artifact).toEqual({ date: ctx.date, claims: [], dropped: [] });
    if (!result.ok) expect(result.reason).toBe('0 of the 0 claims proposed survived the checks, and at least 3 are needed to write a piece');
  });
});

describe('runExtract: a reply that is not valid ends the run', () => {
  it('fails with a schema error, and writes nothing, for a field it does not know', async () => {
    const { ctx } = setup([{ ...CLEAN[0], id: 'c-99' }]);
    await expect(runExtract(ctx, SNAPSHOTS, selectedStory())).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
    expect(existsSync(path.join(ctx.runDir, '04-extract.json'))).toBe(false);
  });

  it('fails when the reply is not JSON, or has no claims field', async () => {
    const first = stageContext(scratch);
    first.fake.script('extract', 'this is not json');
    await expect(runExtract(first.ctx, SNAPSHOTS, selectedStory())).rejects.toMatchObject({ kind: 'schema' });
    const second = stageContext(scratch);
    second.fake.script('extract', { claim: [] });
    await expect(runExtract(second.ctx, SNAPSHOTS, selectedStory())).rejects.toMatchObject({ kind: 'schema' });
  });

  it('fails when a claim says it is from a page that was not shown', async () => {
    const { ctx } = setup([{ ...CLEAN[0], source: 3 }]);
    await expect(runExtract(ctx, SNAPSHOTS, selectedStory())).rejects.toMatchObject({ kind: 'schema' });
  });

  it('ends the run, and writes nothing, when the model cannot be reached', async () => {
    const made = stageContext(scratch);
    made.fake.script('extract', new ModelError('transport', 'the model cannot be reached', { retryable: false }));
    await expect(runExtract(made.ctx, SNAPSHOTS, selectedStory())).rejects.toMatchObject({ kind: 'transport' });
    expect(existsSync(path.join(made.ctx.runDir, '04-extract.json'))).toBe(false);
  });

  it('refuses to run with no story chosen, or no page', async () => {
    const { ctx, fake } = setup(CLEAN);
    await expect(runExtract(ctx, SNAPSHOTS, selectedStory(null, null))).rejects.toThrow('runExtract needs a story: the Select stage chose none');
    await expect(runExtract(ctx, [], selectedStory())).rejects.toThrow('runExtract needs at least one page: Fetch stored none');
    expect(fake.calls).toEqual([]);
  });
});

describe('runExtract: a page that is not a known kind of source is not read', () => {
  const redirected: Snapshot = { ...RELEASE, finalUrl: 'https://elsewhere.example/landing' };

  it('is not shown to the model, and the pages that are shown are numbered from 1', async () => {
    const { ctx, fake, logs } = setup([{ ...REPORTED, source: 1 }, { ...REPORTED, source: 1 }, { ...REPORTED, source: 1 }]);
    await runExtract(ctx, [redirected, REPORT], selectedStory());
    expect(blocksOf(fake.calls[0]?.user ?? '').map((block) => [block.id, block.text])).toEqual([['1', REPORT.text]]);
    expect(logs[0]).toBe(`extract: ${URLS.release} is not a known kind of source, so it is not read`);
  });

  it('asks no model when no page is left, and ends with no-story', async () => {
    const { ctx, fake } = setup(CLEAN);
    const result = await runExtract(ctx, [redirected], selectedStory());
    expect(fake.calls).toEqual([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no page of the story is a known kind of source, and at least 3 are needed to write a piece');
    expect(await readArtifact(ctx.runDir, '04-extract', ExtractArtifact)).toEqual({ date: ctx.date, claims: [], dropped: [] });
  });
});

describe('kindOfSnapshot', () => {
  const registry = smallRegistry();
  const page = (tier: 1 | 2, url: string, finalUrl = url) => ({ tier, url, finalUrl });

  it.each([
    [page(1, URLS.release), 'company-newsroom'],
    [page(1, 'https://www.fixture-robotics.example/news/a', 'https://fixture-robotics.example/news/a'), 'company-newsroom'],
    [page(1, 'https://arxiv.org/abs/0000.00000'), 'arxiv'],
    [page(1, 'https://www.sec.gov/Archives/edgar/data/1/x.htm'), 'sec'],
    [page(1, 'https://standards.example/robotics/part-1'), 'standard'],
    [page(2, URLS.mercerArticle), 'tier2'],
    [page(2, 'https://anywhere.example/a'), 'tier2'],
    [page(1, 'https://nobody.example/a'), 'unknown'],
    [page(1, URLS.release, 'https://elsewhere.example/landing'), 'unknown'],
    [page(1, URLS.release, URLS.mercerArticle), 'unknown'],
    [page(1, URLS.mercerArticle), 'unknown'],
    [page(1, 'https://arxiv.org/abs/1', 'https://nobody.example/a'), 'unknown'],
  ] as const)('says the kind of %j is %s', (snapshot, kind) => {
    expect(kindOfSnapshot(snapshot, registry)).toBe(kind);
  });
});

describe('extractReplySchema', () => {
  const schema = extractReplySchema(2);
  type Reply = { claims: Record<string, unknown>[] };
  const mutate = (change: (reply: Reply) => unknown): boolean => {
    const reply: Reply = { claims: [structuredClone(CLEAN[0]) as Record<string, unknown>] };
    change(reply);
    return schema.safeParse(reply).success;
  };

  it('accepts a reply with claims, a reply with none and a quotation of any length', () => {
    expect(mutate(() => undefined)).toBe(true);
    expect(schema.safeParse({ claims: [] }).success).toBe(true);
    expect(mutate((reply) => { (reply.claims[0] as Record<string, unknown>).quote = 'x'.repeat(5000); })).toBe(true);
  });

  it('accepts a value with a unit and a value with none', () => {
    expect(mutate((reply) => { (reply.claims[0] as Record<string, unknown>).values = [{ kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' }, { kind: 'name', raw: 'FX-1', normalised: 'fx-1' }]; })).toBe(true);
  });

  it.each([
    ['a field of the reply that it does not know', (reply: Reply) => Object.assign(reply, { note: 'x' })],
    ['a field of a claim that it does not know', (reply: Reply) => Object.assign(reply.claims[0] as object, { id: 'c-1' })],
    ['a field of a value that it does not know', (reply: Reply) => Object.assign(reply.claims[0] as object, { values: [{ kind: 'name', raw: 'a', normalised: 'a', extra: 1 }] })],
    ['a claim with no quote', (reply: Reply) => delete reply.claims[0]?.quote],
    ['an empty text', (reply: Reply) => Object.assign(reply.claims[0] as object, { text: '' })],
    ['an empty label', (reply: Reply) => Object.assign(reply.claims[0] as object, { label: '' })],
    ['a type that is not one', (reply: Reply) => Object.assign(reply.claims[0] as object, { type: 'rumour' })],
    ['a basis that is not one', (reply: Reply) => Object.assign(reply.claims[0] as object, { basis: 'hearsay' })],
    ['a status that is not one', (reply: Reply) => Object.assign(reply.claims[0] as object, { status: 'done' })],
    ['a kind of value that is not one', (reply: Reply) => Object.assign(reply.claims[0] as object, { values: [{ kind: 'colour', raw: 'a', normalised: 'a' }] })],
    ['an empty unit', (reply: Reply) => Object.assign(reply.claims[0] as object, { values: [{ kind: 'number', raw: '1', normalised: '1', unit: '' }] })],
    ['source 0', (reply: Reply) => Object.assign(reply.claims[0] as object, { source: 0 })],
    ['source 3 when there are two pages', (reply: Reply) => Object.assign(reply.claims[0] as object, { source: 3 })],
    ['a source that is not a whole number', (reply: Reply) => Object.assign(reply.claims[0] as object, { source: 1.5 })],
    ['a source given as text', (reply: Reply) => Object.assign(reply.claims[0] as object, { source: '1' })],
    ['21 values', (reply: Reply) => Object.assign(reply.claims[0] as object, { values: Array.from({ length: 21 }, () => ({ kind: 'number', raw: '1', normalised: '1' })) })],
    ['41 claims', (reply: Reply) => Object.assign(reply, { claims: Array.from({ length: 41 }, () => structuredClone(CLEAN[0])) })],
  ])('refuses %s', (_what, change) => {
    expect(mutate(change)).toBe(false);
  });

  it('accepts 40 claims and 20 values', () => {
    expect(mutate((reply) => { Object.assign(reply, { claims: Array.from({ length: 40 }, () => structuredClone(CLEAN[0])) }); })).toBe(true);
    expect(mutate((reply) => { Object.assign(reply.claims[0] as object, { values: Array.from({ length: 20 }, () => ({ kind: 'number', raw: '1', normalised: '1' })) }); })).toBe(true);
  });
});
