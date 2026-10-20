/**
 * The name of the publication, spelled as every reader-facing string spells it. The site, the feed, the structured
 * data and the prompts of the Desk take it from here and never write it out themselves.
 */
export const PUBLICATION_NAME = 'Agentic Media House';

/** The name in capitals: the wordmark in the header of the site and on the fact card. */
export const PUBLICATION_WORDMARK = 'AGENTIC MEDIA HOUSE';

/** The name every piece is published under: the publication and the word Desk. G1 rejects any other author, and the frontmatter schema accepts no other. */
export const DESK_AUTHOR_NAME = 'Agentic Media House Desk';

/**
 * The few words after the Desk's name in the byline of an article. It says how a
 * piece is made and claims nothing that does not exist yet: it must not say the
 * piece is "verified" while the model verifier (G10) is not running. The
 * wording is the owner's to confirm; change it here and nowhere else.
 */
export const DESK_BYLINE_LABEL = 'automated, with sources linked';

/** The seven beats of the publication, from the design of the blog-first redesign (AI agents in crypto). A closed vocabulary. */
export const BEATS = [
  'payments-commerce',
  'identity-trust',
  'wallets-keys',
  'protocols-standards',
  'agent-infrastructure',
  'security-incidents',
  'policy-regulation',
] as const;
export type Beat = (typeof BEATS)[number];

/** Cross-cutting tags. `funding` is the only one; it rides along with a beat. */
export const CROSS_TAGS = ['funding'] as const;
export type CrossTag = (typeof CROSS_TAGS)[number];

/** Every slug that `categories` may contain: the beats plus the cross tags. */
export const CATEGORY_VOCAB = [...BEATS, ...CROSS_TAGS] as const;
export type Category = (typeof CATEGORY_VOCAB)[number];

/**
 * Where a claim's figure came from. `reported` is for a claim whose only source is another outlet
 * (a tier-2 claim): G6 requires it there and refuses it anywhere else.
 */
export const BASES = [
  'docs',
  'announcement',
  'briefing',
  'paper',
  'filing',
  'standard',
  'measured',
  'demo',
  'reported',
] as const;
export type Basis = (typeof BASES)[number];

/**
 * Bases that need no "What we couldn't verify" section: the source is a filing,
 * a standard, a paper or a measurement, not a project's or a company's own claim. `reported` is
 * never safe: what another outlet reports is, by its nature, not checked here.
 */
export const SAFE_BASES = ['filing', 'standard', 'paper', 'measured'] as const satisfies readonly Basis[];
export type SafeBasis = (typeof SAFE_BASES)[number];

/** How far a capability has got, as the source states it. */
export const STATUSES = ['demonstrated', 'deployed', 'planned', 'unspecified'] as const;
export type Status = (typeof STATUSES)[number];

export const CLAIM_TYPES = ['number', 'date', 'name', 'spec', 'quote', 'event'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

/** The kinds of token a claim can license in a sentence. */
export const VALUE_KINDS = ['number', 'date', 'name'] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

export const SENTENCE_KINDS = ['fact', 'analysis', 'limitation'] as const;
export type SentenceKind = (typeof SENTENCE_KINDS)[number];

/** The parts of a piece a ledger sentence can belong to. */
export const LEDGER_SECTIONS = ['title', 'description', 'opening', 'takeaways', 'body', 'limitations'] as const;
export type LedgerSection = (typeof LEDGER_SECTIONS)[number];

/** The deterministic checks. G10, the model verifier, is applied by the desk, not the gate. */
export const CHECK_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_RESULTS = ['pass', 'fail'] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

/** What the gate decides: publish, send back for revision, or hold for the owner. */
export const ROUTES = ['publish', 'revise', 'hold'] as const;
export type Route = (typeof ROUTES)[number];

/**
 * How a published piece got out: `auto` when the gate cleared it and nobody was asked,
 * `owner` when it was held (a blocker stood after the rounds of revision, or the model check did not clear it) and the owner released it. The pipeline sets it.
 */
export const RELEASES = ['auto', 'owner'] as const;
export type Release = (typeof RELEASES)[number];

export const RUN_OUTCOMES = ['published', 'no-story', 'held', 'failed'] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/**
 * Why the model check (G10, which the Desk runs and the gate does not) held a piece, as the Desk records it in a hold, beside the failure
 * codes and the hold reasons of the gate: a sentence or a heading the passages do not entail, one the verifier could not judge, a claim whose basis
 * or status its passage does not support, and an item the verifier gave no verdict on. The site gives each a label, and a test there fails if one has none.
 */
export const VERIFIER_REASONS = ['G10_NOT_ENTAILED', 'G10_AMBIGUOUS', 'G10_LABEL_UNSUPPORTED', 'G10_NOT_JUDGED'] as const;
export type VerifierReason = (typeof VERIFIER_REASONS)[number];

export const CORRECTION_KINDS = ['correction', 'retraction'] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

/** Status values in sources.yml. The desk sets `verified` once it has fetched a source. */
export const SOURCE_STATUSES = ['verified', 'unverified', 'blocked', 'n/a'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/**
 * Hosts where many different people publish. An address on one of them is the page of a project only below a path that `sources.yml` names
 * (`https://github.com/coinbase/x402`), never as a whole host: not every account on GitHub is the project.
 */
export const SHARED_HOSTS = [
  'github.com',
  'gist.github.com',
  'raw.githubusercontent.com',
  'medium.com',
  'mirror.xyz',
  'substack.com',
  'hackmd.io',
  'notion.site',
  'paragraph.xyz',
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  'discord.com',
  't.me',
  'reddit.com',
  'linkedin.com',
  'facebook.com',
  'warpcast.com',
  'docs.google.com',
  'drive.google.com',
] as const;
