import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ALL_FAILURE_CODES, HOLD_REASONS, VERIFIER_REASONS, allSentences, citedClaims } from '@robywire/gate';
import type { Claim } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, TIER2_OUTLET } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import { defaultConfig } from '../../src/config';
import { HeldArtifact } from '../../src/run/artifacts';
import { readDeskState } from '../../src/run/desk-state';
import { FakeGit } from '../../src/run/git';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { holdReasonsOf, runHold } from '../../src/stages/hold';
import type { VerifyResult } from '../../src/stages/verify';
import { verifyPlanOf } from '../../src/stages/verify-model';
import { stageContext, useScratch } from '../support/context';
import { INVENTED, verdicts } from '../support/held';
import { replyFromDraft } from '../support/script';
import { COMMITTED_STATE, filesBelow, makeSite } from '../support/site';
import { verifierReply } from '../support/verifier';

// A hold is the Desk saying "not by myself": the draft, why, and everything the owner needs to look at it later are kept in the folder of the run,
// the desk state says that a draft was held and for which reasons, and nothing reaches the pages of the site. These tests get the verdicts that
// they hold from the real Compose and Verify stages, run on scripts of a composer and a verifier that go wrong in each of the ways that a hold is for.

const scratch = useScratch();
const RUN = { runId: '2026-10-05-043100', at: '2026-10-05T04:31:00.000Z' };
const STATE = sitePaths().stateFile;

const { verdictOn, tier2 } = verdicts(scratch);

function setup() {
  const made = stageContext(scratch);
  const repoDir = makeSite(scratch());
  const git = new FakeGit();
  return { ...made, repoDir, git, target: new SiteTarget(repoDir, git) };
}

const heldFile = (runDir: string, slug: string): string => path.join(runDir, 'held', `${slug}.json`);

describe('holdReasonsOf', () => {
  it('is the codes of the gate failures, then the hold reasons of the gate, then the reasons of the model check, each once and in order', async () => {
    const { verified } = await tier2();
    const base: Pick<VerifyResult, 'gate' | 'verifier' | 'history'> = { gate: verified.gate, verifier: verified.verifier, history: verified.history };
    const failure = (code: 'not_entailed' | 'ambiguous' | 'unsupported' | 'missing') => ({ id: 's1', kind: 'sentence' as const, code, reason: 'x' });
    // The gate asks for no hold any more, so the one hold reason it can still give (a verdict recorded before 2026-10-20 may have it) is put in by hand, to see where it goes.
    const gate = {
      ...base.gate,
      holdReasons: [HOLD_REASONS[0]],
      failures: [
        { check: 'G4' as const, code: 'G4_NUMBER_UNSUPPORTED', message: 'm', where: 'w' },
        { check: 'G2' as const, code: 'G2_BODY_LENGTH', message: 'm' },
        { check: 'G4' as const, code: 'G4_NUMBER_UNSUPPORTED', message: 'again', where: 'x' },
      ],
    };
    const history = [{ ...(base.history[0] as VerifyResult['history'][number]), verifierFailures: [failure('ambiguous'), failure('not_entailed'), failure('ambiguous')] }];
    expect(holdReasonsOf({ ...base, gate, history })).toEqual(['G4_NUMBER_UNSUPPORTED', 'G2_BODY_LENGTH', 'TIER2_ATTRIBUTION', 'G10_AMBIGUOUS', 'G10_NOT_ENTAILED']);
  });

  it('names each failure of the model check by one of the reasons of the gate package: not entailed, ambiguous, a label that is not supported, and no verdict', () => {
    const { verifier } = { verifier: { model: 'm', passed: false, notes: ['n'] } };
    const gate = { route: 'publish' as const, failures: [], warnings: [], holdReasons: [], checks: {} as VerifyResult['gate']['checks'] };
    const pass = (code: 'not_entailed' | 'ambiguous' | 'unsupported' | 'missing') => [{ round: 0, gate, verifier, verifierFailures: [{ id: 'c-1', kind: 'label' as const, code, reason: 'x' }], sent: [] }];
    expect(holdReasonsOf({ gate, verifier, history: pass('not_entailed') })).toEqual(['G10_NOT_ENTAILED']);
    expect(holdReasonsOf({ gate, verifier, history: pass('ambiguous') })).toEqual(['G10_AMBIGUOUS']);
    expect(holdReasonsOf({ gate, verifier, history: pass('unsupported') })).toEqual(['G10_LABEL_UNSUPPORTED']);
    expect(holdReasonsOf({ gate, verifier, history: pass('missing') })).toEqual(['G10_NOT_JUDGED']);
  });

  it('reads only the last pass: what the model check said of an earlier draft is not why the last one is held', async () => {
    const { verified } = await tier2();
    const earlier = { round: 0, gate: verified.gate, verifier: verified.verifier, verifierFailures: [{ id: 's1', kind: 'sentence' as const, code: 'not_entailed' as const, reason: 'x' }], sent: ['s1'] };
    const last = { ...earlier, round: 1, verifierFailures: [{ id: 's2', kind: 'sentence' as const, code: 'ambiguous' as const, reason: 'y' }], sent: ['s2'] };
    expect(holdReasonsOf({ gate: verified.gate, verifier: verified.verifier, history: [earlier, last] })).toEqual(['G10_AMBIGUOUS']);
    expect(holdReasonsOf({ gate: verified.gate, verifier: verified.verifier, history: [last, { ...last, round: 2, verifierFailures: [] }] })).toEqual([]);
  });

  it('has a reason for a hold made of gate failures alone, and is empty only for a piece that nothing holds', async () => {
    const { verified } = await verdictOn({ reply: { ...replyFromDraft(), takeaways: [INVENTED(15), ...replyFromDraft().takeaways.slice(1)] }, revisions: [{ replacements: [] }, { replacements: [] }] });
    expect(holdReasonsOf(verified)).toEqual(['G4_NUMBER_UNSUPPORTED']);
    const clean = await verdictOn({ verifier: (plan) => [verifierReply(plan)] });
    expect(holdReasonsOf(clean.verified)).toEqual([]);
  });
});

describe('every reason of a hold is a real code, and the holds page of the site can explain it', () => {
  it('has the codes of the gate, the hold reasons of the gate and the reasons of the model check, and a label on the site for each', () => {
    const real = new Set<string>([...ALL_FAILURE_CODES, ...HOLD_REASONS, ...VERIFIER_REASONS]);
    expect(real.has('G4_NUMBER_UNSUPPORTED') && real.has('TIER2_ATTRIBUTION') && real.has('G10_NOT_ENTAILED')).toBe(true);
    for (const code of real) expect(Object.hasOwn(REASON_LABELS, code), code).toBe(true);
  });
});

describe('runHold: a piece that cites another outlet, which the gate clears and the model check holds', () => {
  it('writes the held draft into the folder of the run, whole enough for the owner to read it and to release it', async () => {
    const { ctx, claims, verified } = await tier2();
    const { target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.file).toBe(heldFile(ctx.runDir, verified.draft.slug));
    const held = HeldArtifact.parse(JSON.parse(readFileSync(result.file, 'utf8')));
    expect(held).toEqual({
      date: ctx.date,
      slug: verified.draft.slug,
      runId: RUN.runId,
      reasons: ['G10_NOT_ENTAILED'],
      draft: verified.draft,
      claims: citedClaims(verified.draft, claims),
      rounds: defaultConfig().maxRevisionRounds + defaultConfig().modelCheckRevisions,
      gate: verified.gate,
      verifier: verified.verifier,
      history: verified.history,
    });
    // The gate cleared the draft and asks for no hold; the model check did not pass it. What the owner reads is the piece that rests on another outlet.
    expect(held.gate.route).toBe('publish');
    expect(held.gate.holdReasons).toEqual([]);
    expect(held.verifier.passed).toBe(false);
    expect(held.claims.find((claim) => claim.id === 'c-19')?.source).toMatchObject({ tier: 2, outlet: TIER2_OUTLET });
    expect(allSentences(held.draft).some((item) => item.sentence.kind === 'fact' && item.sentence.attributed === true && item.sentence.text.startsWith(TIER2_OUTLET))).toBe(true);
  });

  it('adds the hold to the desk state with the reasons and the categories of the piece, and records the run as held', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.reasons).toEqual(['G10_NOT_ENTAILED']);
    expect(await readDeskState(path.join(repoDir, STATE))).toEqual({
      lastRun: { at: RUN.at, outcome: 'held', runId: RUN.runId, slug: verified.draft.slug },
      holds: [{ at: RUN.at, categories: verified.draft.categories, reasons: ['G10_NOT_ENTAILED'], slug: verified.draft.slug }],
      corrections: [],
    });
  });

  it('remembers the slug of the piece and the address of the story with the hold, so that the next run does not choose the story again while the pull request is open', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, target } = setup();
    await runHold(ctx, target, claims, verified, { ...RUN, sourceUrl: 'https://mercer-wire.example/robotics/a-story' });
    expect((await readDeskState(path.join(repoDir, STATE))).holds).toEqual([
      { at: RUN.at, categories: verified.draft.categories, reasons: ['G10_NOT_ENTAILED'], slug: verified.draft.slug, sourceUrl: 'https://mercer-wire.example/robotics/a-story' },
    ]);
  });

  it('keeps the holds of earlier runs, and adds this one after them', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, target } = setup();
    await runHold(ctx, target, claims, verified, RUN);
    await runHold(ctx, target, claims, verified, { runId: 'second', at: '2026-10-06T04:31:00.000Z' });
    const holds = (await readDeskState(path.join(repoDir, STATE))).holds;
    expect(holds.map((hold) => hold.at)).toEqual([RUN.at, '2026-10-06T04:31:00.000Z']);
  });

  it('lets nothing reach the pages of the site: no piece, no ledger, and one commit that holds the desk state alone', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, git, target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(filesBelow(path.join(repoDir, 'site/src/content'))).toEqual(['ledger/.gitkeep', 'news/.gitkeep']);
    expect(git.commits).toEqual([{ id: result.commit, paths: [STATE], message: `desk: hold ${verified.draft.slug}` }]);
    expect(result.files).toEqual([STATE]);
  });

  it('logs the hold with its reasons', async () => {
    const { ctx, logs, claims, verified } = await tier2();
    const { target } = setup();
    await runHold(ctx, target, claims, verified, RUN);
    expect(logs.at(-1)).toMatch(new RegExp(`^hold: ${verified.draft.slug} is held for G10_NOT_ENTAILED, written to .*held`));
  });
});

describe('runHold: a draft that the gate or the model check did not clear', () => {
  it('records the codes of the failures that were never mended, and the held file has every pass', async () => {
    const reply = replyFromDraft();
    reply.takeaways[1] = INVENTED(15);
    const { ctx, claims, verified } = await verdictOn({ reply, revisions: [{ replacements: [] }, { replacements: [] }] });
    expect(verified.outcome).toBe('hold');
    expect(verified.rounds).toBe(2);
    const { repoDir, target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.reasons).toEqual(['G4_NUMBER_UNSUPPORTED']);
    const held = HeldArtifact.parse(JSON.parse(readFileSync(result.file, 'utf8')));
    expect(held.history.map((pass) => pass.round)).toEqual([0, 1, 2]);
    expect(held.rounds).toBe(2);
    expect((await readDeskState(path.join(repoDir, STATE))).holds[0]?.reasons).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('records the verdicts of the model check as reasons of the gate package', async () => {
    const plan = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    const sentence = plan.sentences[3]?.id as string;
    const claim = plan.claims[0]?.id as string;
    const { ctx, claims, verified } = await verdictOn({
      revisions: [{ replacements: [] }, { replacements: [] }, { replacements: [] }],
      verifier: () => [0, 1, 2, 3].map(() => verifierReply(plan, { verdicts: { [sentence]: 'ambiguous' }, unsupported: [claim], omit: [plan.sentences[5]?.id as string] })),
    });
    const { target } = setup();
    const result = await runHold(ctx, target, claims, verified, RUN);
    expect(result.reasons).toEqual(['G10_AMBIGUOUS', 'G10_NOT_JUDGED', 'G10_LABEL_UNSUPPORTED']);
  });
});

describe('runHold: a dry run', () => {
  it('writes the held draft, which is part of the record of the run, and nothing in the site', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir } = setup();
    const before = filesBelow(repoDir);
    const result = await runHold(ctx, new DryTarget(repoDir), claims, verified, RUN);
    expect(existsSync(result.file)).toBe(true);
    expect(filesBelow(repoDir)).toEqual(before);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(result.commit).toBeNull();
  });
});

describe('runHold: what it refuses', () => {
  it('does not hold a piece that Verify cleared', async () => {
    const { ctx, claims, verified } = await verdictOn({ verifier: (plan) => [verifierReply(plan)] });
    expect(verified.outcome).toBe('publish');
    const { target } = setup();
    await expect(runHold(ctx, target, claims, verified, RUN)).rejects.toThrow('runHold needs a piece that Verify held');
    expect(existsSync(path.join(ctx.runDir, 'held'))).toBe(false);
  });

  it('does not hold a piece for no reason: a hold that says nothing is not one the owner can read', async () => {
    const { ctx, claims, verified } = await verdictOn({ verifier: (plan) => [verifierReply(plan)] });
    const { target, git } = setup();
    await expect(runHold(ctx, target, claims, { ...verified, outcome: 'hold' }, RUN)).rejects.toThrow('has no reason');
    expect(git.commits).toEqual([]);
  });

  it('does not write the held draft under a slug that is not a plain slug, because the slug is a file name', async () => {
    const { ctx, claims, verified } = await tier2();
    const { target } = setup();
    const odd = { ...verified, draft: { ...verified.draft, slug: '../outside' } };
    await expect(runHold(ctx, target, claims, odd, RUN)).rejects.toThrow('"../outside" is not a plain slug');
    expect(existsSync(path.join(ctx.runDir, 'outside.json'))).toBe(false);
  });

  it('keeps the held draft even when the desk state cannot be changed: the draft is never lost to a refusal', async () => {
    const { ctx, claims, verified } = await tier2();
    const { repoDir, git, target } = setup();
    git.dirty.add(STATE);
    await expect(runHold(ctx, target, claims, verified, RUN)).rejects.toThrow('has changes that are not committed');
    expect(existsSync(heldFile(ctx.runDir, verified.draft.slug))).toBe(true);
    expect(readFileSync(path.join(repoDir, STATE), 'utf8')).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
  });
});
