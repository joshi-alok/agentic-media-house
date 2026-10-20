import { describe, expect, it } from 'vitest';
import * as api from '../src/index';
import { CHECK_IDS } from '../src/constants';
import {
  Claim,
  ClaimValue,
  DeskState,
  Draft,
  LedgerEntry,
  Sentence,
  SourcesRegistry,
} from '../src/schemas';
import { expectValid, failedPaths, issueLines, patch } from './schema-helpers';

// ---------------------------------------------------------------------------
// Valid examples. Everything here is fictional (Fixture Robotics, FX-1, *.example).
// Each test below changes exactly one field of one of these.
// ---------------------------------------------------------------------------

const VALID_CLAIM = {
  id: 'c-1',
  text: 'The FX-1 arm is rated for a 12 kg payload.',
  label: 'payload',
  type: 'spec',
  source: {
    url: 'https://fixture-robotics.example/news/fx-1',
    tier: 1,
    snapshotHash: 'a'.repeat(64),
    retrievedAt: '2026-10-04T04:30:00Z',
  },
  span: { start: 120, end: 142, quote: 'rated payload of 12 kg' },
  basis: 'datasheet',
  status: 'unspecified',
  values: [{ kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' }],
};

const fact = (text: string, ...claimIds: string[]) => ({ kind: 'fact', text, claimIds });

const VALID_DRAFT = {
  slug: 'fixture-robotics-ships-fx-1',
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: 'Agentic Media House Desk' },
  title: fact('Fixture Robotics ships the FX-1 arm.', 'c-1'),
  description: fact('Fixture Robotics says the FX-1 arm is rated for 12 kg.', 'c-1'),
  opening: [fact('Fixture Robotics shipped the FX-1 arm.', 'c-1')],
  takeaways: [fact('The FX-1 arm is rated for 12 kg.', 'c-1')],
  sections: [
    {
      heading: 'What shipped',
      paragraphs: [
        [
          fact('The FX-1 arm is rated for 12 kg.', 'c-1'),
          { kind: 'analysis', text: 'That is mid-range for the class.', claimIds: [] },
        ],
      ],
    },
  ],
  limitations: [
    {
      kind: 'limitation',
      text: "What is cited here comes from the company's datasheet; no independent measurement was available.",
      claimIds: ['c-1'],
      template: 'basis',
    },
  ],
};

const VALID_LEDGER = {
  schemaVersion: 1,
  slug: 'fixture-robotics-ships-fx-1',
  runId: 'run-2026-10-04',
  publishedAt: '2026-10-04',
  title: 'Fixture Robotics ships the FX-1 arm.',
  categories: ['industrial-warehouse', 'funding'],
  claims: [VALID_CLAIM],
  order: ['c-1'],
  sentences: [
    { index: 0, section: 'title', paragraph: 0, kind: 'fact', text: 'Fixture Robotics ships the FX-1 arm.', claimIds: ['c-1'] },
    {
      index: 1,
      section: 'body',
      paragraph: 0,
      heading: 'What shipped',
      kind: 'fact',
      text: 'The FX-1 arm is rated for 12 kg.',
      claimIds: ['c-1'],
    },
  ],
  gate: {
    route: 'publish',
    checks: Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])),
    holdReasons: [],
  },
  // A copy, not the same object: structuredClone keeps shared references shared,
  // so patching sources.0 would otherwise also patch claims.0.source.
  sources: [{ ...VALID_CLAIM.source }],
};

const VALID_DESK_STATE = {
  lastRun: {
    at: '2026-10-04T04:31:12Z',
    outcome: 'published',
    runId: 'run-2026-10-04',
    slug: 'fixture-robotics-ships-fx-1',
  },
  holds: [
    {
      at: '2026-10-03T04:32:00Z',
      categories: ['humanoids'],
      reasons: ['The only source was a tier-2 outlet.'],
      prUrl: 'https://github.com/example/robywire/pull/7',
    },
  ],
  corrections: [
    {
      at: '2026-10-04T09:00:00Z',
      slug: 'fixture-robotics-ships-fx-1',
      kind: 'correction',
      note: 'Corrected the payload unit.',
    },
  ],
};

const VALID_REGISTRY = {
  primary: {
    companies: {
      humanoids: [
        { name: 'Fixture Robotics', url: 'https://fixture-robotics.example/news', status: 'unverified' },
      ],
    },
    research: [
      {
        name: 'Example preprints',
        url: 'http://preprints.example/rss',
        status: 'blocked',
        note: 'robots.txt disallows the feed.',
      },
    ],
    standards: [{ name: 'Example standard', url: 'https://standards.example/robots', status: 'unverified' }],
    funding: [{ name: 'Company announcement', url: "(announced on the company's own site)", status: 'n/a' }],
    events: [{ name: 'Example Expo', url: 'https://expo.example/', status: 'unverified' }],
  },
  secondary: [
    {
      name: 'Example Robot News',
      feed: 'https://news.example/feed',
      status: 'unverified',
      beats: ['humanoids', 'funding'],
    },
  ],
  bar: {
    publish_if_any: ['A product shipped.'],
    do_not_publish: ['A demo with no specification behind it.'],
    quiet_day_fallback: ['A follow-up on an earlier launch.'],
  },
};

// ---------------------------------------------------------------------------

describe('ClaimValue', () => {
  it('accepts a value with and without a unit', () => {
    expectValid(ClaimValue, { kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' });
    expectValid(ClaimValue, { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' });
  });

  it('rejects an unknown kind and empty strings', () => {
    expect(failedPaths(ClaimValue, { kind: 'money', raw: '$5', normalised: '5' })).toEqual(['kind']);
    expect(failedPaths(ClaimValue, { kind: 'number', raw: '', normalised: '5' })).toEqual(['raw']);
    expect(failedPaths(ClaimValue, { kind: 'number', raw: '5', normalised: '' })).toEqual(['normalised']);
  });
});

describe('Claim', () => {
  it('accepts a complete claim', () => {
    expectValid(Claim, VALID_CLAIM);
  });

  it.each(['c-1', 'c-12', 'c-007'])('accepts the claim id %s', (id) => {
    expectValid(Claim, patch(VALID_CLAIM, 'id', id));
  });

  it.each(['c-', 'c1', 'C-1', 'c-1a', 'x-1', ' c-1', 'c--1', ''])('rejects the claim id %j', (id) => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'id', id))).toEqual(['id']);
  });

  it('accepts a 64-character lowercase hex snapshot hash', () => {
    expectValid(Claim, patch(VALID_CLAIM, 'source.snapshotHash', '0123456789abcdef'.repeat(4)));
  });

  it.each([
    ['63 characters', 'a'.repeat(63)],
    ['65 characters', 'a'.repeat(65)],
    ['uppercase hex', 'A'.repeat(64)],
    ['non-hex characters', 'g'.repeat(64)],
    ['empty', ''],
  ])('rejects a snapshot hash of %s', (_label, hash) => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'source.snapshotHash', hash))).toEqual(['source.snapshotHash']);
  });

  it.each(['2026-10-04T04:30:00Z', '2026-10-04T04:30:00.250Z', '2026-10-04T10:00:00+05:30'])(
    'accepts the retrieval time %s',
    (when) => {
      expectValid(Claim, patch(VALID_CLAIM, 'source.retrievedAt', when));
    },
  );

  it.each(['2026-10-04', '2026-02-30T00:00:00Z', 'yesterday', '2026-10-04 04:30:00', ''])(
    'rejects the retrieval time %j',
    (when) => {
      expect(failedPaths(Claim, patch(VALID_CLAIM, 'source.retrievedAt', when))).toEqual(['source.retrievedAt']);
    },
  );

  it('accepts a quote of 1 and of 300 characters', () => {
    expectValid(Claim, patch(patch(VALID_CLAIM, 'span.quote', 'x'), 'span.end', 121));
    expectValid(Claim, patch(patch(VALID_CLAIM, 'span.quote', 'x'.repeat(300)), 'span.end', 420));
  });

  it('rejects an empty quote and a quote of 301 characters', () => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'span.quote', ''))).toEqual(['span.quote']);
    expect(failedPaths(Claim, patch(patch(VALID_CLAIM, 'span.quote', 'x'.repeat(301)), 'span.end', 421))).toEqual([
      'span.quote',
    ]);
  });

  it('requires span.end to be greater than span.start', () => {
    expectValid(Claim, patch(VALID_CLAIM, 'span.end', 121));
    expect(issueLines(Claim, patch(VALID_CLAIM, 'span.end', 120))).toEqual([
      'span.end: span.end must be greater than span.start',
    ]);
    expect(issueLines(Claim, patch(VALID_CLAIM, 'span.end', 50))).toEqual([
      'span.end: span.end must be greater than span.start',
    ]);
  });

  it('rejects negative or fractional offsets', () => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'span.start', -1))).toEqual(['span.start']);
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'span.end', 142.5))).toEqual(['span.end']);
  });

  it('requires an outlet when the source is tier 2', () => {
    const tier2 = patch(VALID_CLAIM, 'source.tier', 2);
    expect(issueLines(Claim, tier2)).toEqual(['source.outlet: outlet is required when tier is 2']);
    expectValid(Claim, patch(tier2, 'source.outlet', 'Example Robot News'));
  });

  it('lets a tier 1 source omit the outlet or carry one', () => {
    expectValid(Claim, VALID_CLAIM);
    expectValid(Claim, patch(VALID_CLAIM, 'source.outlet', 'Fixture Robotics newsroom'));
  });

  it('rejects an empty outlet on a tier 2 source', () => {
    const tier2 = patch(VALID_CLAIM, 'source.tier', 2);
    expect(failedPaths(Claim, patch(tier2, 'source.outlet', ''))).toEqual(['source.outlet']);
  });

  it('rejects a tier other than 1 or 2', () => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'source.tier', 3))).toEqual(['source.tier']);
  });

  it.each(['not a url', 'ftp://fixture-robotics.example/a', 'fixture-robotics.example/news'])(
    'rejects the source url %j',
    (url) => {
      expect(failedPaths(Claim, patch(VALID_CLAIM, 'source.url', url))).toEqual(['source.url']);
    },
  );

  it.each([
    ['type', 'rumour'],
    ['basis', 'hearsay'],
    ['status', 'shipped'],
  ])('rejects an unknown %s', (field, value) => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, field, value))).toEqual([field]);
  });

  it('rejects a bad entry inside values', () => {
    expect(failedPaths(Claim, patch(VALID_CLAIM, 'values.0.kind', 'money'))).toEqual(['values.0.kind']);
  });

  it.each(['id', 'text', 'label', 'type', 'source', 'span', 'basis', 'status', 'values'])(
    'rejects a claim with %s missing',
    (field) => {
      expect(failedPaths(Claim, patch(VALID_CLAIM, field, undefined))).toEqual([field]);
    },
  );
});

describe('Sentence', () => {
  it('accepts a fact sentence, with and without the attributed flag', () => {
    expectValid(Sentence, { kind: 'fact', text: 'It ships.', claimIds: ['c-1'] });
    expectValid(Sentence, { kind: 'fact', text: 'Outlet X reports it ships.', claimIds: ['c-2'], attributed: true });
  });

  it('rejects a fact sentence whose attributed flag is not a boolean', () => {
    expect(failedPaths(Sentence, { kind: 'fact', text: 'It ships.', claimIds: ['c-1'], attributed: 'yes' })).toEqual([
      'attributed',
    ]);
  });

  it('parses a fact sentence with no claim ids, because the gate (G3) reports that, not the schema', () => {
    expectValid(Sentence, { kind: 'fact', text: 'It ships.', claimIds: [] });
  });

  it('accepts an analysis sentence with or without claim ids', () => {
    expectValid(Sentence, { kind: 'analysis', text: 'That is mid-range.', claimIds: [] });
    expectValid(Sentence, { kind: 'analysis', text: 'That is mid-range.', claimIds: ['c-1', 'c-2'] });
  });

  it('accepts a limitation sentence with one or more claim ids and a template', () => {
    expectValid(Sentence, { kind: 'limitation', text: 'No testing.', claimIds: ['c-1'], template: 'status' });
    expectValid(Sentence, { kind: 'limitation', text: 'Datasheet only.', claimIds: ['c-1'], template: 'basis' });
    expectValid(Sentence, { kind: 'limitation', text: 'Datasheet only.', claimIds: ['c-1', 'c-2', 'c-10'], template: 'basis' });
  });

  it('rejects a limitation sentence with no claim id', () => {
    expect(failedPaths(Sentence, { kind: 'limitation', text: 'x', claimIds: [], template: 'basis' })).toEqual(['claimIds']);
  });

  it('leaves the order and the uniqueness of the claim ids of a limitation sentence to the gate (G8)', () => {
    expectValid(Sentence, { kind: 'limitation', text: 'x', claimIds: ['c-2', 'c-1', 'c-1'], template: 'basis' });
  });

  it('rejects a limitation sentence with a missing or unknown template', () => {
    expect(failedPaths(Sentence, { kind: 'limitation', text: 'x', claimIds: ['c-1'] })).toEqual(['template']);
    expect(failedPaths(Sentence, { kind: 'limitation', text: 'x', claimIds: ['c-1'], template: 'other' })).toEqual([
      'template',
    ]);
  });

  it('discriminates on kind and rejects an unknown kind', () => {
    expect(failedPaths(Sentence, { kind: 'opinion', text: 'x', claimIds: [] })).toEqual(['kind']);
    expect(failedPaths(Sentence, { text: 'x', claimIds: [] })).toEqual(['kind']);
  });
});

describe('Draft', () => {
  it('accepts a complete draft', () => {
    expectValid(Draft, VALID_DRAFT);
  });

  it.each(['figure-raises-series-c', 'fx-1-ships', 'a', 'a1-b2'])('accepts the slug %s', (slug) => {
    expectValid(Draft, patch(VALID_DRAFT, 'slug', slug));
  });

  it.each(['Figure-Raises', 'figure_raises', '-leading', 'trailing-', 'double--hyphen', 'has space', 'fx.1', ''])(
    'rejects the slug %j',
    (slug) => {
      expect(failedPaths(Draft, patch(VALID_DRAFT, 'slug', slug))).toEqual(['slug']);
    },
  );

  it.each(['2026-10-04', '2024-02-29', '2026-12-31'])('accepts the publication date %s', (date) => {
    expectValid(Draft, patch(VALID_DRAFT, 'publishedAt', date));
  });

  it.each([
    '2026-02-30',
    '2026-02-29',
    '2026-13-01',
    '2026-1-4',
    '04/10/2026',
    '2026-10-04T00:00:00Z',
    '',
  ])('rejects the publication date %j', (date) => {
    expect(failedPaths(Draft, patch(VALID_DRAFT, 'publishedAt', date))).toEqual(['publishedAt']);
  });

  // The category vocabulary is checked by G1, not here: the schema only knows
  // that categories is a list of strings, so the gate can report an unknown
  // slug by code and feed it into a revision round.
  it('parses an unknown category slug and an empty list, leaving the vocabulary to G1', () => {
    expectValid(Draft, patch(VALID_DRAFT, 'categories', ['quantum-widgets']));
    expectValid(Draft, patch(VALID_DRAFT, 'categories', []));
  });

  it('rejects a category that is not a string', () => {
    expect(failedPaths(Draft, patch(VALID_DRAFT, 'categories', ['humanoids', 7]))).toEqual(['categories.1']);
  });

  it('requires an author object with a name string', () => {
    expect(failedPaths(Draft, patch(VALID_DRAFT, 'author', undefined))).toEqual(['author']);
    expect(failedPaths(Draft, patch(VALID_DRAFT, 'author', {}))).toEqual(['author.name']);
  });

  it('requires sentences, not strings, for the title and description', () => {
    expect(failedPaths(Draft, patch(VALID_DRAFT, 'title', 'Just a string'))).toEqual(['title']);
    expect(failedPaths(Draft, patch(VALID_DRAFT, 'description', undefined))).toEqual(['description']);
  });

  it('requires each section paragraph to be a list of sentences', () => {
    const flat = patch(VALID_DRAFT, 'sections.0.paragraphs', [fact('One sentence, not wrapped.', 'c-1')]);
    expect(failedPaths(Draft, flat)).toEqual(['sections.0.paragraphs.0']);
  });

  it('allows only limitation sentences in limitations', () => {
    const wrong = patch(VALID_DRAFT, 'limitations', [fact('A fact is not a limitation.', 'c-1')]);
    expect(failedPaths(Draft, wrong)).toEqual(['limitations.0.kind', 'limitations.0.template']);
  });

  it.each(['slug', 'publishedAt', 'categories', 'author', 'title', 'description', 'opening', 'takeaways', 'sections', 'limitations'])(
    'rejects a draft with %s missing',
    (field) => {
      expect(failedPaths(Draft, patch(VALID_DRAFT, field, undefined))).toEqual([field]);
    },
  );
});

describe('LedgerEntry', () => {
  it('accepts a complete entry, with or without a verifier result', () => {
    expectValid(LedgerEntry, VALID_LEDGER);
    expectValid(
      LedgerEntry,
      patch(VALID_LEDGER, 'verifier', { model: 'claude-sonnet-5-5', passed: true, notes: [] }),
    );
  });

  it('accepts a hold with reasons and a failing check', () => {
    const held = patch(
      patch(VALID_LEDGER, 'gate.route', 'hold'),
      'gate.holdReasons',
      ['The only source was a tier-2 outlet.'],
    );
    expectValid(LedgerEntry, held);
  });

  it.each(['slug', 'runId', 'publishedAt', 'title', 'categories', 'claims', 'order', 'sentences', 'gate', 'sources'])(
    'rejects an entry with %s missing',
    (field) => {
      expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, field, undefined))).toEqual([field]);
    },
  );

  it('pins schemaVersion to 1', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'schemaVersion', 2))).toEqual(['schemaVersion']);
  });

  it('rejects an unknown route and a bad check result', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'gate.route', 'maybe'))).toEqual(['gate.route']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'gate.checks.G4', 'skipped'))).toEqual(['gate.checks.G4']);
  });

  it('requires a result for every check G1 to G9', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'gate.checks.G9', undefined))).toEqual(['gate.checks.G9']);
  });

  it('rejects a ledger sentence in an unknown section and an order entry that is not a claim id', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.section', 'footer'))).toEqual([
      'sentences.0.section',
    ]);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'order', ['claim-one']))).toEqual(['order.0']);
  });

  it('applies the tier 2 outlet rule to the sources list too', () => {
    const bad = patch(VALID_LEDGER, 'sources.0.tier', 2);
    expect(failedPaths(LedgerEntry, bad)).toEqual(['sources.0.outlet']);
  });

  it('accepts release as auto or owner, or none, and nothing else', () => {
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'release', 'auto'));
    expectValid(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'hold'), 'release', 'owner'));
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'release', 'editor'))).toEqual(['release']);
  });

  it('refuses a release that the route of the gate contradicts: auto needs publish, owner needs a piece the gate did not clear', () => {
    expect(failedPaths(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'hold'), 'release', 'auto'))).toEqual(['release']);
    expect(failedPaths(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'revise'), 'release', 'auto'))).toEqual(['release']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'release', 'owner'))).toEqual(['release']);
    expectValid(LedgerEntry, patch(patch(VALID_LEDGER, 'gate.route', 'revise'), 'release', 'owner'));
  });

  it('requires the paragraph of a ledger sentence, a whole number from 0', () => {
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', undefined))).toEqual(['sentences.1.paragraph']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', -1))).toEqual(['sentences.1.paragraph']);
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', 1.5))).toEqual(['sentences.1.paragraph']);
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.1.paragraph', 3));
  });

  it('accepts attributed on a ledger sentence, as true or false, and refuses anything else', () => {
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', true));
    expectValid(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', false));
    expect(failedPaths(LedgerEntry, patch(VALID_LEDGER, 'sentences.0.attributed', 'yes'))).toEqual(['sentences.0.attributed']);
  });

  it('rejects a verifier result that lacks a model', () => {
    const bad = patch(VALID_LEDGER, 'verifier', { passed: true, notes: [] });
    expect(failedPaths(LedgerEntry, bad)).toEqual(['verifier.model']);
  });
});

describe('DeskState', () => {
  it('accepts a populated state and a fresh one', () => {
    expectValid(DeskState, VALID_DESK_STATE);
    expectValid(DeskState, { lastRun: null, holds: [], corrections: [] });
  });

  it('accepts a run that produced no slug', () => {
    expectValid(DeskState, patch(patch(VALID_DESK_STATE, 'lastRun.outcome', 'no-story'), 'lastRun.slug', null));
  });

  it('accepts a hold without a pull request URL', () => {
    expectValid(DeskState, patch(VALID_DESK_STATE, 'holds.0.prUrl', undefined));
  });

  it('accepts a hold that remembers its story, with the slug of the held piece and the address of the story, and a hold from before they existed, with neither', () => {
    const remembered = patch(patch(VALID_DESK_STATE, 'holds.0.slug', 'fixture-robotics-ships-fx-1'), 'holds.0.sourceUrl', 'https://fixture-robotics.example/news/fx-1');
    expectValid(DeskState, remembered);
    expect(DeskState.parse(remembered).holds[0]).toMatchObject({ slug: 'fixture-robotics-ships-fx-1', sourceUrl: 'https://fixture-robotics.example/news/fx-1' });
    // The state that was valid before the two fields were added still is, and parses without them.
    const old = DeskState.parse(VALID_DESK_STATE);
    expect(old.holds[0]).not.toHaveProperty('slug');
    expect(old.holds[0]).not.toHaveProperty('sourceUrl');
  });

  it('rejects a hold whose slug is empty or whose story address is not an http address', () => {
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'holds.0.slug', ''))).toEqual(['holds.0.slug']);
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'holds.0.sourceUrl', 'a story'))).toEqual(['holds.0.sourceUrl']);
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'holds.0.sourceUrl', 'javascript:alert(1)'))).toEqual(['holds.0.sourceUrl']);
  });

  it('rejects an unknown outcome, a bad timestamp and a bad pull request URL', () => {
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'lastRun.outcome', 'crashed'))).toEqual(['lastRun.outcome']);
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'lastRun.at', 'earlier today'))).toEqual(['lastRun.at']);
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'holds.0.prUrl', 'pull request 7'))).toEqual([
      'holds.0.prUrl',
    ]);
  });

  it('rejects an unknown correction kind', () => {
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, 'corrections.0.kind', 'erratum'))).toEqual([
      'corrections.0.kind',
    ]);
  });

  it.each(['lastRun', 'holds', 'corrections'])('rejects a state with %s missing', (field) => {
    expect(failedPaths(DeskState, patch(VALID_DESK_STATE, field, undefined))).toEqual([field]);
  });
});

describe('SourcesRegistry', () => {
  it('accepts a complete registry', () => {
    expectValid(SourcesRegistry, VALID_REGISTRY);
  });

  it('rejects a status outside verified, unverified, blocked and n/a', () => {
    expect(
      failedPaths(SourcesRegistry, patch(VALID_REGISTRY, 'primary.companies.humanoids.0.status', 'maybe')),
    ).toEqual(['primary.companies.humanoids.0.status']);
  });

  it('rejects a secondary beat that is not in the category vocabulary', () => {
    expect(failedPaths(SourcesRegistry, patch(VALID_REGISTRY, 'secondary.0.beats', ['humanoids', 'quantum']))).toEqual([
      'secondary.0.beats.1',
    ]);
  });

  it('rejects a secondary entry with no beats or a feed that is not http(s)', () => {
    expect(failedPaths(SourcesRegistry, patch(VALID_REGISTRY, 'secondary.0.beats', []))).toEqual(['secondary.0.beats']);
    expect(failedPaths(SourcesRegistry, patch(VALID_REGISTRY, 'secondary.0.feed', 'ftp://news.example/feed'))).toEqual([
      'secondary.0.feed',
    ]);
  });

  it('allows a descriptive url only when the status is n/a', () => {
    expectValid(SourcesRegistry, VALID_REGISTRY);
    expect(
      failedPaths(SourcesRegistry, patch(VALID_REGISTRY, 'primary.funding.0.status', 'unverified')),
    ).toEqual(['primary.funding.0.url']);
  });

  // The registry is hand-edited, so a typo must be an error, never a dropped key.
  it.each([
    ['tertiary', '(root)'],
    ['primary.press', 'primary'],
    ['primary.companies.humanoids.0.statuss', 'primary.companies.humanoids.0'],
    ['secondary.0.feeds', 'secondary.0'],
    ['bar.extra', 'bar'],
  ])('rejects the undefined key %s', (path, failing) => {
    expect(failedPaths(SourcesRegistry, patch(VALID_REGISTRY, path, 'x'))).toEqual([failing]);
  });

  it.each(['primary', 'secondary', 'bar'])('rejects a registry with %s missing', (field) => {
    expect(failedPaths(SourcesRegistry, patch(VALID_REGISTRY, field, undefined))).toEqual([field]);
  });

  it('requires all three editorial-bar lists', () => {
    expect(failedPaths(SourcesRegistry, patch(VALID_REGISTRY, 'bar.quiet_day_fallback', undefined))).toEqual([
      'bar.quiet_day_fallback',
    ]);
  });
});

describe('package entry point', () => {
  it('re-exports the constants and the schemas', () => {
    expect(api.BEATS).toHaveLength(7);
    expect(api.CATEGORY_VOCAB).toContain('funding');
    expect(api.Claim).toBe(Claim);
    expect(api.Draft).toBe(Draft);
    expect(api.SourcesRegistry).toBe(SourcesRegistry);
  });
});
