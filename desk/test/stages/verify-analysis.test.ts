import { allSentences, citedClaims } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { VERIFY_INSTRUCTIONS, buildVerifyUser } from '../../src/prompts/verify';
import { aggregateVerdicts, verifyPlanOf } from '../../src/stages/verify-model';
import { blocksOf } from '../support/prompts';
import { verifierReply } from '../support/verifier';

const located = allSentences(GOLDEN_DRAFT);
const analysis = located.filter((item) => item.sentence.kind === 'analysis');
const PLAN = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);

describe('verifyPlanOf: analysis', () => {
  it('has an item for every analysis sentence, marked as analysis, and for no limitation', () => {
    expect(analysis.length).toBeGreaterThan(0);
    for (const item of analysis) expect(PLAN.sentences.find((planned) => planned.id === `s${item.index}`)).toMatchObject({ kind: 'analysis', text: item.sentence.text });
    const limitations = located.filter((item) => item.sentence.kind === 'limitation');
    for (const item of limitations) expect(PLAN.sentences.map((planned) => planned.id)).not.toContain(`s${item.index}`);
  });

  it('marks a fact sentence as a fact', () => {
    expect(PLAN.sentences[0]).toMatchObject({ id: 's0', kind: 'fact' });
  });

  it('gives an analysis sentence the claims it cites, and every claim the piece cites when it cites none', () => {
    const own = analysis[0]!.sentence.claimIds;
    expect(own.length).toBeGreaterThan(0);
    expect(PLAN.sentences.find((item) => item.id === `s${analysis[0]!.index}`)?.claimIds).toEqual([...new Set(own)]);
    const draft = structuredClone(GOLDEN_DRAFT);
    const first = allSentences(draft).find((item) => item.sentence.kind === 'analysis')!;
    first.sentence.claimIds = [];
    const plan = verifyPlanOf(draft, GOLDEN_CLAIMS);
    const planned = plan.sentences.find((item) => item.id === `s${first.index}`)!;
    expect(planned.claimIds).toEqual(plan.claims.map((claim) => claim.id));
  });
});

describe('the prompt for an analysis item', () => {
  it('shows it as Analysis, apart from the facts, and still inside a block', () => {
    const user = buildVerifyUser({ claims: PLAN.claims, sentences: PLAN.sentences, headings: PLAN.headings });
    const id = `s${analysis[0]!.index}`;
    expect(user).toContain(`Analysis ${id} (`);
    expect(blocksOf(user).some((block) => block.id === id && block.text === analysis[0]!.sentence.text)).toBe(true);
  });

  it('tells the verifier what entailed means for analysis', () => {
    expect(VERIFY_INSTRUCTIONS).toContain('For an item shown as Analysis, the test for "entailed" above is replaced by this one: it is the Desk\'s own reading, not a statement of a source.');
    expect(VERIFY_INSTRUCTIONS).toContain('adds no entity, event, figure, date, quotation or claim of fact that the passages it relies on do not support');
    expect(VERIFY_INSTRUCTIONS).toContain(
      'For an Analysis item, "missing" lists each thing that makes it not entailed: what it adds (an entity, an event, a figure, a date, a quotation or a claim of fact), what it states more strongly than the passages, a prediction it presents as certain, or advice to buy, sell or hold.',
    );
    expect(VERIFY_INSTRUCTIONS).toContain('so "missing" is empty and the verdict is "entailed"');
  });
});

describe('aggregateVerdicts: analysis', () => {
  it('fails an analysis sentence that is not entailed, like a fact sentence', () => {
    const id = `s${analysis[0]!.index}`;
    const outcome = aggregateVerdicts('m', PLAN, verifierReply(PLAN, { verdicts: { [id]: 'not_entailed' } }));
    expect(outcome.failures).toEqual([expect.objectContaining({ id, kind: 'sentence', code: 'not_entailed' })]);
  });

  it('counts facts, analysis and headings in the note of a pass', () => {
    // The counts come from the draft, not from the plan whose items are being counted.
    const facts = located.filter((item) => item.sentence.kind === 'fact').length;
    const reading = analysis.length;
    const headings = GOLDEN_DRAFT.sections.filter((section) => section.paragraphs.flat().length > 0).length;
    expect(reading).toBeGreaterThan(0);
    expect(aggregateVerdicts('m', PLAN, verifierReply(PLAN)).verifier.notes).toEqual([
      `Judged ${facts} fact sentences, ${reading} analysis sentences and ${headings} headings against the passages they rely on, and the basis and the status of ${citedClaims(GOLDEN_DRAFT, GOLDEN_CLAIMS).length} claims; every one was supported.`,
    ]);
  });
});
