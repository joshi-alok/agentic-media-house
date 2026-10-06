import { describe, expect, it } from 'vitest';
import * as entry from '../../src/index';
import type {
  Candidate,
  ComposeArtifact,
  DiscoverArtifact,
  EvidenceMeta,
  EvidenceStore,
  ExtractArtifact,
  ExtractedPage,
  FakeCommit,
  FeedErrorKind,
  FeedItem,
  FetchArtifact,
  FetchDocument,
  FetchErrorKind,
  FetchedPage,
  Fetcher,
  FixtureEntry,
  GateReport,
  GitCliOptions,
  GitTarget,
  HttpFetcherOptions,
  Hold,
  LastRun,
  Newsroom,
  PageLink,
  ParsedFeed,
  ParsedRobots,
  RateLimiterOptions,
  RobotsGroup,
  RobotsRule,
  SelectArtifact,
  SourceKind,
  Tier2Feed,
  Transport,
  TransportRequest,
  VerifyArtifact,
} from '../../src/index';

// The stages of the pipeline import everything below them from the package entry point, never from a file
// inside it, and the stages themselves are not exported by it: they are the top of the package, and
// nothing below them may depend on them. These tests say what the entry point offers for fetching.

const VALUES = [
  'writeFileAtomic',
  'candidateId',
  'Candidate',
  'DiscoverArtifact',
  'SelectArtifact',
  'FetchDocument',
  'FetchArtifact',
  'ExtractArtifact',
  'GateReport',
  'ComposeArtifact',
  'VerifyArtifact',
  'runPath',
  'writeArtifact',
  'readArtifact',
  'productToken',
  'parseRobots',
  'robotsAllows',
  'isAllowed',
  'RateLimiter',
  'FetchError',
  'MAX_REDIRECTS',
  'HttpFetcher',
  'FixtureFetcher',
  'canonicalUrl',
  'hostKey',
  'ExtractError',
  'MAX_DEPTH',
  'extractPage',
  'FeedError',
  'normaliseFeedDate',
  'parseFeed',
  'EvidenceMeta',
  'LocalEvidenceStore',
  'COMPANY_GROUP_BEATS',
  'tier1Newsrooms',
  'tier2Feeds',
  'tier1Hosts',
  'sourceKind',
  'isTier1',
  'recordRun',
  'addHold',
  'readDeskState',
  'writeDeskState',
  'updateDeskState',
  'COMMIT_TRAILER',
  'GitCli',
  'FakeGit',
];

describe('the package entry point: fetching', () => {
  it.each(VALUES)('exports %s', (name) => {
    expect(entry).toHaveProperty(name);
  });

  it('exports the types of the fetching layer', () => {
    // `npm run typecheck` fails on this line if any of these types is not exported by the entry point.
    type Exported = [
      Candidate,
      DiscoverArtifact,
      SelectArtifact,
      FetchDocument,
      FetchArtifact,
      ExtractArtifact,
      GateReport,
      ComposeArtifact,
      VerifyArtifact,
      ParsedRobots,
      RobotsRule,
      RobotsGroup,
      RateLimiterOptions,
      FetchedPage,
      Fetcher,
      FetchErrorKind,
      Transport,
      TransportRequest,
      HttpFetcherOptions,
      FixtureEntry,
      PageLink,
      ExtractedPage,
      FeedItem,
      ParsedFeed,
      FeedErrorKind,
      EvidenceMeta,
      EvidenceStore,
      Newsroom,
      Tier2Feed,
      SourceKind,
      LastRun,
      Hold,
      GitTarget,
      GitCliOptions,
      FakeCommit,
    ];
    const nothing: Exported | undefined = undefined;
    expect(nothing).toBeUndefined();
  });

  it('does not export the stages or their prompts', () => {
    const stages = ['runDiscover', 'runSelect', 'runFetch', 'shortlistOf', 'loadPublishedIndex', 'emptyPublished', 'selectSystem', 'buildSelectUser'];
    const extraction = ['locateQuote', 'claimProblems', 'runExtract', 'extractReplySchema', 'kindOfSnapshot', 'extractSystem', 'buildExtractUser'];
    const assembly = ['slugFromTitle', 'ComposeReply', 'ReplySentence', 'assembleDraft', 'finishDraft'];
    const composition = ['runCompose', 'gateContextOf', 'composeSystem', 'buildComposeUser', 'provenance', 'PLACE'];
    const verification = ['verifyPlanOf', 'VerifyReply', 'aggregateVerdicts', 'runVerifier', 'verifySystem', 'buildVerifyUser'];
    const revision = ['runVerify', 'reviseDraft', 'problemsOf', 'reviseReplySchema', 'reviseSystem', 'buildReviseUser'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision]) {
      expect(entry).not.toHaveProperty(name);
    }
  });
});
