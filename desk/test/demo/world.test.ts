import { allSentences, defaultContext, runGate } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, DEMO_SELECT_REASON, clearingVerifier, demoClient } from '../../src/demo/story';
import { DEMO_DATE, DEMO_FIXTURE_DIR, DEMO_URLS, demoFetcher, demoRegistry, demoWorldMap } from '../../src/demo/world';
import { FetchError } from '../../src/fetch/http';
import { sourceKind } from '../../src/sources';
import { buildVerifyUser } from '../../src/prompts/verify';
import { runCompose } from '../../src/stages/compose';
import { runDiscover } from '../../src/stages/discover';
import { assembleDraft, ComposeReply } from '../../src/stages/draft-assembly';
import { runExtract } from '../../src/stages/extract';
import { runFetch } from '../../src/stages/fetch';
import { runSelect } from '../../src/stages/select';
import { runVerify } from '../../src/stages/verify';
import { VerifyReply, aggregateVerdicts, verifyPlanOf } from '../../src/stages/verify-model';
import { FETCHED_AT, URLS, stageContext, useScratch, worldMap } from '../support/context';
import { FIXTURE_DIR } from '../support/fixtures';
import { smallRegistry } from '../support/registry';

// The made-up world is what the pipeline is shown in when there is no network and no key: the tests of the whole run use it, and so does the
// dry-run demo. These tests say what is in it, that it is the world that the tests of the stages have always used, and that its scripted story is
// one that every stage of the pipeline lets through.

const scratch = useScratch();

describe('the made-up world', () => {
  it('is the world that the tests of the stages use: the same addresses, the same files for them, the same sources, the same folder', () => {
    expect(DEMO_URLS).toEqual(URLS);
    expect(demoWorldMap()).toEqual(worldMap());
    expect(demoRegistry()).toEqual(smallRegistry());
    expect(DEMO_FIXTURE_DIR).toBe(FIXTURE_DIR);
  });

  it('is current on the 5th of October 2026, the day after its newest feed item', () => {
    expect(DEMO_DATE).toBe('2026-10-05');
  });

  it('has only addresses on .example, which can never be a real site', () => {
    for (const url of Object.values(DEMO_URLS)) expect(new URL(url).hostname.endsWith('.example'), url).toBe(true);
    expect(Object.keys(demoWorldMap()).every((url) => new URL(url).hostname.endsWith('.example'))).toBe(true);
  });

  it('serves each of its pages, stamped with the time that the clock gives', async () => {
    const fetcher = demoFetcher(() => FETCHED_AT);
    for (const url of Object.values(DEMO_URLS)) {
      const page = await fetcher.get(url);
      expect(page.status, url).toBe(200);
      expect(page.retrievedAt).toBe(FETCHED_AT.toISOString());
      expect(page.body.length, url).toBeGreaterThan(100);
    }
    expect(fetcher.requests).toEqual(Object.values(DEMO_URLS));
  });

  it('fails like a site that cannot be reached for an address it does not have', async () => {
    await expect(demoFetcher(() => FETCHED_AT).get('https://elsewhere.example/page')).rejects.toBeInstanceOf(FetchError);
  });

  it('says what each of its addresses is: the company newsroom and its release are primary, the outlet is not', () => {
    const registry = demoRegistry();
    expect(sourceKind(DEMO_URLS.newsroom, registry)).toBe('company-newsroom');
    expect(sourceKind(DEMO_URLS.release, registry)).toBe('company-newsroom');
    expect(sourceKind(DEMO_URLS.mercerArticle, registry)).toBe('tier2');
    expect(sourceKind(DEMO_URLS.mercerFeed, registry)).toBe('tier2');
  });
});

describe('the story of the made-up world', () => {
  it('has the claims of the golden piece that its release says, as the model proposes them: seven, from page 1', () => {
    const golden = GOLDEN_CLAIMS.slice(0, 7).map((claim) => ({ text: claim.text, label: claim.label, type: claim.type, quote: claim.span.quote, values: claim.values, basis: claim.basis, status: claim.status, source: 1 }));
    expect(DEMO_CLAIMS).toEqual(golden);
  });

  it('has a reply that the schema accepts, that cites only those seven claims, and that has no limitation sentence, which only code writes', () => {
    expect(ComposeReply.safeParse(DEMO_REPLY).success).toBe(true);
    const draft = assembleDraft(DEMO_REPLY, GOLDEN_CLAIMS.slice(0, 7), { date: DEMO_DATE, published: { slugs: [], titles: [], sourceUrls: [] } });
    const cited = new Set(allSentences(draft).flatMap((item) => item.sentence.claimIds));
    expect([...cited].sort()).toEqual(['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7']);
    expect(allSentences(draft).filter((item) => item.section !== 'limitations' && item.sentence.kind === 'limitation')).toEqual([]);
  });

  it('is a piece that the gate clears, with code writing everything but the sentences', () => {
    const claims = GOLDEN_CLAIMS.slice(0, 7);
    const draft = assembleDraft(DEMO_REPLY, claims, { date: DEMO_DATE, published: { slugs: [], titles: [], sourceUrls: [] } });
    const gate = runGate({ draft, claims }, defaultContext());
    expect(gate.failures).toEqual([]);
    expect(gate.route).toBe('publish');
    expect(draft.slug).toBe('fixture-robotics-begins-fx-1-deliveries-to-a-second-brindle-logistics-plant');
    expect(draft.limitations.length).toBeGreaterThan(0);
  });

  it('is plain ASCII, like all the source of the Desk', () => {
    expect([...JSON.stringify([DEMO_REPLY, DEMO_CLAIMS, DEMO_SELECT_REASON])].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('the scripted verifier', () => {
  it('clears every sentence, every heading and every claim in a message, reading them from the blocks of the message', () => {
    const plan = verifyPlanOf(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    const request = { user: buildVerifyUser(plan) } as Parameters<typeof clearingVerifier>[0];
    const reply = clearingVerifier(request);
    expect(VerifyReply.safeParse(reply).success).toBe(true);
    expect(reply.verdicts.map((verdict) => verdict.id)).toEqual([...plan.sentences, ...plan.headings].map((item) => item.id));
    expect(reply.labels.map((label) => label.id)).toEqual(plan.claims.map((claim) => claim.id));
    expect(aggregateVerdicts('model-a', plan, reply).verifier.passed).toBe(true);
  });
});

describe('the scripted model', () => {
  it('tells the story through every stage of the pipeline: Discover, Select, Fetch, Extract, Compose and Verify end in publish, with four calls to the model', async () => {
    const client = demoClient();
    const { ctx } = stageContext(scratch, { fetcher: demoFetcher(() => FETCHED_AT), sources: demoRegistry(), client });
    const discovered = await runDiscover(ctx);
    const selected = await runSelect(ctx, discovered);
    expect(selected.chosen?.url).toBe(DEMO_URLS.mercerArticle);
    expect(selected.tier1Url).toBe(DEMO_URLS.release);
    const fetched = await runFetch(ctx, selected);
    if (!fetched.ok) throw new Error(fetched.reason);
    expect(fetched.snapshots.map((snapshot) => snapshot.tier)).toEqual([1, 2]);
    const extracted = await runExtract(ctx, fetched.snapshots, selected);
    if (!extracted.ok) throw new Error(extracted.reason);
    expect(extracted.artifact.claims).toHaveLength(7);
    expect(extracted.artifact.dropped).toEqual([]);
    const composed = await runCompose(ctx, extracted.artifact.claims);
    expect(composed.gate.route).toBe('publish');
    const verified = await runVerify(ctx, extracted.artifact.claims, composed);
    expect(verified.outcome).toBe('publish');
    expect(verified.rounds).toBe(0);
    expect(client.calls.map((call) => call.role)).toEqual(['select', 'extract', 'compose', 'verify']);
    for (const role of ['select', 'extract', 'compose', 'verify'] as const) expect(client.pending(role)).toBe(0);
  });

  it('has one reply for each of the four roles, and no more: a fifth call would find nothing scripted', () => {
    const client = demoClient();
    expect(['select', 'extract', 'compose', 'verify'].map((role) => client.pending(role as 'select'))).toEqual([1, 1, 1, 1]);
  });
});
