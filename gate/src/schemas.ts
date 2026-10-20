import { z } from 'zod';
import {
  BASES,
  CATEGORY_VOCAB,
  CHECK_IDS,
  CHECK_RESULTS,
  CLAIM_TYPES,
  CORRECTION_KINDS,
  LEDGER_SECTIONS,
  RELEASES,
  ROUTES,
  RUN_OUTCOMES,
  SENTENCE_KINDS,
  SOURCE_STATUSES,
  STATUSES,
  VALUE_KINDS,
} from './constants';

// Schemas describe SHAPE and FORMAT: ids, hashes, dates, URLs, enums, lengths.
// Whether the CONTENT is acceptable (a fact sentence cites a claim, the claim
// exists, the category is in the vocabulary, the title is not empty) is the
// gate's job. That way the gate reports it by code and the failure goes into
// a revision round, instead of dying as an unreadable schema error.

const text = z.string().min(1);
const httpUrl = z.url({ protocol: /^https?$/ });
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

/** "c-12". Claim ids are assigned by the extractor and cited by sentences. */
export const ClaimId = z.string().regex(/^c-\d+$/, 'claim id must look like c-12');

// --- Claims -----------------------------------------------------------------

export const ClaimValue = z.object({
  kind: z.enum(VALUE_KINDS),
  raw: text,
  normalised: text,
  unit: text.optional(),
});
export type ClaimValue = z.infer<typeof ClaimValue>;

export const ClaimSource = z
  .object({
    url: httpUrl,
    tier: z.union([z.literal(1), z.literal(2)]),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/, 'snapshotHash must be 64 lowercase hex characters'),
    retrievedAt: isoDateTime,
    outlet: text.optional(),
  })
  .refine((source) => source.tier !== 2 || source.outlet !== undefined, {
    message: 'outlet is required when tier is 2',
    path: ['outlet'],
  });
export type ClaimSource = z.infer<typeof ClaimSource>;

export const ClaimSpan = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    quote: z.string().min(1).max(300),
  })
  .refine((span) => span.end > span.start, {
    message: 'span.end must be greater than span.start',
    path: ['end'],
  });
export type ClaimSpan = z.infer<typeof ClaimSpan>;

export const Claim = z.object({
  id: ClaimId,
  text,
  label: text,
  type: z.enum(CLAIM_TYPES),
  source: ClaimSource,
  span: ClaimSpan,
  basis: z.enum(BASES),
  status: z.enum(STATUSES),
  values: z.array(ClaimValue),
});
export type Claim = z.infer<typeof Claim>;

// --- Sentences and drafts ---------------------------------------------------

// `claimIds` on a fact sentence may be empty here on purpose: G3 reports it.
export const FactSentence = z.object({
  kind: z.literal('fact'),
  text: z.string(),
  claimIds: z.array(z.string()),
  attributed: z.boolean().optional(),
});
export type FactSentence = z.infer<typeof FactSentence>;

export const AnalysisSentence = z.object({
  kind: z.literal('analysis'),
  text: z.string(),
  claimIds: z.array(z.string()),
});
export type AnalysisSentence = z.infer<typeof AnalysisSentence>;

// A limitation describes the metadata of one claim or of a group of claims that
// share a basis or a status, through one template. The ids are listed once each,
// in ascending order of claim number; the gate (G8) checks that.
export const LimitationSentence = z.object({
  kind: z.literal('limitation'),
  text: z.string(),
  claimIds: z.array(z.string()).min(1),
  template: z.enum(['basis', 'status']),
});
export type LimitationSentence = z.infer<typeof LimitationSentence>;

export const Sentence = z.discriminatedUnion('kind', [FactSentence, AnalysisSentence, LimitationSentence]);
export type Sentence = z.infer<typeof Sentence>;

/** A slug is lowercase letters and digits in groups separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const Draft = z.object({
  slug: z.string().regex(SLUG_PATTERN, 'slug must be lowercase kebab-case'),
  publishedAt: isoDate,
  // A list of strings only. G1 checks the slugs against CATEGORY_VOCAB.
  categories: z.array(z.string()),
  author: z.object({ name: z.string() }),
  title: Sentence,
  description: Sentence,
  opening: z.array(Sentence),
  takeaways: z.array(Sentence),
  sections: z.array(
    z.object({
      heading: z.string(),
      paragraphs: z.array(z.array(Sentence)),
    }),
  ),
  limitations: z.array(LimitationSentence),
});
export type Draft = z.infer<typeof Draft>;

// --- Ledger -----------------------------------------------------------------

export const LedgerSentence = z.object({
  index: z.number().int().nonnegative(),
  section: z.enum(LEDGER_SECTIONS),
  // The paragraph the sentence is in, counted from 0 within its section (see LocatedSentence in sentences.ts).
  // With the text, the claims and the order of the ledger it is all that renderBody needs to write the article's body.
  paragraph: z.number().int().nonnegative(),
  heading: z.string().optional(),
  kind: z.enum(SENTENCE_KINDS),
  text: z.string(),
  claimIds: z.array(z.string()),
  // Present, and true, only on a fact sentence that the composer marked as an
  // attribution to another outlet (check G6). The page labels it "Unconfirmed."
  attributed: z.boolean().optional(),
});
export type LedgerSentence = z.infer<typeof LedgerSentence>;

export const LedgerEntry = z.object({
  schemaVersion: z.literal(1),
  slug: z.string().min(1),
  runId: text,
  publishedAt: isoDate,
  title: z.string().min(1),
  categories: z.array(z.string()),
  claims: z.array(Claim),
  // Claim ids in the order the body first cites them.
  order: z.array(ClaimId),
  sentences: z.array(LedgerSentence),
  gate: z.object({
    route: z.enum(ROUTES),
    checks: z.record(z.enum(CHECK_IDS), z.enum(CHECK_RESULTS)),
    holdReasons: z.array(z.string()),
    // The notes of the gate: findings that did not block the piece, by code and place. The receipts page lists them in words.
    // A ledger written before notes existed has none.
    warnings: z.array(z.object({ code: z.string().min(1), where: z.string().optional() })).default([]),
  }),
  // How the piece came to be published; set by the pipeline. The receipts page says it in words.
  release: z.enum(RELEASES).optional(),
  // Filled in by the desk when the model verifier (G10) has run.
  verifier: z
    .object({
      model: text,
      passed: z.boolean(),
      notes: z.array(z.string()),
    })
    .optional(),
  sources: z.array(ClaimSource),
}).superRefine((entry, context) => {
  // The receipts page prints the release in words, so it must not contradict what the gate decided.
  if (entry.release === 'auto' && entry.gate.route !== 'publish') {
    context.addIssue({ code: 'custom', path: ['release'], message: 'a piece published by the gate without a human needs a gate route of publish' });
  }
  if (entry.release === 'owner' && entry.gate.route === 'publish') {
    context.addIssue({ code: 'custom', path: ['release'], message: 'a piece released by the owner is one the gate did not clear, so its route is not publish' });
  }
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

// --- Desk state -------------------------------------------------------------

export const DeskState = z.object({
  lastRun: z
    .object({
      at: isoDateTime,
      outcome: z.enum(RUN_OUTCOMES),
      runId: text,
      slug: z.string().nullable(),
    })
    .nullable(),
  holds: z.array(
    z.object({
      at: isoDateTime,
      categories: z.array(z.string()),
      reasons: z.array(z.string()),
      prUrl: httpUrl.optional(),
      // What the Desk remembers of the story that it held, so that the next run does not hold it again while its pull request is open: the slug of the held piece and the
      // address of the story as Discover saw it. Both are optional, because a hold that was recorded before they existed has neither. The holds page of the site shows neither.
      slug: text.optional(),
      sourceUrl: httpUrl.optional(),
    }),
  ),
  corrections: z.array(
    z.object({
      at: isoDateTime,
      slug: text,
      kind: z.enum(CORRECTION_KINDS),
      note: text,
    }),
  ),
});
export type DeskState = z.infer<typeof DeskState>;

// --- sources.yml ------------------------------------------------------------

// The registry is edited by hand, so every object is strict: a typo such as
// `statuss:` is an error, not a silently dropped key.

// A tier-1 entry. The url must be a real http(s) URL unless the status is
// "n/a", where it may be a sentence (the funding "company announcement" entry).
const PrimaryEntry = z
  .strictObject({
    name: text,
    url: text,
    status: z.enum(SOURCE_STATUSES),
    note: text.optional(),
  })
  .refine((entry) => entry.status === 'n/a' || httpUrl.safeParse(entry.url).success, {
    message: 'url must be an http(s) URL unless status is n/a',
    path: ['url'],
  });

// A tier-2 entry: used to discover stories, never to write from.
const SecondaryEntry = z.strictObject({
  name: text,
  feed: httpUrl,
  status: z.enum(SOURCE_STATUSES),
  beats: z.array(z.enum(CATEGORY_VOCAB)).min(1),
  note: text.optional(),
});

export const SourcesRegistry = z.strictObject({
  primary: z.strictObject({
    companies: z.record(text, z.array(PrimaryEntry)),
    research: z.array(PrimaryEntry),
    standards: z.array(PrimaryEntry),
    funding: z.array(PrimaryEntry),
    events: z.array(PrimaryEntry),
  }),
  secondary: z.array(SecondaryEntry),
  bar: z.strictObject({
    publish_if_any: z.array(text),
    do_not_publish: z.array(text),
    quiet_day_fallback: z.array(text),
  }),
});
export type SourcesRegistry = z.infer<typeof SourcesRegistry>;
