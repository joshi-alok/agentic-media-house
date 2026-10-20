import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { VerifyReply, aggregateVerdicts, verifyPlanOf } from '../../src/stages/verify-model';
import { verifierReply } from '../support/verifier';

// The verdict must follow from what the verifier has just said. `missing` is what the item says that no passage states.

const PLAN = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
const ID = PLAN.sentences[2]!.id;
const MODEL = 'model-v';

/** A reply that clears everything, but gives item `ID` this entry. */
const withEntry = (entry: { reason: string; missing: string[]; verdict: 'entailed' | 'not_entailed' | 'ambiguous' }) => {
  const reply = verifierReply(PLAN);
  reply.verdicts = reply.verdicts.map((item) => (item.id === ID ? { id: ID, ...entry } : item));
  return reply;
};

describe('VerifyReply', () => {
  it('writes the reason first, then what is missing, then the verdict', () => {
    const shape = VerifyReply.shape.verdicts.element.shape;
    expect(Object.keys(shape)).toEqual(['id', 'reason', 'missing', 'verdict']);
  });

  it('refuses a verdict that has no list of what is missing', () => {
    const parsed = VerifyReply.safeParse({ verdicts: [{ id: 's0', reason: 'It says it.', verdict: 'entailed' }], labels: [] });
    expect(parsed.success).toBe(false);
  });

  it('refuses more than eight things missing in one item, and an empty one', () => {
    const entry = (missing: string[]) => ({ verdicts: [{ id: 's0', reason: 'r', missing, verdict: 'not_entailed' }], labels: [] });
    expect(VerifyReply.safeParse(entry(Array.from({ length: 9 }, () => 'x'))).success).toBe(false);
    expect(VerifyReply.safeParse(entry(['']))).toHaveProperty('success', false);
    expect(VerifyReply.safeParse(entry(['a date'])).success).toBe(true);
  });
});

describe('aggregateVerdicts: a verdict that has to follow the list', () => {
  it('clears an item that is entailed with nothing missing', () => {
    expect(aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'The passage says it.', missing: [], verdict: 'entailed' })).failures).toEqual([]);
  });

  it('fails an item that is entailed over a list of what no passage states, as not_entailed, and says what the list was', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Close enough.', missing: ['the date', 'the amount'], verdict: 'entailed' }));
    expect(outcome.verifier.passed).toBe(false);
    expect(outcome.failures).toEqual([
      { id: ID, kind: 'sentence', code: 'not_entailed', reason: 'the verifier said entailed, but its own list of what the passages do not state is not empty: the date; the amount' },
    ]);
  });

  it('fails an item that is not_entailed with the list added to the reason, so that the revision is told what to cut', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'The passage gives another date.', missing: ['18 August'], verdict: 'not_entailed' }));
    expect(outcome.failures).toEqual([{ id: ID, kind: 'sentence', code: 'not_entailed', reason: 'The passage gives another date. Not stated: 18 August' }]);
  });

  it('calls an item ambiguous, not not_entailed, when it is not_entailed and names nothing that is missing', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Something is off.', missing: [], verdict: 'not_entailed' }));
    expect(outcome.failures).toEqual([
      { id: ID, kind: 'sentence', code: 'ambiguous', reason: 'the verifier said not entailed but named nothing that the passages do not state (Something is off.)' },
    ]);
  });

  it('keeps an ambiguous verdict as it is, with the list when there is one', () => {
    expect(aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Cannot tell.', missing: [], verdict: 'ambiguous' })).failures[0]).toMatchObject({ code: 'ambiguous', reason: 'Cannot tell.' });
    expect(aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Cannot tell.', missing: ['the unit'], verdict: 'ambiguous' })).failures[0]).toMatchObject({ code: 'ambiguous', reason: 'Cannot tell. Not stated: the unit' });
  });

  it('puts the failure in the notes in words', () => {
    const outcome = aggregateVerdicts(MODEL, PLAN, withEntry({ reason: 'Close enough.', missing: ['the date'], verdict: 'entailed' }));
    expect(outcome.verifier.notes).toEqual([expect.stringContaining('was judged not entailed: the verifier said entailed, but its own list')]);
  });
});
