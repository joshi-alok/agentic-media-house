import { allSentences } from '@robywire/gate';
import type { Draft } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../../src/model/fake';
import { ModelError } from '../../src/model/types';
import { buildVerifyUser, verifySystem } from '../../src/prompts/verify';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { VERIFY_EFFORT, VERIFY_MAX_OUTPUT_TOKENS, VerifyReply, aggregateVerdicts, judgePlan, lowerRejectedStatuses, runVerifier, verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { blocksOf, outsideBlocks } from '../support/prompts';
import { verifierReply } from '../support/verifier';

// G10, the model check. The verifier is a model, so these tests give the stage a scripted one: one that clears everything, and ones that
// clear all but one thing, leave something out, or answer about something that was not asked. Whatever it says, the stage decides what it means:
// anything but "entailed" fails, and what the verifier leaves out fails too.

const scratch = useScratch();
const PLAN = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
const MODEL = 'model-v';

describe('verifyPlanOf', () => {
  it('has an item for every fact sentence and every analysis sentence, in the order of the piece, and for no limitation', () => {
    const judged = allSentences(GOLDEN_DRAFT).filter((item) => item.sentence.kind !== 'limitation');
    expect(PLAN.sentences.map((item) => item.id)).toEqual(judged.map((item) => `s${item.index}`));
    expect(PLAN.sentences.map((item) => item.text)).toEqual(judged.map((item) => item.sentence.text));
    const limitations = allSentences(GOLDEN_DRAFT).filter((item) => item.sentence.kind === 'limitation');
    expect(limitations.length).toBeGreaterThan(3);
    for (const item of limitations) expect(PLAN.sentences.map((planned) => planned.id)).not.toContain(`s${item.index}`);
  });

  it('numbers a sentence as the gate does, counting from 0 over the whole piece, the analysis and the limitations too', () => {
    expect(PLAN.sentences[0]).toMatchObject({ id: 's0', section: 'title', where: 'title' });
    expect(PLAN.sentences[1]).toMatchObject({ id: 's1', section: 'description', where: 'description' });
    const located = allSentences(GOLDEN_DRAFT);
    for (const item of PLAN.sentences) expect(located[Number(item.id.slice(1))]?.sentence.text).toBe(item.text);
  });

  it('says where a sentence stands the way the gate does', () => {
    expect(PLAN.sentences[2]?.where).toBe('opening, sentence 1');
    expect(PLAN.sentences.some((item) => item.where === 'section "What shipped", sentence 1')).toBe(true);
  });

  it('gives each sentence the claims it cites, each once and only claims that exist', () => {
    const draft = structuredClone(GOLDEN_DRAFT) as Draft;
    draft.opening[0] = { kind: 'fact', text: 'A sentence.', claimIds: ['c-1', 'c-1', 'c-99', 'c-8'] };
    expect(verifyPlanOf(draft, GOLDEN_CLAIMS).sentences[2]?.claimIds).toEqual(['c-1', 'c-8']);
  });

  it('has an item for the heading of every section, relying on the claims that the sentences of its section cite, analysis included', () => {
    expect(PLAN.headings.map((item) => [item.id, item.text])).toEqual([
      ['h0', 'What shipped'],
      ['h1', 'What the customer reports'],
      ['h2', 'What the filing shows'],
    ]);
    expect(PLAN.headings[2]?.claimIds).toEqual(['c-17', 'c-18', 'c-16', 'c-19', 'c-7', 'c-6']);
    expect(PLAN.headings[1]?.claimIds).toContain('c-12');
    expect(PLAN.headings[1]?.where).toBe('section "What the customer reports"');
  });

  it('leaves out the heading of a section that has no sentence, which the page does not show', () => {
    const draft = structuredClone(GOLDEN_DRAFT) as Draft;
    draft.sections.splice(1, 0, { heading: 'An empty section', paragraphs: [[], []] });
    const plan = verifyPlanOf(draft, GOLDEN_CLAIMS);
    expect(plan.headings.map((item) => item.id)).toEqual(['h0', 'h2', 'h3']);
  });

  it('has the claims that the piece cites, each once, in the order of the claims, and no claim that it does not cite', () => {
    const ids = PLAN.claims.map((claim) => claim.id);
    expect(ids).toEqual([...ids].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))));
    expect(new Set(ids).size).toBe(ids.length);
    const draft = structuredClone(GOLDEN_DRAFT) as Draft;
    draft.sections = draft.sections.slice(0, 1);
    expect(verifyPlanOf(draft, GOLDEN_CLAIMS).claims.map((claim) => claim.id)).not.toContain('c-19');
  });
});

describe('VerifyReply', () => {
  const valid = () => structuredClone(verifierReply(PLAN)) as unknown as Record<string, unknown>;

  it('accepts a reply that judges everything', () => {
    expect(VerifyReply.safeParse(valid()).success).toBe(true);
    expect(VerifyReply.safeParse({ verdicts: [], labels: [] }).success).toBe(true);
  });

  it.each([
    ['a field it does not know', { note: 'x' }],
    ['no verdicts', { verdicts: undefined }],
    ['a verdict that is not one', { verdicts: [{ id: 's0', reason: 'x', missing: [], verdict: 'probably' }] }],
    ['a verdict with no reason', { verdicts: [{ id: 's0', reason: '', missing: [], verdict: 'entailed' }] }],
    ['a verdict with a field it does not know', { verdicts: [{ id: 's0', reason: 'x', missing: [], verdict: 'entailed', score: 1 }] }],
    ['a verdict with no id', { verdicts: [{ id: '', reason: 'x', missing: [], verdict: 'entailed' }] }],
    ['a reason of more than 400 characters', { verdicts: [{ id: 's0', reason: 'x'.repeat(401), missing: [], verdict: 'entailed' }] }],
    ['a label judgement that is not true or false', { labels: [{ id: 'c-1', basisSupported: 'yes', statusSupported: true, reason: 'x' }] }],
    ['a label judgement with no status', { labels: [{ id: 'c-1', basisSupported: true, reason: 'x' }] }],
    ['501 verdicts', { verdicts: Array.from({ length: 501 }, () => ({ id: 's0', reason: 'x', missing: [], verdict: 'entailed' })) }],
    ['101 label judgements', { labels: Array.from({ length: 101 }, () => ({ id: 'c-1', basisSupported: true, statusSupported: true, reason: 'x' })) }],
  ])('refuses %s', (_what, change) => {
    expect(VerifyReply.safeParse({ ...valid(), ...change }).success).toBe(false);
  });

  it('accepts an id of one character, which is for the plan to refuse, as it refuses every id it did not ask about', () => {
    const reply = { verdicts: [{ id: 'x', reason: 'x', missing: [], verdict: 'entailed' }], labels: [{ id: 'y', basisSupported: true, statusSupported: true, reason: 'x' }] };
    expect(VerifyReply.safeParse(reply).success).toBe(true);
  });

  it('accepts a reason of exactly 400 characters, 500 verdicts and 100 label judgements', () => {
    expect(VerifyReply.safeParse({ ...valid(), verdicts: [{ id: 's0', reason: 'x'.repeat(400), missing: [], verdict: 'entailed' }] }).success).toBe(true);
    expect(VerifyReply.safeParse({ ...valid(), verdicts: Array.from({ length: 500 }, () => ({ id: 's0', reason: 'x', missing: [], verdict: 'entailed' })) }).success).toBe(true);
    expect(VerifyReply.safeParse({ ...valid(), labels: Array.from({ length: 100 }, () => ({ id: 'c-1', basisSupported: true, statusSupported: true, reason: 'x' })) }).success).toBe(true);
  });
});

describe('aggregateVerdicts', () => {
  it('passes a draft when every item is entailed and every label is supported, and says what was checked', () => {
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN));
    const facts = PLAN.sentences.filter((item) => item.kind === 'fact').length;
    expect(failures).toEqual([]);
    expect(facts).toBeGreaterThan(30);
    expect(PLAN.sentences.length - facts).toBeGreaterThan(0);
    expect(verifier).toEqual({
      model: MODEL,
      passed: true,
      notes: [`Judged ${facts} fact sentences, ${PLAN.sentences.length - facts} analysis sentences and 3 headings against the passages they rely on, and the basis and the status of ${PLAN.claims.length} claims; every one was supported.`],
    });
  });

  it('fails a sentence that is not entailed, and says which and why', () => {
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { verdicts: { s3: 'not_entailed' } }));
    expect(failures).toEqual([{ id: 's3', kind: 'sentence', code: 'not_entailed', reason: 'The passages do not say it (s3). Not stated: what the passages do not say' }]);
    expect(verifier.passed).toBe(false);
    expect(verifier.notes).toEqual([`opening, sentence 2 was judged not entailed: The passages do not say it (s3). Not stated: what the passages do not say`]);
  });

  it('fails a sentence that is ambiguous, as it fails one that is not entailed', () => {
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { verdicts: { s0: 'ambiguous' } }));
    expect(failures).toEqual([{ id: 's0', kind: 'sentence', code: 'ambiguous', reason: 'The passages do not say it (s0).' }]);
    expect(verifier.passed).toBe(false);
    expect(verifier.notes).toEqual(['title was judged ambiguous: The passages do not say it (s0).']);
  });

  it('fails a sentence that the verifier gave no verdict on', () => {
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { omit: ['s4'] }));
    expect(failures).toEqual([{ id: 's4', kind: 'sentence', code: 'missing', reason: 'the verifier gave no verdict' }]);
    expect(verifier.notes).toEqual(['opening, sentence 3 was not judged: the verifier gave no verdict']);
  });

  it('judges the headings as it judges sentences: not entailed, ambiguous and missing all fail', () => {
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { verdicts: { h0: 'not_entailed', h1: 'ambiguous' }, omit: ['h2'] }));
    expect(failures.map((failure) => [failure.id, failure.kind, failure.code])).toEqual([
      ['h0', 'heading', 'not_entailed'],
      ['h1', 'heading', 'ambiguous'],
      ['h2', 'heading', 'missing'],
    ]);
    expect(verifier.notes[0]).toBe('section "What shipped" was judged not entailed: The passages do not say it (h0). Not stated: what the passages do not say');
    expect(verifier.notes[2]).toBe('section "What the filing shows" was not judged: the verifier gave no verdict');
  });

  it('fails a claim whose basis is not supported, and one whose status is not, and says which', () => {
    const reply = verifierReply(PLAN);
    reply.labels[0] = { id: 'c-1', basisSupported: false, statusSupported: true, reason: 'It is not an announcement.' };
    reply.labels[1] = { id: 'c-2', basisSupported: true, statusSupported: false, reason: 'It is not planned.' };
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, reply);
    expect(failures).toEqual([
      { id: 'c-1', kind: 'label', code: 'unsupported', field: 'basis', reason: 'the basis "announcement" is not supported: It is not an announcement.' },
      { id: 'c-2', kind: 'label', code: 'unsupported', field: 'status', reason: 'the status "unspecified" is not supported: It is not planned.' },
    ]);
    expect(verifier.notes).toEqual(['claim c-1: the basis "announcement" is not supported: It is not an announcement.', 'claim c-2: the status "unspecified" is not supported: It is not planned.']);
  });

  it('fails twice a claim whose basis and status are both unsupported, once for each field', () => {
    const { failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { unsupported: ['c-8'] }));
    expect(failures.map((failure) => failure.field)).toEqual(['basis', 'status']);
    expect(failures.map((failure) => failure.reason)).toEqual([
      'the basis "docs" is not supported: The passage does not support the label.',
      'the status "unspecified" is not supported: The passage does not support the label.',
    ]);
  });

  it('fails a claim that the verifier gave no judgement on', () => {
    const { failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { omit: ['c-8'] }));
    // A label with no verdict at all is neither a basis nor a status that was rejected, so it names no field.
    expect(failures).toEqual([{ id: 'c-8', kind: 'label', code: 'missing', reason: 'the verifier gave no verdict on the basis "docs" and the status "unspecified"' }]);
    expect('field' in (failures[0] as object)).toBe(false);
  });

  it('lists every failure, items first and then claims, and fails when there are several', () => {
    const { verifier, failures } = aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, { verdicts: { s2: 'not_entailed', s0: 'ambiguous' }, unsupported: ['c-3'] }));
    expect(failures.map((failure) => failure.id)).toEqual(['s0', 's2', 'c-3', 'c-3']);
    expect(verifier.notes).toHaveLength(4);
    expect(verifier.passed).toBe(false);
  });

  it('refuses a verdict on an id that was not asked about, and an id given twice, as a reply that is not valid', () => {
    const unknownItem = verifierReply(PLAN, { extra: { verdicts: [{ id: 's999', reason: 'x', missing: [], verdict: 'entailed' }] } });
    expect(() => aggregateVerdicts(MODEL, PLAN, unknownItem)).toThrow('the verifier judged "s999", which is not a sentence or a heading it was given');
    const unknownClaim = verifierReply(PLAN, { extra: { labels: [{ id: 'c-99', basisSupported: true, statusSupported: true, reason: 'x' }] } });
    expect(() => aggregateVerdicts(MODEL, PLAN, unknownClaim)).toThrow('the verifier judged the labels of "c-99", which is not a claim it was given');
    const twiceItem = verifierReply(PLAN, { extra: { verdicts: [{ id: 's0', reason: 'x', missing: [], verdict: 'entailed' }] } });
    expect(() => aggregateVerdicts(MODEL, PLAN, twiceItem)).toThrow('the verifier judged "s0" more than once');
    const twiceClaim = verifierReply(PLAN, { extra: { labels: [{ id: 'c-1', basisSupported: true, statusSupported: true, reason: 'x' }] } });
    expect(() => aggregateVerdicts(MODEL, PLAN, twiceClaim)).toThrow('the verifier judged the labels of "c-1" more than once');
    try {
      aggregateVerdicts(MODEL, PLAN, unknownItem);
    } catch (error) {
      expect(error).toBeInstanceOf(ModelError);
      expect((error as ModelError).kind).toBe('schema');
    }
  });

  it('does not accept the id of a claim as the id of an item, nor the id of an item as the id of a claim', () => {
    const wrongKind = verifierReply(PLAN, { omit: ['s0'], extra: { verdicts: [{ id: 'c-1', reason: 'x', missing: [], verdict: 'entailed' }] } });
    expect(() => aggregateVerdicts(MODEL, PLAN, wrongKind)).toThrow('which is not a sentence or a heading it was given');
    const other = verifierReply(PLAN, { extra: { labels: [{ id: 's0', basisSupported: true, statusSupported: true, reason: 'x' }] } });
    expect(() => aggregateVerdicts(MODEL, PLAN, other)).toThrow('which is not a claim it was given');
  });

  it('passes a plan that has no claim, and one that has no heading', () => {
    const plan = { sentences: PLAN.sentences.slice(0, 1), headings: [], claims: [] };
    expect(aggregateVerdicts(MODEL, plan, verifierReply(plan)).verifier.passed).toBe(true);
  });

  it('does not change the plan or the reply', () => {
    const plan = structuredClone(PLAN);
    const reply = verifierReply(PLAN, { verdicts: { s0: 'not_entailed' } });
    const before = structuredClone(reply);
    aggregateVerdicts(MODEL, plan, reply);
    expect(reply).toEqual(before);
    expect(plan).toEqual(PLAN);
  });
});

describe('judgePlan', () => {
  it('makes one call in the role verify, with the model it is given, the prompt of the verifier and the reply schema, and returns the outcome and the cost', async () => {
    const fake = new FakeClient().script('verify', verifierReply(PLAN));
    const { outcome, usage } = await judgePlan(fake, 'model-w', PLAN);
    expect(fake.calls).toHaveLength(1);
    const [request] = fake.calls;
    expect(request?.role).toBe('verify');
    expect(request?.model).toBe('model-w');
    expect(request?.system).toBe(verifySystem());
    expect(request?.user).toBe(buildVerifyUser({ claims: PLAN.claims, sentences: PLAN.sentences, headings: PLAN.headings }));
    expect(request?.maxOutputTokens).toBe(VERIFY_MAX_OUTPUT_TOKENS);
    expect(outcome.verifier.model).toBe('model-w');
    expect(outcome.verifier.passed).toBe(true);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it('reads the reply as runVerifier does: what is not entailed fails, and a verdict for what was not asked is a schema error', async () => {
    const id = PLAN.sentences[2]?.id as string;
    const failing = await judgePlan(new FakeClient().script('verify', verifierReply(PLAN, { verdicts: { [id]: 'not_entailed' } })), MODEL, PLAN);
    expect(failing.outcome.failures.map((failure) => failure.id)).toEqual([id]);
    const unknown = new FakeClient().script('verify', verifierReply(PLAN, { extra: { verdicts: [{ id: 's999', reason: 'x', missing: [], verdict: 'entailed' }] } }));
    await expect(judgePlan(unknown, MODEL, PLAN)).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
  });

  it('refuses a plan that has nothing to judge, because the message would be empty', async () => {
    await expect(judgePlan(new FakeClient(), MODEL, { sentences: [], headings: [], claims: [] })).rejects.toThrow('buildVerifyUser needs at least one sentence or heading to judge');
  });
});

describe('runVerifier', () => {
  /** A stage whose model will say `reply` for the verify role, and the outcome of the check on the golden draft. */
  async function check(reply: unknown, draft: Draft = GOLDEN_DRAFT, claims = GOLDEN_CLAIMS) {
    const made = stageContext(scratch);
    made.fake.script('verify', reply);
    return { ...made, outcome: await runVerifier(made.ctx, draft, claims) };
  }

  it('passes when the verifier clears everything, with the model of the configuration in the result', async () => {
    const { outcome, ctx } = await check(verifierReply(PLAN));
    expect(outcome.verifier.passed).toBe(true);
    expect(outcome.verifier.model).toBe(ctx.config.models.verify);
    expect(outcome.failures).toEqual([]);
  });

  it('logs that the check passed', async () => {
    const { logs } = await check(verifierReply(PLAN));
    expect(logs).toEqual(['verify: the model check passed']);
  });

  it('judges a small draft whose items are two facts, two analysis sentences and two headings', async () => {
    const draft = structuredClone(GOLDEN_DRAFT) as Draft;
    draft.title = { kind: 'analysis', text: 'A title.', claimIds: [] };
    draft.description = { kind: 'analysis', text: 'A description.', claimIds: [] };
    draft.opening = [];
    draft.takeaways = [];
    draft.sections = [
      { heading: 'What shipped', paragraphs: [[{ kind: 'fact', text: 'Fixture Robotics has begun shipping.', claimIds: ['c-1'] }]] },
      { heading: 'What it costs', paragraphs: [[{ kind: 'fact', text: 'Fixture Robotics lists the arm from $38,000.', claimIds: ['c-4'] }]] },
    ];
    const plan = verifyPlanOf(draft, GOLDEN_CLAIMS);
    expect(plan.sentences.map((item) => item.kind)).toEqual(['analysis', 'analysis', 'fact', 'fact']);
    expect(plan.headings).toHaveLength(2);
    const { outcome, fake } = await check(verifierReply(plan), draft);
    expect(outcome.verifier.passed).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it('asks one model, once, in the role verify, with the model of the configuration, the plan of the draft and nothing else', async () => {
    const { fake, ctx } = await check(verifierReply(PLAN));
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(Object.keys(call ?? {}).sort()).toEqual(['effort', 'maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    expect(call?.role).toBe('verify');
    expect(call?.model).toBe(ctx.config.models.verify);
    expect(call?.maxOutputTokens).toBe(VERIFY_MAX_OUTPUT_TOKENS);
    expect(call?.effort).toBe(VERIFY_EFFORT);
    expect(VERIFY_EFFORT).toBe('medium');
    // Thinking counts toward the limit on the reply, and a reply that is cut off is a refusal that ends the run: the limit leaves room for the thinking of a long piece.
    expect(VERIFY_MAX_OUTPUT_TOKENS).toBe(16000);
    expect(call?.schema).toBe(VerifyReply);
    expect(call?.system).toBe(verifySystem());
    expect(call?.system.startsWith(UNTRUSTED_PREAMBLE)).toBe(true);
    expect(call?.user).toBe(buildVerifyUser({ claims: PLAN.claims, sentences: PLAN.sentences, headings: PLAN.headings }));
  });

  it('shows the model the sentences, the headings and the passages only inside blocks', async () => {
    const { fake } = await check(verifierReply(PLAN));
    const user = fake.calls[0]?.user ?? '';
    expect(blocksOf(user)).toHaveLength(PLAN.claims.length + PLAN.sentences.length + PLAN.headings.length);
    const outside = outsideBlocks(user);
    for (const item of [...PLAN.sentences, ...PLAN.headings]) expect(outside).not.toContain(item.text);
    for (const claim of PLAN.claims) expect(outside).not.toContain(claim.span.quote);
  });

  it('fails the draft when one sentence is not entailed, and tells which', async () => {
    const { outcome, logs } = await check(verifierReply(PLAN, { verdicts: { s7: 'not_entailed' } }));
    expect(outcome.verifier.passed).toBe(false);
    expect(outcome.failures.map((failure) => failure.id)).toEqual(['s7']);
    expect(logs).toEqual(['verify: the model check failed 1 times']);
  });

  it('fails the draft when one sentence is ambiguous', async () => {
    const { outcome } = await check(verifierReply(PLAN, { verdicts: { s9: 'ambiguous' } }));
    expect(outcome.verifier.passed).toBe(false);
    expect(outcome.failures[0]).toMatchObject({ id: 's9', code: 'ambiguous' });
  });

  it('fails the draft when the verifier leaves a sentence out', async () => {
    const { outcome } = await check(verifierReply(PLAN, { omit: ['s5'] }));
    expect(outcome.failures).toMatchObject([{ id: 's5', code: 'missing' }]);
  });

  it('covers the headings: a heading that is not entailed fails the draft', async () => {
    const { outcome } = await check(verifierReply(PLAN, { verdicts: { h1: 'not_entailed' } }));
    expect(outcome.failures).toMatchObject([{ id: 'h1', kind: 'heading', code: 'not_entailed' }]);
    expect(outcome.verifier.notes).toEqual(['section "What the customer reports" was judged not entailed: The passages do not say it (h1). Not stated: what the passages do not say']);
  });

  it('covers the labels: a claim whose basis is not supported fails the draft', async () => {
    const { outcome } = await check(verifierReply(PLAN, { unsupported: ['c-27'] }));
    expect(outcome.verifier.passed).toBe(false);
    expect(outcome.failures.every((failure) => failure.id === 'c-27' && failure.kind === 'label')).toBe(true);
  });

  it('ends the run when the verifier judges something that was not asked about', async () => {
    const made = stageContext(scratch);
    made.fake.script('verify', verifierReply(PLAN, { extra: { verdicts: [{ id: 's999', reason: 'x', missing: [], verdict: 'entailed' }] } }));
    await expect(runVerifier(made.ctx, GOLDEN_DRAFT, GOLDEN_CLAIMS)).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
    expect(made.logs).toEqual([]);
  });

  it('ends the run when the reply is not valid, is not JSON, or the model cannot be reached', async () => {
    const shapes: unknown[] = [{ verdicts: [] }, 'not json', new ModelError('transport', 'unreachable')];
    for (const shape of shapes) {
      const made = stageContext(scratch);
      made.fake.script('verify', shape);
      await expect(runVerifier(made.ctx, GOLDEN_DRAFT, GOLDEN_CLAIMS)).rejects.toBeInstanceOf(ModelError);
    }
  });

  it('judges a piece that cites another outlet, and tells the model which outlet', async () => {
    const tier2 = makeTier2Variant(cloneGolden());
    const plan = verifyPlanOf(tier2.draft, tier2.claims);
    const { outcome, fake } = await check(verifierReply(plan), tier2.draft, tier2.claims);
    expect(outcome.verifier.passed).toBe(true);
    expect(outsideBlocks(fake.calls[0]?.user ?? '')).toContain('Claim c-19 (basis: reported, status: unspecified, reported by Mercer Wire, another outlet):');
  });

  it('refuses a draft with nothing to judge: no fact, no analysis and no heading', async () => {
    const draft = structuredClone(GOLDEN_DRAFT) as Draft;
    draft.title = { kind: 'limitation', text: 'A title.', claimIds: ['c-1'], template: 'basis' };
    draft.description = { kind: 'limitation', text: 'A description.', claimIds: ['c-1'], template: 'status' };
    draft.opening = [];
    draft.takeaways = [];
    draft.sections = [];
    const made = stageContext(scratch);
    await expect(runVerifier(made.ctx, draft, GOLDEN_CLAIMS)).rejects.toThrow('runVerifier needs a draft with at least one fact sentence, analysis sentence or heading to judge');
    expect(made.fake.calls).toEqual([]);
  });
});

describe('lowerRejectedStatuses', () => {
  // The model check judges two labels of each claim against the passage. A status it does not find can be lowered to `unspecified`, which says nothing about how far the thing has
  // got, so the piece then says less and never more; a basis it does not find cannot, because there is no basis that says nothing. A status that was lowered and is rejected again in a later
  // round is not acted on: there is nothing lower to lower it to.
  const claimOf = (id: string) => GOLDEN_CLAIMS.find((claim) => claim.id === id)!;
  const outcomeOf = (options: Parameters<typeof verifierReply>[1]) => aggregateVerdicts(MODEL, PLAN, verifierReply(PLAN, options));

  it('changes nothing when no label was rejected: the same claims and the same outcome', () => {
    const outcome = outcomeOf({});
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcome);
    expect(result.lowered).toEqual([]);
    expect(result.claims).toBe(GOLDEN_CLAIMS);
    expect(result.outcome).toBe(outcome);
  });

  it('lowers the status of a claim whose status was rejected, in a copy, and keeps the reason the model check gave', () => {
    const before = structuredClone(GOLDEN_CLAIMS);
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({ unsupportedStatus: ['c-27'] }));
    expect(result.lowered).toEqual([{ claimId: 'c-27', from: 'demonstrated', to: 'unspecified', reason: 'the status "demonstrated" is not supported: The passage does not support the label.' }]);
    expect(result.claims.find((claim) => claim.id === 'c-27')?.status).toBe('unspecified');
    expect(result.claims.filter((claim) => claim.id !== 'c-27')).toEqual(GOLDEN_CLAIMS.filter((claim) => claim.id !== 'c-27'));
    expect(result.claims.map((claim) => claim.id)).toEqual(GOLDEN_CLAIMS.map((claim) => claim.id));
    // Nothing is changed in what it was given.
    expect(GOLDEN_CLAIMS).toEqual(before);
    expect(claimOf('c-27').status).toBe('demonstrated');
  });

  it('answers the failure: the check passes when nothing else failed, and says in its notes what was lowered, with no word that the model wrote', () => {
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({ unsupportedStatus: ['c-27'] }));
    expect(result.outcome.failures).toEqual([]);
    expect(result.outcome.verifier.passed).toBe(true);
    const facts = PLAN.sentences.filter((item) => item.kind === 'fact').length;
    expect(result.outcome.verifier.notes).toEqual([
      `Judged ${facts} fact sentences, ${PLAN.sentences.length - facts} analysis sentences and 3 headings against the passages they rely on, and the basis and the status of ${PLAN.claims.length} claims; every sentence, heading and basis was supported, and so was every status except the 1 lowered below.`,
      'claim c-27: the status "demonstrated" was lowered to "unspecified" because the model check did not find it in the passage.',
    ]);
  });

  it('lowers every status that was rejected, in the order of the claims, whatever the status was', () => {
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({ unsupportedStatus: ['c-28', 'c-5', 'c-20'] }));
    expect(result.lowered.map((entry) => [entry.claimId, entry.from, entry.to])).toEqual([
      ['c-5', 'planned', 'unspecified'],
      ['c-20', 'deployed', 'unspecified'],
      ['c-28', 'demonstrated', 'unspecified'],
    ]);
    expect(result.claims.filter((claim) => claim.status !== 'unspecified').map((claim) => claim.id)).toEqual(
      GOLDEN_CLAIMS.filter((claim) => claim.status !== 'unspecified' && !['c-5', 'c-20', 'c-28'].includes(claim.id)).map((claim) => claim.id),
    );
    expect(result.outcome.verifier.passed).toBe(true);
    expect(result.outcome.verifier.notes).toHaveLength(4);
    expect(result.outcome.verifier.notes[0]).toContain('and so was every status except the 3 lowered below.');
  });

  it('leaves the other failures as they were, with their notes, and adds the notes of what was lowered after them', () => {
    const outcome = outcomeOf({ verdicts: { s3: 'not_entailed' }, unsupportedStatus: ['c-27'] });
    expect(outcome.failures.map((failure) => failure.id)).toEqual(['s3', 'c-27']);
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcome);
    expect(result.outcome.failures).toEqual([outcome.failures[0]]);
    expect(result.outcome.verifier.passed).toBe(false);
    expect(result.outcome.verifier.notes).toEqual([outcome.verifier.notes[0], 'claim c-27: the status "demonstrated" was lowered to "unspecified" because the model check did not find it in the passage.']);
  });

  it('tells, after its own notes, the statuses that were lowered in the passes before it, which are the ones a published piece carries on its receipts page', () => {
    const earlier = [{ claimId: 'c-5', from: 'planned' as const, to: 'unspecified' as const, reason: 'x' }];
    const quiet = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({}), earlier);
    expect(quiet.lowered).toEqual([]);
    expect(quiet.claims).toBe(GOLDEN_CLAIMS);
    expect(quiet.outcome.verifier.passed).toBe(true);
    expect(quiet.outcome.verifier.notes).toHaveLength(2);
    // The last pass counts the status that an earlier pass lowered among those it did not take as they were, as it tells it in its notes.
    expect(quiet.outcome.verifier.notes[0]).toMatch(/; every sentence, heading and basis was supported, and so was every status except the 1 lowered below\.$/);
    expect(quiet.outcome.verifier.notes[1]).toBe('claim c-5: the status "planned" was lowered to "unspecified" because the model check did not find it in the passage.');
    const both = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({ unsupportedStatus: ['c-27'] }), earlier);
    expect(both.outcome.verifier.notes[0]).toMatch(/except the 2 lowered below\.$/);
    expect(both.outcome.verifier.notes.slice(1)).toEqual([
      'claim c-5: the status "planned" was lowered to "unspecified" because the model check did not find it in the passage.',
      'claim c-27: the status "demonstrated" was lowered to "unspecified" because the model check did not find it in the passage.',
    ]);
    const failing = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({ verdicts: { s3: 'not_entailed' } }), earlier);
    expect(failing.outcome.verifier.passed).toBe(false);
    expect(failing.outcome.verifier.notes).toHaveLength(2);
  });

  it('sets aside the rejection of a status that an earlier pass lowered: no new lowering, no new note, the failure removed, and the claims as they are', () => {
    const earlier = [{ claimId: 'c-27', from: 'demonstrated' as const, to: 'unspecified' as const, reason: 'x' }];
    const lowered = GOLDEN_CLAIMS.map((claim) => (claim.id === 'c-27' ? { ...claim, status: 'unspecified' as const } : claim));
    const outcome = outcomeOf({ unsupportedStatus: ['c-27'] });
    expect(outcome.failures).toMatchObject([{ id: 'c-27', field: 'status' }]);
    const result = lowerRejectedStatuses(PLAN, lowered, outcome, earlier);
    expect(result.lowered).toEqual([]);
    expect(result.repeated).toEqual(['c-27']);
    expect(result.claims).toBe(lowered);
    expect(result.outcome.failures).toEqual([]);
    expect(result.outcome.verifier.passed).toBe(true);
    expect(result.outcome.verifier.notes).toHaveLength(2);
    expect(result.outcome.verifier.notes[1]).toBe('claim c-27: the status "demonstrated" was lowered to "unspecified" because the model check did not find it in the passage.');
    // A claim that Extract itself gave as unspecified is another thing: it was never lowered, and its rejected status stays a failure.
    const given = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcomeOf({ unsupportedStatus: ['c-8'] }), earlier);
    expect(given.repeated).toEqual([]);
    expect(given.outcome.failures).toMatchObject([{ id: 'c-8', field: 'status' }]);
    // And the basis of the claim that was lowered is still judged.
    const basis = lowerRejectedStatuses(PLAN, lowered, outcomeOf({ unsupported: ['c-27'] }), earlier);
    expect(basis.repeated).toEqual(['c-27']);
    expect(basis.outcome.failures).toMatchObject([{ id: 'c-27', field: 'basis' }]);
    expect(basis.outcome.verifier.passed).toBe(false);
  });

  it('does not lower the status of a claim whose basis was rejected: the basis failure stays, and so does the check failing', () => {
    const outcome = outcomeOf({ unsupportedBasis: ['c-27'] });
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcome);
    expect(result.lowered).toEqual([]);
    expect(result.claims).toBe(GOLDEN_CLAIMS);
    expect(result.outcome).toBe(outcome);
    expect(result.outcome.failures).toMatchObject([{ id: 'c-27', field: 'basis' }]);
  });

  it('lowers the status of a claim whose basis was rejected too, and leaves the basis failure, so the check still fails', () => {
    const outcome = outcomeOf({ unsupported: ['c-27'] });
    expect(outcome.failures.map((failure) => failure.field)).toEqual(['basis', 'status']);
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcome);
    expect(result.lowered.map((entry) => entry.claimId)).toEqual(['c-27']);
    expect(result.claims.find((claim) => claim.id === 'c-27')).toMatchObject({ basis: 'demo', status: 'unspecified' });
    expect(result.outcome.failures).toMatchObject([{ id: 'c-27', kind: 'label', code: 'unsupported', field: 'basis' }]);
    expect(result.outcome.verifier.passed).toBe(false);
  });

  it('does not lower a status that is already unspecified: that failure stays a failure', () => {
    const outcome = outcomeOf({ unsupportedStatus: ['c-8'] });
    expect(outcome.failures).toMatchObject([{ id: 'c-8', field: 'status' }]);
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcome);
    expect(result.lowered).toEqual([]);
    expect(result.claims).toBe(GOLDEN_CLAIMS);
    expect(result.outcome).toBe(outcome);
  });

  it('does not lower a status for a label that the model check gave no verdict on, because nothing was rejected', () => {
    const outcome = outcomeOf({ omit: ['c-27'] });
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS, outcome);
    expect(result.lowered).toEqual([]);
    expect(result.outcome).toBe(outcome);
  });

  it('does not lower the status of a claim it does not have', () => {
    const outcome = outcomeOf({ unsupportedStatus: ['c-27'] });
    const result = lowerRejectedStatuses(PLAN, GOLDEN_CLAIMS.filter((claim) => claim.id !== 'c-27'), outcome);
    expect(result.lowered).toEqual([]);
    expect(result.outcome).toBe(outcome);
  });
});
