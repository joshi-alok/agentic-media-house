import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allSentences } from '@robywire/gate';
import { GOLDEN_CLAIMS } from '@robywire/gate/fixtures';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, clearingVerifier } from '../src/demo/story';
import { DEMO_DATE, DEMO_URLS, demoFetcher } from '../src/demo/world';
import { FetchError } from '../src/fetch/http';
import { FakeClient } from '../src/model/fake';
import { ExtractArtifact, VerifyArtifact, readArtifact } from '../src/run/artifacts';
import { readDeskState } from '../src/run/desk-state';
import type { RunResult } from '../src/run/orchestrate';
import { assembleDraft } from '../src/stages/draft-assembly';
import type { ComposeReply } from '../src/stages/draft-assembly';
import { FETCHED_AT, useScratch, withPages } from './support/context';
import { EMPTY_CONTENT, SELECT, STATE, contentOf, setupRun } from './support/run';

// The adversarial matrix. Models propose and code disposes, and these are the proposals of a model that goes wrong: every scenario is the clean story with
// one thing made bad, run through the whole pipeline (Discover to the end, the real stages, the made-up world) with a scripted model. Each has the
// result that it must end in and, where the gate is what catches it, the code of the failure that the gate reports. None of them may end published, and
// a table at the end says so. The clean story and the two other ways a run can end well or end with no story are run beside them, so that the
// scenarios are known to be bad because of what was changed, and not because the pipeline refuses everything.

const scratch = useScratch();
const claims7 = GOLDEN_CLAIMS.slice(0, 7);

const fact = (text: string, ...claimIds: string[]) => ({ kind: 'fact' as const, text, claimIds });

/** The clean piece of the made-up story, with `change` made to it. */
function reply(change: (copy: ComposeReply) => void): ComposeReply {
  const copy = structuredClone(DEMO_REPLY);
  change(copy);
  return copy;
}

/** The number of the sentence of `piece` that says `text`, as the gate numbers sentences and as Verify names them. */
function idOf(piece: ComposeReply, text: string): string {
  const draft = assembleDraft(piece, claims7, { date: DEMO_DATE, published: { slugs: [], titles: [], sourceUrls: [] } });
  const found = allSentences(draft).find((item) => item.sentence.text === text);
  if (found === undefined) throw new Error(`no sentence "${text}"`);
  return `s${found.index}`;
}

/** A claim of the outlet that reports the news, from the second page. It is the only way that something from another outlet gets into a piece. */
const REPORTED = {
  text: 'The arm is priced from $38,000.',
  label: 'list price',
  type: 'number',
  quote: 'The arm is priced from $38,000, the outlet reported.',
  values: [{ kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' }],
  basis: 'reported',
  status: 'unspecified',
  source: 2,
};

/** A claim with a quotation that is not on the page of the release: the model made it up. */
const NOT_ON_THE_PAGE = {
  text: 'The FX-1 weighs 38 kg.',
  label: 'arm mass',
  type: 'spec',
  quote: 'Arm mass: 38 kg.',
  values: [{ kind: 'number', raw: '38 kg', normalised: '38', unit: 'kg' }],
  basis: 'datasheet',
  status: 'unspecified',
  source: 1,
};

/** A claim whose quotation is on the page and whose label names a company that is not there. */
const MADE_UP_NAME = { ...DEMO_CLAIMS[3], label: 'Harlow list price' };

/** Two rounds of revision in which the composer sends back nothing: it does not fix what it was asked to. */
const NEVER_FIXES = [{ replacements: [] }, { replacements: [] }];

/** A verifier that clears everything except what `change` does to its reply. */
const verifier = (change: (reply: ReturnType<typeof clearingVerifier>) => void) => (request: Parameters<typeof clearingVerifier>[0]) => {
  const copy = clearingVerifier(request);
  change(copy);
  return copy;
};

/** A model that says what it is told: the selection, the claims, the piece and what comes after, and a verifier reply for each pass that the gate clears. */
function told(options: { claims?: object[]; piece?: ComposeReply; revisions?: unknown[]; verify?: unknown[] }): FakeClient {
  return new FakeClient()
    .script('select', SELECT)
    .script('extract', { claims: options.claims ?? DEMO_CLAIMS })
    .script('compose', options.piece ?? DEMO_REPLY, ...(options.revisions ?? NEVER_FIXES))
    .script('verify', ...(options.verify ?? []));
}

interface Scenario {
  name: string;
  script: () => FakeClient;
  /** The code of the failure that the gate reports for the piece, when the gate is what catches it. */
  gate?: string;
  /** The reasons of the hold, in the desk state. */
  reasons: string[];
  /** The revision rounds that were used. */
  rounds: number;
  /** What else the scenario says about the run. */
  check?: (made: { dir: string }) => Promise<void>;
}

const BAD: Scenario[] = [
  {
    name: 'an invented number',
    script: () => told({ piece: reply((copy) => { copy.takeaways[3] = fact('Fixture Robotics expects to build 900 FX-1 arms in 2027.', 'c-6'); }) }),
    gate: 'G4_NUMBER_UNSUPPORTED',
    reasons: ['G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'a swapped figure',
    script: () => told({ piece: reply((copy) => { copy.takeaways[0] = fact('Fixture Robotics lists the FX-1 from $83,000 per arm.', 'c-4'); }) }),
    gate: 'G4_NUMBER_UNSUPPORTED',
    reasons: ['G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'an invented quotation',
    script: () => told({ piece: reply((copy) => { copy.opening[1] = fact('The company said, "this arm will change every warehouse", on 1 October 2026.', 'c-2'); }) }),
    gate: 'G5_QUOTE_NOT_VERBATIM',
    reasons: ['G5_QUOTE_NOT_VERBATIM'],
    rounds: 2,
  },
  {
    name: 'an invented name at the start of a sentence',
    script: () => told({ piece: reply((copy) => { copy.opening[1] = fact('Harlow Dynamics announced on 1 October 2026 that deliveries have started.', 'c-2'); }) }),
    gate: 'G4_INITIAL_WORD_UNSUPPORTED',
    reasons: ['G4_INITIAL_WORD_UNSUPPORTED', 'G4_NAME_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'a lowercase opening',
    script: () => told({ piece: reply((copy) => { copy.opening[0] = fact('fixture Robotics has begun shipping FX-1 warehouse arms to Brindle Logistics for its second plant, at Tarnmoor.', 'c-1'); }) }),
    gate: 'G2_SENTENCE_START',
    reasons: ['G2_SENTENCE_START'],
    rounds: 2,
  },
  {
    name: 'a wrong number written out in words',
    script: () => told({ piece: reply((copy) => { copy.takeaways[1] = fact('Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within fourteen weeks of an order.', 'c-4'); }) }),
    gate: 'G4_NUMBER_UNSUPPORTED',
    reasons: ['G4_NUMBER_UNSUPPORTED'],
    rounds: 2,
  },
  {
    name: 'a heading that asserts a figure',
    script: () => told({ piece: reply((copy) => { (copy.sections[1] as { heading: string }).heading = 'What 12 weeks of delivery means'; }) }),
    gate: 'G4_HEADING_NUMBER',
    reasons: ['G4_HEADING_NUMBER'],
    rounds: 2,
  },
  {
    name: 'a claim of another outlet stated as fact',
    script: () => told({ claims: [...DEMO_CLAIMS, REPORTED], piece: reply((copy) => { copy.takeaways[3] = fact('The arm is priced from $38,000.', 'c-8'); }) }),
    gate: 'G6_TIER2_UNATTRIBUTED',
    reasons: ['G6_TIER2_UNATTRIBUTED'],
    rounds: 2,
  },
  {
    name: 'a claim of another outlet that is attributed and verified, which still goes to the owner',
    script: () =>
      told({
        claims: [...DEMO_CLAIMS, REPORTED],
        piece: reply((copy) => { copy.takeaways[3] = { kind: 'fact', text: 'Mercer Wire reports that the arm is priced from $38,000.', claimIds: ['c-8'], attributed: true }; }),
        verify: [clearingVerifier],
      }),
    reasons: ['TIER2_ATTRIBUTION'],
    rounds: 0,
  },
  {
    name: 'a claim whose quotation is not in the source, which the piece then cites',
    script: () => told({ claims: [...DEMO_CLAIMS, NOT_ON_THE_PAGE], piece: reply((copy) => { copy.takeaways[3] = fact('The FX-1 weighs 38 kg.', 'c-8'); }) }),
    gate: 'G3_UNKNOWN_CLAIM',
    reasons: ['G3_UNKNOWN_CLAIM', 'G4_NUMBER_UNSUPPORTED', 'G4_NAME_UNSUPPORTED'],
    rounds: 2,
    check: async ({ dir }) => {
      const extracted = await readArtifact(dir, '04-extract', ExtractArtifact);
      expect(extracted.claims).toHaveLength(7);
      expect(extracted.dropped.map((claim) => [claim.index, claim.reasons.map((reason) => reason.code)])).toEqual([[7, ['quote-not-found']]]);
    },
  },
  {
    name: 'a claim whose label carries a name that is not in its quotation, which the piece then cites',
    script: () => told({ claims: [...DEMO_CLAIMS, MADE_UP_NAME], piece: reply((copy) => { copy.takeaways[3] = fact('Fixture Robotics lists the FX-1 from $38,000 per arm.', 'c-8'); }) }),
    gate: 'G3_UNKNOWN_CLAIM',
    reasons: ['G3_UNKNOWN_CLAIM', 'G4_INITIAL_WORD_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED', 'G4_NAME_UNSUPPORTED'],
    rounds: 2,
    check: async ({ dir }) => {
      const extracted = await readArtifact(dir, '04-extract', ExtractArtifact);
      expect(extracted.dropped.map((claim) => claim.reasons.map((reason) => reason.code))).toEqual([['label-not-in-quote']]);
    },
  },
  (() => {
    // A sentence that says that a planned delivery has been made: every figure and name in it is in the claim, so the gate passes it, and only the verifier can tell.
    const distorted = fact('Tarnmoor has received 60 arms by 30 November 2026.', 'c-5');
    const piece = reply((copy) => { copy.takeaways[2] = distorted; });
    const id = idOf(piece, distorted.text);
    const rejecting = verifier((copy) => { copy.verdicts = copy.verdicts.map((verdict) => (verdict.id === id ? { ...verdict, verdict: 'not_entailed' as const } : verdict)); });
    return {
      name: 'a sentence that the verifier rejects although the gate passes it',
      script: () => told({ piece, verify: [rejecting, rejecting, rejecting] }),
      reasons: ['G10_NOT_ENTAILED'],
      rounds: 2,
      check: async ({ dir }: { dir: string }) => {
        const verified = await readArtifact(dir, '06-verify', VerifyArtifact);
        expect(verified.history.map((pass) => pass.gate.route)).toEqual(['publish', 'publish', 'publish']);
        expect(verified.history.map((pass) => pass.verifierFailures.map((failure) => failure.id))).toEqual([[id], [id], [id]]);
      },
    };
  })(),
  (() => {
    // A composer that is sent back twice and each time writes another wrong number.
    const wrong = fact('Fixture Robotics expects to build 900 FX-1 arms in 2027.', 'c-6');
    const piece = reply((copy) => { copy.takeaways[3] = wrong; });
    const id = idOf(piece, wrong.text);
    const again = (kilograms: number) => ({ replacements: [{ id, sentence: fact(`Fixture Robotics expects to build ${kilograms} FX-1 arms in 2027.`, 'c-6') }] });
    return {
      name: 'a composer that never fixes its draft',
      script: () => told({ piece, revisions: [again(800), again(700)] }),
      gate: 'G4_NUMBER_UNSUPPORTED',
      reasons: ['G4_NUMBER_UNSUPPORTED'],
      rounds: 2,
      check: async ({ dir }: { dir: string }) => {
        const verified = await readArtifact(dir, '06-verify', VerifyArtifact);
        expect(verified.history.map((pass) => pass.sent)).toEqual([[id], [id], []]);
        expect(verified.history.every((pass) => pass.verifier === null)).toBe(true);
      },
    };
  })(),
  {
    name: 'a verifier that finds the basis of a claim not supported',
    script: () => told({ verify: [verifier((copy) => { copy.labels = copy.labels.map((label) => (label.id === 'c-4' ? { ...label, basisSupported: false } : label)); })] }),
    reasons: ['G10_LABEL_UNSUPPORTED'],
    rounds: 0,
  },
  (() => {
    // A verifier that leaves a sentence without a verdict: the Desk does not take silence for approval.
    const silent = verifier((copy) => { copy.verdicts = copy.verdicts.filter((verdict) => verdict.id !== 's3'); });
    return {
      name: 'a verifier that gives no verdict on a sentence',
      script: () => told({ verify: [silent, silent, silent] }),
      reasons: ['G10_NOT_JUDGED'],
      rounds: 2,
    } satisfies Scenario;
  })(),
];

/** What a scenario left: the result of the run and where it went. */
const results = new Map<string, { result: RunResult; repoDir: string; git: ReturnType<typeof setupRun>['git']; fake: FakeClient }>();

beforeAll(async () => {
  for (const scenario of BAD) {
    const made = setupRun(scratch, { fake: scenario.script() });
    results.set(scenario.name, { result: await made.run(), repoDir: made.repoDir, git: made.git, fake: made.fake });
  }
});

describe.each(BAD.map((scenario) => [scenario.name, scenario] as const))('the adversarial matrix: %s', (_name, scenario) => {
  const got = () => results.get(scenario.name) as NonNullable<ReturnType<typeof results.get>>;

  it('ends held, and not published', () => {
    expect(got().result.outcome).toBe('held');
    expect(got().result.stage).toBe('hold');
  });

  it('puts nothing into the pages of the site: no piece and no ledger', () => {
    expect(contentOf(got().repoDir)).toEqual(EMPTY_CONTENT);
  });

  it('makes one commit, of the desk state alone', () => {
    expect(got().git.commits.map((commit) => commit.paths)).toEqual([[STATE]]);
  });

  it('records a hold in the desk state with the reasons, and the run as held', async () => {
    const state = await readDeskState(path.join(got().repoDir, STATE));
    expect(state.holds.map((hold) => hold.reasons)).toEqual([scenario.reasons]);
    expect(state.lastRun?.outcome).toBe('held');
  });

  it('is stopped by the check that it should be: the gate reports the code, in every pass, or the model check does', async () => {
    const dir = path.join(got().result.dir);
    const verified = await readArtifact(dir, '06-verify', VerifyArtifact);
    expect(verified.outcome).toBe('hold');
    expect(verified.rounds).toBe(scenario.rounds);
    if (scenario.gate !== undefined) {
      for (const pass of verified.history) expect(pass.gate.failures.map((failure) => failure.code)).toContain(scenario.gate);
    }
    await scenario.check?.({ dir });
  });

  it('keeps the held draft in the folder of the run', () => {
    const held = JSON.parse(readFileSync(path.join(got().result.dir, 'held', `${got().result.slug}.json`), 'utf8')) as { reasons: string[] };
    expect(held.reasons).toEqual(scenario.reasons);
  });
});

describe('the adversarial matrix: the table', () => {
  it('has at least twelve scenarios, each with its own name', () => {
    expect(BAD.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BAD.map((scenario) => scenario.name)).size).toBe(BAD.length);
  });

  it('says what each scenario ended in, and none of them ended published', () => {
    const table = BAD.map((scenario) => [scenario.name, (results.get(scenario.name) as { result: RunResult }).result.outcome]);
    expect(table).toEqual(BAD.map((scenario) => [scenario.name, 'held']));
    expect(table.filter(([, outcome]) => outcome === 'published')).toEqual([]);
  });

  it('catches every one of the checks of the gate that the scenarios are about, by the code that the gate gives it', () => {
    expect([...new Set(BAD.flatMap((scenario) => (scenario.gate === undefined ? [] : [scenario.gate])))].sort()).toEqual([
      'G2_SENTENCE_START',
      'G3_UNKNOWN_CLAIM',
      'G4_HEADING_NUMBER',
      'G4_INITIAL_WORD_UNSUPPORTED',
      'G4_NUMBER_UNSUPPORTED',
      'G5_QUOTE_NOT_VERBATIM',
      'G6_TIER2_UNATTRIBUTED',
    ]);
  });
});

describe('the adversarial matrix: the ways to end that are not bad', () => {
  it('ends the clean story published, with a piece and a ledger on the site and one commit', async () => {
    const made = setupRun(scratch, { fake: told({ verify: [clearingVerifier], revisions: [] }) });
    const result = await made.run();
    expect(result.outcome).toBe('published');
    expect(contentOf(made.repoDir)).toHaveLength(4);
    expect(made.git.commits).toHaveLength(1);
  });

  it('ends published a composer that fixes its draft when it is sent back once, so the scenarios above are held for what is wrong in them and not for the revision', async () => {
    const wrong = fact('Fixture Robotics expects to build 900 FX-1 arms in 2027.', 'c-6');
    const piece = reply((copy) => { copy.takeaways[3] = wrong; });
    const fixed = { replacements: [{ id: idOf(piece, wrong.text), sentence: fact('Fixture Robotics expects to build 500 FX-1 arms in 2027.', 'c-6') }] };
    const made = setupRun(scratch, { fake: told({ piece, revisions: [fixed], verify: [clearingVerifier] }) });
    const result = await made.run();
    expect(result.outcome).toBe('published');
    const verified = await readArtifact(result.dir, '06-verify', VerifyArtifact);
    expect(verified.rounds).toBe(1);
    expect(verified.history[0]?.gate.failures.map((failure) => failure.code)).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('ends no-story when the story has no source that can be read: the pages of the story are behind robots.txt', async () => {
    const blocked = (url: string) => new FetchError('robots', url, 'robots.txt does not allow it');
    const fetcher = withPages(demoFetcher(() => FETCHED_AT), { [DEMO_URLS.mercerArticle]: blocked(DEMO_URLS.mercerArticle), [DEMO_URLS.release]: blocked(DEMO_URLS.release) });
    const made = setupRun(scratch, { fake: new FakeClient().script('select', SELECT), fetcher });
    const result = await made.run();
    expect(result.outcome).toBe('no-story');
    expect(result.stage).toBe('fetch');
    expect(contentOf(made.repoDir)).toEqual(EMPTY_CONTENT);
    expect(made.fake.calls.map((call) => call.role)).toEqual(['select']);
  });
});
