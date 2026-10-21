import { describe, expect, it } from 'vitest';
import { EvalItem, evaluateVerifier, loadVerifierSet, planOf } from '../../evals/run-verifier';
import { lazyVerifier, perfectVerifier, scriptedVerifier, strictVerifier } from '../../evals/scripted';

const SET = loadVerifierSet();
const NEW = SET.items.slice(60);

describe('the ten sets of passages added for AI agents in crypto', () => {
  it('are thirty items, e-61 to e-90, ten of each label in triples that share their passages', () => {
    expect(NEW.map((item) => item.id)).toEqual(Array.from({ length: 30 }, (_, at) => `e-${String(at + 61)}`));
    for (let at = 0; at < 30; at += 3) {
      const triple = NEW.slice(at, at + 3);
      expect(triple.map((item) => item.label)).toEqual(['supported', 'unsupported', 'distorted']);
      expect(triple[1]?.passages).toEqual(triple[0]?.passages);
      expect(triple[2]?.passages).toEqual(triple[0]?.passages);
    }
  });

  it('have one set of headings and one of analysis, and facts in the rest', () => {
    expect(NEW.filter((item) => item.kind === 'heading').map((item) => item.id)).toEqual(['e-61', 'e-62', 'e-63']);
    expect(NEW.filter((item) => item.kind === 'analysis').map((item) => item.id)).toEqual(['e-76', 'e-77', 'e-78']);
    expect(NEW.filter((item) => item.kind === undefined)).toHaveLength(24);
  });

  it('name an outlet for the set that another outlet reported, and use the bases of the domain', () => {
    const passages = NEW.flatMap((item) => item.passages);
    expect(passages.some((passage) => passage.basis === 'reported' && passage.outlet === 'Mercer Wire')).toBe(true);
    expect(new Set(passages.map((passage) => passage.basis))).toEqual(new Set(['docs', 'announcement', 'reported', 'filing', 'paper']));
  });

  it('refuse a kind that is not fact, analysis or heading', () => {
    expect(EvalItem.safeParse({ ...NEW[0], kind: 'quote' }).success).toBe(false);
  });
});

describe('planOf: kinds', () => {
  it('puts a heading in the headings of the plan with an id that starts with h, and the others in the sentences, analysis marked as such', () => {
    const plan = planOf(SET.items.slice(60, 70));
    expect(plan.headings.map((heading) => heading.id)).toEqual(['h0', 'h1', 'h2']);
    expect(plan.headings[0]).toMatchObject({ text: 'How a payment is settled', claimIds: ['c-1'] });
    expect(plan.sentences.map((sentence) => sentence.id)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8', 's9']);
    expect(plan.sentences.every((sentence) => sentence.kind === 'fact')).toBe(true);
    const analysis = planOf(SET.items.slice(75, 78));
    expect(analysis.headings).toEqual([]);
    expect(analysis.sentences.map((sentence) => sentence.kind)).toEqual(['analysis', 'analysis', 'analysis']);
  });
});

describe('evaluateVerifier on the ninety', () => {
  it('scores a verifier that knows the answers perfectly, in nine calls, headings and analysis included', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: 'm' });
    expect(report.items).toBe(90);
    expect(report.calls).toBe(9);
    expect(report.accuracy).toBe(1);
  });

  it('finds a lazy verifier wrong on every item that is not supported, and a strict one wrong on every supported item', async () => {
    const lazy = await evaluateVerifier(lazyVerifier(SET), SET, { model: 'm' });
    expect(lazy.perLabel.unsupported.recall).toBe(0);
    expect(lazy.perLabel.distorted.recall).toBe(0);
    const strict = await evaluateVerifier(strictVerifier(SET), SET, { model: 'm' });
    expect(strict.perLabel.supported.recall).toBe(0);
  });

  it('reads the verdict on a heading at the place of the heading in its batch: a verifier that rejects only headings is wrong on the supported heading and on nothing else', async () => {
    const rejectsHeadings = scriptedVerifier(SET, (item) => (item.kind === 'heading' || item.label !== 'supported' ? 'not_entailed' : 'entailed'));
    const report = await evaluateVerifier(rejectsHeadings, SET, { model: 'm' });
    expect(report.results.filter((result) => result.cleared !== (result.label === 'supported'))).toEqual([{ id: 'e-61', label: 'supported', cleared: false }]);
  });
});
