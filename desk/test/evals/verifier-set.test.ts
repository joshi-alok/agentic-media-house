import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Claim } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { EvalItem, EvalSet, LABELS, Passage, VERIFIER_SET_FILE, loadVerifierSet, planOf } from '../../evals/run-verifier';
import { useScratch } from '../support/context';
import { writeFileSync } from 'node:fs';

// The labelled set that the verifier is measured on: sixty sentences, each with the passages it is judged against, twenty that the passages support, twenty that
// say something they do not say and twenty that change what they say in a small way. These tests say that the set is what it claims to be, and that the schema that
// guards it refuses what a hand-edited set could get wrong.

const scratch = useScratch();
const SET = loadVerifierSet();
const problem = (schema: { safeParse(value: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): string => {
  const result = schema.safeParse(value);
  return result.success ? '' : (result.error?.issues ?? []).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
};

const ITEM: EvalItem = {
  id: 'e-01',
  label: 'supported',
  sentence: 'Fixture Robotics lists the FX-1 from $38,000 per arm.',
  passages: [{ quote: 'Fixture Robotics lists the FX-1 from $38,000 per arm.', basis: 'announcement', status: 'unspecified' }],
};

describe('the committed set', () => {
  it('has sixty sentences, twenty of each label: supported, unsupported and distorted', () => {
    expect(SET.items).toHaveLength(60);
    for (const label of LABELS) expect(SET.items.filter((item) => item.label === label), label).toHaveLength(20);
    expect(LABELS).toEqual(['supported', 'unsupported', 'distorted']);
  });

  it('numbers its items e-01 to e-60, in order, and has no sentence twice', () => {
    expect(SET.items.map((item) => item.id)).toEqual(Array.from({ length: 60 }, (_, at) => `e-${String(at + 1).padStart(2, '0')}`));
    expect(new Set(SET.items.map((item) => item.sentence)).size).toBe(60);
  });

  it('is made of twenty sets of passages, each with a supported sentence, an unsupported one and a distorted one, in that order, so that any ten items in a row mix the labels', () => {
    for (let at = 0; at < 60; at += 3) {
      const triple = SET.items.slice(at, at + 3);
      expect(triple.map((item) => item.label)).toEqual(['supported', 'unsupported', 'distorted']);
      expect(triple[1]?.passages).toEqual(triple[0]?.passages);
      expect(triple[2]?.passages).toEqual(triple[0]?.passages);
    }
  });

  it('gives a flaw for every sentence that is not supported, and for no other, and a different flaw each time', () => {
    for (const item of SET.items) expect(item.flaw === undefined, item.id).toBe(item.label === 'supported');
    const flaws = SET.items.flatMap((item) => (item.flaw === undefined ? [] : [item.flaw]));
    expect(flaws).toHaveLength(40);
    expect(new Set(flaws).size).toBe(40);
  });

  it('cites one or two passages for each sentence, of at most 300 characters, as a claim may quote', () => {
    for (const item of SET.items) {
      expect(item.passages.length, item.id).toBeGreaterThanOrEqual(1);
      expect(item.passages.length, item.id).toBeLessThanOrEqual(2);
      for (const passage of item.passages) expect(passage.quote.length, item.id).toBeLessThanOrEqual(300);
    }
  });

  it('has passages of several bases and statuses, and gives an outlet to the passages that another outlet reported, and to no other', () => {
    const passages = SET.items.flatMap((item) => item.passages);
    expect(new Set(passages.map((passage) => passage.basis)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(passages.map((passage) => passage.status))).toEqual(new Set(['unspecified', 'planned', 'deployed', 'demonstrated']));
    const reported = passages.filter((passage) => passage.basis === 'reported');
    expect(reported.length).toBeGreaterThan(0);
    for (const passage of passages) expect(passage.outlet !== undefined, passage.quote).toBe(passage.basis === 'reported');
  });

  it('is made up: plain ASCII, no address and no real name, only the companies and the people of the made-up world', () => {
    const text = readFileSync(VERIFIER_SET_FILE, 'utf8');
    expect([...text].every((character) => character.charCodeAt(0) < 128)).toBe(true);
    expect(text).not.toMatch(/https?:|www\./);
    const names = new Set(text.match(/\b(?:[A-Z][a-z]+ (?:Robotics|Logistics|Machines|Dynamics|Mobility|Foods|Partners|Daily|Wire|Safety Board)|Dana Whitcombe|Hollis Nav|Pallet Pilot|Q-Haul)\b/g));
    expect([...names].sort()).toEqual(
      ['Ashvale Foods', 'Brindle Logistics', 'Corvane Partners', 'Dana Whitcombe', 'Fixture Robotics', 'Gantry Daily', 'Hollis Dynamics', 'Hollis Nav', 'Lowmoor Safety Board', 'Northwind Machines', 'Pallet Pilot', 'Quarry Robotics', 'Q-Haul', 'Tarn Mobility'].sort(),
    );
  });

  it('keeps the answer away from the sentence: no sentence says that it is supported, unsupported or distorted, or repeats its flaw', () => {
    for (const item of SET.items) {
      expect(item.sentence, item.id).not.toMatch(/\b(unsupported|distorted|not supported)\b/i);
      if (item.flaw !== undefined) expect(item.sentence).not.toContain(item.flaw);
    }
  });

  it('is the file that loadVerifierSet reads by default, and it is valid against the schema', () => {
    expect(path.basename(VERIFIER_SET_FILE)).toBe('verifier-set.json');
    expect(EvalSet.safeParse(JSON.parse(readFileSync(VERIFIER_SET_FILE, 'utf8'))).success).toBe(true);
  });
});

describe('the schema of an item', () => {
  it('accepts a supported sentence with no flaw, and one that is not with a flaw', () => {
    expect(problem(EvalItem, ITEM)).toBe('');
    expect(problem(EvalItem, { ...ITEM, label: 'distorted', flaw: 'The price has changed.' })).toBe('');
  });

  it('refuses a flaw on a supported sentence, and no flaw on one that is not', () => {
    expect(problem(EvalItem, { ...ITEM, flaw: 'x' })).toBe('flaw: a flaw is given for a sentence that is not supported, and for no other');
    expect(problem(EvalItem, { ...ITEM, label: 'unsupported' })).toBe('flaw: a flaw is given for a sentence that is not supported, and for no other');
  });

  it('refuses an id of the wrong shape, a label that is not one of the three, and an empty sentence', () => {
    expect(problem(EvalItem, { ...ITEM, id: 'e-1' })).toContain('id:');
    expect(problem(EvalItem, { ...ITEM, id: 'item-01' })).toContain('id:');
    expect(problem(EvalItem, { ...ITEM, label: 'unclear' })).toContain('label:');
    expect(problem(EvalItem, { ...ITEM, sentence: '' })).toContain('sentence:');
    expect(problem(EvalItem, { ...ITEM, sentence: 'x'.repeat(301) })).toContain('sentence:');
  });

  it('refuses no passage, more than three, a quote that is empty or over 300 characters, and a basis or status that does not exist', () => {
    const passage = ITEM.passages[0] as Passage;
    expect(problem(EvalItem, { ...ITEM, passages: [] })).toContain('passages:');
    expect(problem(EvalItem, { ...ITEM, passages: [passage, passage, passage, passage] })).toContain('passages:');
    expect(problem(EvalItem, { ...ITEM, passages: [passage, passage, passage] })).toBe('');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, quote: '' }] })).toContain('passages.0.quote:');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, quote: 'x'.repeat(301) }] })).toContain('passages.0.quote:');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, quote: 'x'.repeat(300) }] })).toBe('');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, basis: 'rumour' }] })).toContain('passages.0.basis:');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, status: 'done' }] })).toContain('passages.0.status:');
  });

  it('refuses an outlet on a passage that is not reported, and a reported passage with no outlet', () => {
    const passage = ITEM.passages[0] as Passage;
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, outlet: 'Gantry Daily' }] })).toBe('passages.0.outlet: a passage has an outlet when its basis is reported, and not otherwise');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, basis: 'reported' }] })).toBe('passages.0.outlet: a passage has an outlet when its basis is reported, and not otherwise');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...passage, basis: 'reported', outlet: 'Gantry Daily' }] })).toBe('');
  });

  it('refuses a field it does not know', () => {
    expect(problem(EvalItem, { ...ITEM, note: 'x' })).toContain('Unrecognized key');
    expect(problem(EvalItem, { ...ITEM, passages: [{ ...(ITEM.passages[0] as Passage), url: 'https://a.example/' }] })).toContain('Unrecognized key');
  });
});

describe('the schema of a set, and loading it', () => {
  it('refuses two items with the same id, or the same sentence, and names it', () => {
    expect(problem(EvalSet, { about: 'x', items: [ITEM, ITEM] })).toContain('two items have the same id: "e-01"');
    expect(problem(EvalSet, { about: 'x', items: [ITEM, { ...ITEM, id: 'e-02' }] })).toContain('two items have the same sentence');
    expect(problem(EvalSet, { about: 'x', items: [ITEM, { ...ITEM, id: 'e-02', sentence: 'Another sentence.' }] })).toBe('');
  });

  it('refuses a set with no description, and a field it does not know', () => {
    expect(problem(EvalSet, { about: '', items: [] })).toContain('about:');
    expect(problem(EvalSet, { about: 'x', items: [], extra: 1 })).toContain('Unrecognized key');
  });

  it('says that a file that is not there, is not JSON or is not a set cannot be used, and names it', () => {
    const dir = scratch();
    const file = path.join(dir, 'set.json');
    expect(() => loadVerifierSet(file)).toThrow(`the verifier set ${file} cannot be read`);
    writeFileSync(file, '{"about": ');
    expect(() => loadVerifierSet(file)).toThrow(`the verifier set ${file} cannot be read`);
    writeFileSync(file, JSON.stringify({ about: 'x', items: [{ ...ITEM, flaw: 'x' }] }));
    expect(() => loadVerifierSet(file)).toThrow(`the verifier set ${file} is not valid: items.0.flaw:`);
  });
});

describe('planOf', () => {
  const batch = SET.items.slice(12, 15);
  const plan = planOf(batch);

  it('has a sentence for each item, numbered s0, s1 and so on, with the text of the item and no more', () => {
    expect(plan.sentences.map((sentence) => [sentence.id, sentence.text, sentence.section])).toEqual(batch.map((item, at) => [`s${at}`, item.sentence, 'body']));
    expect(plan.headings).toEqual([]);
  });

  it('says where each sentence stands in the batch, counting from 1, for the notes that name it', () => {
    expect(plan.sentences.map((sentence) => sentence.where)).toEqual(['sentence 1 of the batch', 'sentence 2 of the batch', 'sentence 3 of the batch']);
  });

  it('has a claim for each passage, numbered from c-1 over the whole batch, and each sentence cites the claims of its own passages', () => {
    const passages = batch.flatMap((item) => item.passages);
    expect(plan.claims.map((claim) => claim.id)).toEqual(passages.map((_, at) => `c-${at + 1}`));
    expect(plan.claims.map((claim) => claim.span.quote)).toEqual(passages.map((passage) => passage.quote));
    let next = 1;
    batch.forEach((item, at) => {
      expect(plan.sentences[at]?.claimIds).toEqual(item.passages.map(() => `c-${next++}`));
    });
  });

  it('makes claims that the gate accepts, with the basis and the status of the passage, and the outlet of one that was reported', () => {
    for (const claim of plan.claims) expect(Claim.safeParse(claim).success, claim.id).toBe(true);
    const reported = SET.items.find((item) => item.passages.some((passage) => passage.basis === 'reported')) as EvalItem;
    const claim = planOf([reported]).claims[0] as Claim;
    expect([claim.basis, claim.status, claim.source.tier, claim.source.outlet]).toEqual(['reported', 'planned', 2, 'Gantry Daily']);
    const ordinary = planOf([ITEM]).claims[0] as Claim;
    expect([ordinary.basis, ordinary.status, ordinary.source.tier, ordinary.source.outlet]).toEqual(['announcement', 'unspecified', 1, undefined]);
    expect(ordinary.span).toEqual({ start: 0, end: ITEM.passages[0]?.quote.length, quote: ITEM.passages[0]?.quote });
  });

  it('does not say which sentence is supported: the label and the flaw are nowhere in the plan', () => {
    const everything = JSON.stringify(planOf(SET.items));
    for (const item of SET.items) if (item.flaw !== undefined) expect(everything).not.toContain(item.flaw);
    expect(everything).not.toMatch(/"label":"(supported|unsupported|distorted)"/);
  });
});
