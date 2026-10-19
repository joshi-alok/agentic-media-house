import { existsSync } from 'node:fs';
import { ALL_FAILURE_CODES, DEFAULT_NAME_ALLOW_LIST, HOLD_REASONS, defaultConfig as gateDefaults } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { ModelError } from '../../src/model/types';
import { UNTRUSTED_PREAMBLE } from '../../src/prompts/untrusted';
import { buildComposeUser, composeSystem } from '../../src/prompts/compose';
import { COMPOSE_EFFORT, COMPOSE_MAX_OUTPUT_TOKENS, gateContextOf, runCompose } from '../../src/stages/compose';
import { ComposeReply, assembleDraft } from '../../src/stages/draft-assembly';
import type { StageContext } from '../../src/stages/context';
import { stageContext, useScratch } from '../support/context';
import { RUN_DATE } from '../support/candidates';
import { blocksOf, outsideBlocks } from '../support/prompts';
import { replyFromDraft } from '../support/script';

// Compose writes the piece, and the gate is the first judge of it. These tests give the stage a fake model that answers from a script.
// The script is the golden piece of the gate, which the gate clears, and then, one rule at a time, a piece that breaks the rule: the
// stage must hand the gate's verdict on, with the gate's own code for what is wrong, and must never turn a draft that breaks a rule into one
// that does not.

const scratch = useScratch();

/** A stage whose model will say `reply` for the compose role, run on `claims`. */
async function compose(reply: unknown, claims: Claim[] = GOLDEN_CLAIMS, overrides: Partial<StageContext> = {}) {
  const made = stageContext(scratch, overrides);
  made.fake.script('compose', reply);
  return { ...made, result: await runCompose(made.ctx, claims) };
}

type Reply = ReturnType<typeof replyFromDraft>;

/** The codes that the gate found in the draft that the script wrote, and its route. */
async function verdictOn(change: (reply: Reply) => void, claims: Claim[] = GOLDEN_CLAIMS, base: Reply = replyFromDraft(), overrides: Partial<StageContext> = {}) {
  const reply = structuredClone(base);
  change(reply);
  const { result } = await compose(reply, claims, overrides);
  return { codes: [...new Set(result.gate.failures.map((failure) => failure.code))], route: result.gate.route, holds: result.gate.holdReasons };
}

describe('runCompose: the golden piece', () => {
  it('reaches the route publish, with no failure and no hold reason', async () => {
    const { result } = await compose(replyFromDraft());
    expect(result.gate.failures).toEqual([]);
    expect(result.gate.holdReasons).toEqual([]);
    expect(result.gate.route).toBe('publish');
    expect(Object.values(result.gate.checks)).toEqual(Array(9).fill('pass'));
  });

  it('hands on the draft that assembleDraft makes of the reply, with the slug, the date and the author written by code', async () => {
    const { result, ctx } = await compose(replyFromDraft());
    expect(result.draft).toEqual(assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx));
    expect(result.draft.slug).toBe('fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant');
    expect(result.draft.publishedAt).toBe(RUN_DATE);
    expect(result.draft.limitations).toEqual(GOLDEN_DRAFT.limitations);
  });

  it('reaches the route hold, and only for the attribution, when a claim of another outlet is reported in an attributed sentence', async () => {
    const tier2 = makeTier2Variant(cloneGolden());
    const { result } = await compose(replyFromDraft(tier2.draft), tier2.claims);
    expect(result.gate.failures).toEqual([]);
    expect(result.gate.holdReasons).toEqual([HOLD_REASONS[0]]);
    expect(result.gate.route).toBe('hold');
  });

  it('asks one model, once, in the role compose, with the model of the configuration and the claims, and nothing else', async () => {
    const { fake, ctx } = await compose(replyFromDraft());
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(Object.keys(call ?? {}).sort()).toEqual(['effort', 'maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    expect(call?.role).toBe('compose');
    expect(call?.model).toBe(ctx.config.models.compose);
    expect(call?.maxOutputTokens).toBe(COMPOSE_MAX_OUTPUT_TOKENS);
    expect(call?.effort).toBe(COMPOSE_EFFORT);
    expect(COMPOSE_EFFORT).toBe('low');
    expect(call?.schema).toBe(ComposeReply);
    expect(call?.system).toBe(composeSystem());
    expect(call?.system.startsWith(UNTRUSTED_PREAMBLE)).toBe(true);
    expect(call?.user).toBe(buildComposeUser(GOLDEN_CLAIMS, RUN_DATE));
  });

  it('shows the model the text of a claim only inside a block', async () => {
    const { fake } = await compose(replyFromDraft());
    const user = fake.calls[0]?.user ?? '';
    expect(blocksOf(user)).toHaveLength(GOLDEN_CLAIMS.length);
    for (const claim of GOLDEN_CLAIMS) expect(outsideBlocks(user)).not.toContain(claim.span.quote);
  });

  it('writes no artifact: Verify writes the drafts of every round', async () => {
    const { ctx } = await compose(replyFromDraft());
    expect(existsSync(ctx.runDir)).toBe(false);
  });

  it('logs what the gate said', async () => {
    const { logs } = await compose(replyFromDraft());
    expect(logs).toEqual(['compose: the gate says publish (0 failures, 0 hold reasons)']);
  });
});

describe('runCompose: a script that breaks a rule is caught, with the gate\'s own code', () => {
  // One row for each rule that the prompt states. `change` makes the golden reply break the rule, and `code` is the code of the check
  // that must catch it. Several rules can fail at once when a sentence is changed; the row asks only that its own code is there.
  const section = (reply: Reply, index: number) => reply.sections[index] as Reply['sections'][number];

  const ROWS: [string, (reply: Reply) => void, string][] = [
    ['every fact sentence cites a claim', (reply) => { (reply.opening[1] as { claimIds: string[] }).claimIds = []; }, 'G3_NO_CLAIM'],
    ['a sentence cites a claim that exists', (reply) => { (reply.takeaways[0] as { claimIds: string[] }).claimIds = ['c-99']; }, 'G3_UNKNOWN_CLAIM'],
    ['a number must be a value of a cited claim', (reply) => { reply.takeaways[1] = { kind: 'fact', text: 'The datasheet lists a 15 kg rated payload and a 1.4 m maximum reach.', claimIds: ['c-8', 'c-9'] }; }, 'G4_NUMBER_UNSUPPORTED'],
    ['a number written in words is checked as a number', (reply) => { reply.takeaways[1] = { kind: 'fact', text: 'The datasheet lists a twenty kilograms rated payload and a 1.4 m maximum reach.', claimIds: ['c-8', 'c-9'] }; }, 'G4_NUMBER_UNSUPPORTED'],
    ['a date must be a value of a cited claim', (reply) => { reply.takeaways[0] = { kind: 'fact', text: 'Tarnmoor is the second Brindle Logistics plant to receive FX-1 arms, from 3 October 2026.', claimIds: ['c-1'] }; }, 'G4_DATE_UNSUPPORTED'],
    ['a name must be a value of a cited claim', (reply) => { reply.takeaways[0] = { kind: 'fact', text: 'Tarnmoor is the second Harlow plant to receive FX-1 arms.', claimIds: ['c-1'] }; }, 'G4_NAME_UNSUPPORTED'],
    ['a made-up name at the start of a sentence is not accepted', (reply) => { reply.takeaways[0] = { kind: 'fact', text: 'Harlow Logistics plans a plant at Tarnmoor.', claimIds: ['c-1'] }; }, 'G4_INITIAL_WORD_UNSUPPORTED'],
    ['digits, never half, twice or double', (reply) => { reply.description = { kind: 'fact', text: 'Fixture Robotics has begun shipping the FX-1 arm, rated for half a tonne, to a second Brindle Logistics plant.', claimIds: ['c-1', 'c-8'] }; }, 'G4_NUMBER_WORD_UNCHECKABLE'],
    ['every sentence starts with a capital letter or a digit', (reply) => { (reply.opening[0] as { text: string }).text = `f${(reply.opening[0] as { text: string }).text.slice(1)}`; }, 'G2_SENTENCE_START'],
    ['a quotation is word for word in a cited claim', (reply) => { reply.takeaways[2] = { kind: 'fact', text: 'Brindle Logistics said "we saved a fortune" at Ashvale.', claimIds: ['c-20'] }; }, 'G5_QUOTE_NOT_VERBATIM'],
    ['a heading has no number', (reply) => { section(reply, 0).heading = 'What shipped in 2026'; }, 'G4_HEADING_NUMBER'],
    ['a heading has no quotation', (reply) => { section(reply, 0).heading = 'What "shipped"'; }, 'G4_HEADING_QUOTE'],
    ['a heading is lowercase except the words of the claims of its section', (reply) => { section(reply, 0).heading = 'What Shipped'; }, 'G4_HEADING_NAME'],
    ['a heading names nobody that its claims do not', (reply) => { section(reply, 0).heading = 'What Harlow shipped'; }, 'G4_HEADING_NAME'],
    ['a heading is a statement, not a question', (reply) => { section(reply, 0).heading = 'What shipped?'; }, 'G2_HEADING_QUESTION'],
    ['a heading is short', (reply) => { section(reply, 0).heading = `What shipped${' and so on'.repeat(10)}`; }, 'G2_HEADING_TOO_LONG'],
    ['a section has a heading', (reply) => { section(reply, 0).heading = ''; }, 'G2_HEADING_EMPTY'],
    ['analysis is never in the opening', (reply) => { reply.opening[1] = { kind: 'analysis', text: 'The first site, at Ashvale, now runs 40 of the arms, and a third site is planned.', claimIds: ['c-23', 'c-26'] }; }, 'G7_ANALYSIS_PLACEMENT'],
    ['analysis is never in the title', (reply) => { reply.title = { kind: 'analysis', text: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant', claimIds: ['c-1'] }; }, 'G7_ANALYSIS_PLACEMENT'],
    ['analysis is at most a fifth of the sentences', (reply) => {
      for (const index of [0, 2]) section(reply, index).paragraphs = section(reply, index).paragraphs.map((paragraph) => paragraph.map((sentence) => ({ kind: 'analysis' as const, text: sentence.text, claimIds: sentence.claimIds })));
    }, 'G7_ANALYSIS_SHARE'],
    ['analysis introduces no number that no fact has', (reply) => { section(reply, 2).paragraphs[1]?.push({ kind: 'analysis', text: 'The rollout may reach 5000 plants.', claimIds: ['c-6'] }); }, 'G7_ANALYSIS_NEW_VALUE'],
    ['the opening is as long as the gate says', (reply) => { reply.opening = reply.opening.slice(0, 1); }, 'G2_OPENING_LENGTH'],
    ['there are as many takeaways as the gate says', (reply) => { reply.takeaways = reply.takeaways.slice(0, 2); }, 'G2_TAKEAWAYS_COUNT'],
    ['there are at least two sections', (reply) => { reply.sections = reply.sections.slice(0, 1); }, 'G2_SECTIONS_MIN'],
    ['the piece is as long as the gate says', (reply) => { for (const item of reply.sections) item.paragraphs = item.paragraphs.slice(0, 1); }, 'G2_BODY_LENGTH'],
    ['the description is short', (reply) => { reply.description = { kind: 'fact', text: `Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor${', and more'.repeat(10)}.`, claimIds: ['c-1', 'c-8'] }; }, 'G1_DESCRIPTION_TOO_LONG'],
    ['a piece has a category', (reply) => { reply.categories = []; }, 'G1_CATEGORY_COUNT'],
    ['funding comes with a beat', (reply) => { reply.categories = ['funding']; }, 'G1_CATEGORY_NO_BEAT'],
    ['no banned phrase', (reply) => { reply.description = { kind: 'fact', text: 'Fixture Robotics has begun shipping the groundbreaking FX-1 arm, rated for 12 kg, to a second plant.', claimIds: ['c-1', 'c-8'] }; }, 'G9_BANNED_PHRASE'],
  ];

  it.each(ROWS)('catches a script that breaks the rule: %s', async (_rule, change, code) => {
    expect(ALL_FAILURE_CODES).toContain(code);
    const verdict = await verdictOn(change);
    expect(verdict.codes).toContain(code);
    expect(verdict.route).toBe('revise');
  });

  it('catches a claim of another outlet that is stated as plain fact, and one that is used in analysis', async () => {
    const tier2 = makeTier2Variant(cloneGolden());
    const base = replyFromDraft(tier2.draft);
    const reported = (reply: Reply) => reply.sections.flatMap((item) => item.paragraphs.flat()).find((sentence) => sentence.claimIds.includes('c-19')) as Reply['title'];
    const plain = await verdictOn((reply) => { const sentence = reported(reply); sentence.text = 'It lists 7 investors in the round.'; delete (sentence as { attributed?: boolean }).attributed; }, tier2.claims, base);
    expect(plain.codes).toEqual(['G6_TIER2_UNATTRIBUTED']);
    expect(plain.route).toBe('revise');
    const analysis = await verdictOn((reply) => { const sentence = reported(reply); Object.assign(sentence, { kind: 'analysis' }); delete (sentence as { attributed?: boolean }).attributed; }, tier2.claims, base);
    expect(analysis.codes).toContain('G6_TIER2_IN_ANALYSIS');
    expect(analysis.route).toBe('revise');
  });

  it('catches a title that tells the story of one published within the last 14 days (the 14th day counts), and ignores one that is older', async () => {
    const published = (publishedAt: string) => ({ published: { slugs: [], titles: [{ title: GOLDEN_DRAFT.title.text, publishedAt }], sourceUrls: [] } });
    expect((await verdictOn(() => undefined, GOLDEN_CLAIMS, replyFromDraft(), published('2026-10-04'))).codes).toEqual(['G9_TITLE_DUPLICATE']);
    expect((await verdictOn(() => undefined, GOLDEN_CLAIMS, replyFromDraft(), published('2026-09-20'))).route).toBe('publish');
    expect((await verdictOn(() => undefined, GOLDEN_CLAIMS, replyFromDraft(), published('2026-09-21'))).codes).toEqual(['G9_TITLE_DUPLICATE']);
  });

  it('picks a slug that is not published, so that the slug of a piece never collides', async () => {
    const slug = 'fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant';
    const { result } = await compose(replyFromDraft(), GOLDEN_CLAIMS, { published: { slugs: [slug], titles: [], sourceUrls: [] } });
    expect(result.draft.slug).toBe(`${slug}-2026`);
    expect(result.gate.route).toBe('publish');
  });

  it('never turns a draft that breaks a rule into one that does not: every row above is one failure at least', async () => {
    for (const [, change] of ROWS) {
      const reply = structuredClone(replyFromDraft());
      change(reply);
      const { result } = await compose(reply);
      expect(result.gate.failures.length).toBeGreaterThan(0);
      expect(result.gate.route).not.toBe('publish');
    }
  });
});

describe('runCompose: a reply that is not valid ends the run', () => {
  it.each([
    ['a limitations list, which only code writes', (reply: Reply) => Object.assign(reply, { limitations: [] })],
    ['an author', (reply: Reply) => Object.assign(reply, { author: { name: 'Someone Else' } })],
    ['a slug', (reply: Reply) => Object.assign(reply, { slug: 'my-own-slug' })],
    ['a category that is not in the vocabulary', (reply: Reply) => Object.assign(reply, { categories: ['gadgets'] })],
    ['a sentence of the kind limitation', (reply: Reply) => { reply.opening.push({ kind: 'limitation', text: 'x', claimIds: ['c-1'], template: 'basis' } as never); }],
  ])('fails with a schema error for %s', async (_what, change) => {
    const reply = structuredClone(replyFromDraft());
    change(reply);
    const made = stageContext(scratch);
    made.fake.script('compose', reply);
    await expect(runCompose(made.ctx, GOLDEN_CLAIMS)).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
    expect(made.logs).toEqual([]);
  });

  it('fails when the reply is not JSON, and when the model cannot be reached', async () => {
    const first = stageContext(scratch);
    first.fake.script('compose', 'not json at all');
    await expect(runCompose(first.ctx, GOLDEN_CLAIMS)).rejects.toMatchObject({ kind: 'schema' });
    const second = stageContext(scratch);
    second.fake.script('compose', new ModelError('transport', 'unreachable'));
    await expect(runCompose(second.ctx, GOLDEN_CLAIMS)).rejects.toMatchObject({ kind: 'transport' });
  });

  it('fails when the title has no slug, or the date of the run is not a day, and asks nothing when there are no claims', async () => {
    const reply = structuredClone(replyFromDraft());
    reply.title = { kind: 'fact', text: '???', claimIds: ['c-1'] };
    const first = stageContext(scratch);
    first.fake.script('compose', reply);
    await expect(runCompose(first.ctx, GOLDEN_CLAIMS)).rejects.toThrow('has no letter or digit');
    const second = stageContext(scratch, { date: '2026-02-30' });
    second.fake.script('compose', replyFromDraft());
    await expect(runCompose(second.ctx, GOLDEN_CLAIMS)).rejects.toThrow('is not a real date');
    const third = stageContext(scratch);
    await expect(runCompose(third.ctx, [])).rejects.toThrow('runCompose needs claims');
    expect(third.fake.calls).toEqual([]);
  });
});

describe('gateContextOf', () => {
  it('gives the gate the slugs and the titles that are published, and its own defaults for the rest', () => {
    const published = { slugs: ['a-slug', 'b-slug'], titles: [{ title: 'A title', publishedAt: '2026-10-01' }], sourceUrls: ['https://x.example/a'] };
    const gate = gateContextOf({ published });
    expect([...gate.publishedSlugs]).toEqual(['a-slug', 'b-slug']);
    expect(gate.recentTitles).toEqual(published.titles);
    expect(gate.config).toEqual(gateDefaults());
    expect([...gate.nameAllowList].sort()).toEqual([...DEFAULT_NAME_ALLOW_LIST].sort());
  });
});
