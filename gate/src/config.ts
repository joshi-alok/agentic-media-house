/** An inclusive range of counts. */
export interface Range {
  min: number;
  max: number;
}

/** The thresholds the checks read. Every one is a value to tune, not a rule to rewrite. */
export interface GateConfig {
  /** G7: the largest share of a piece's sentences that may be analysis. */
  analysisShareCap: number;
  /** G2: words in the opening paragraph. */
  openingWords: Range;
  /** G2: number of key-takeaway bullets. */
  takeaways: Range;
  /** G2: words in the body (opening, takeaways, sections and limitations). */
  bodyWords: Range;
  /** G1: characters in the description. */
  descriptionMax: number;
  /** G2: characters in a section heading. */
  headingMax: number;
  /** Characters in a claim's quoted span. The schema allows 300; the extractor stage enforces this. */
  spanMax: number;
  /** G9: a new title whose word overlap with a recent title reaches this is a near-duplicate. */
  titleSimilarityThreshold: number;
  /** G9: a title counts as recent when it was published on the draft's day or up to this many days before it. */
  titleWindowDays: number;
  /** G9: phrases that must not appear anywhere in the piece. Lowercase, plain apostrophes. */
  bannedPhrases: readonly string[];
}

/** Filler and hype that the house style does not allow. Compared in lowercase. */
export const DEFAULT_BANNED_PHRASES: readonly string[] = [
  "in today's fast-moving world of robotics",
  'game-changer',
  'game changer',
  'revolutionary',
  'groundbreaking',
  'unprecedented',
  'cutting-edge',
  'ever-evolving',
  'delve',
  "it's worth noting",
  'in the realm of',
  'paves the way',
];

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ACRONYMS = ['ai', 'ceo', 'cto', 'us', 'uk', 'eu', 'un'];

/**
 * Capitalised words that G4 accepts without a claim listing them as a name:
 * month and weekday names and a few common acronyms. Lowercase, because G4
 * compares lowercased name tokens. Add to it when a false positive keeps
 * sending good drafts back.
 */
export const DEFAULT_NAME_ALLOW_LIST: ReadonlySet<string> = new Set([...MONTHS, ...WEEKDAYS, ...ACRONYMS]);

/** A fresh copy of the default thresholds. A new object each time, so no caller can change another's defaults. */
export function defaultConfig(): GateConfig {
  return {
    analysisShareCap: 0.2,
    openingWords: { min: 40, max: 60 },
    takeaways: { min: 3, max: 5 },
    bodyWords: { min: 600, max: 850 },
    descriptionMax: 155,
    headingMax: 80,
    spanMax: 300,
    titleSimilarityThreshold: 0.6,
    titleWindowDays: 14,
    bannedPhrases: DEFAULT_BANNED_PHRASES,
  };
}

/** The title of a piece that has been published, and the day it was published (YYYY-MM-DD). */
export interface RecentTitle {
  title: string;
  publishedAt: string;
}

/** Everything a check needs besides the draft and the claims. */
export interface GateContext {
  config: GateConfig;
  /** Slugs of pieces already published (G9 rejects a slug collision). */
  publishedSlugs: ReadonlySet<string>;
  /**
   * Titles of published pieces with their dates. G9 rejects a title that is a
   * near-duplicate of one published within `config.titleWindowDays` before the
   * draft's own date. The list may hold older titles too; they are ignored.
   */
  recentTitles: readonly RecentTitle[];
  /** Lowercase words G4 accepts as names without a claim. */
  nameAllowList: ReadonlySet<string>;
}

export interface ContextOverrides {
  /** Merged over the default thresholds, field by field. */
  config?: Partial<GateConfig>;
  publishedSlugs?: Iterable<string>;
  recentTitles?: readonly RecentTitle[];
  /** Replaces the default allow-list. Spread DEFAULT_NAME_ALLOW_LIST into it to extend the default. */
  nameAllowList?: Iterable<string>;
}

/** A fresh context with the default thresholds and allow-list and nothing published, plus any overrides. */
export function defaultContext(overrides: ContextOverrides = {}): GateContext {
  return {
    config: { ...defaultConfig(), ...overrides.config },
    publishedSlugs: new Set(overrides.publishedSlugs ?? []),
    recentTitles: overrides.recentTitles ?? [],
    nameAllowList: new Set([...(overrides.nameAllowList ?? DEFAULT_NAME_ALLOW_LIST)].map((word) => word.toLowerCase())),
  };
}
