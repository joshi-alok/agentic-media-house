import { CATEGORY_VOCAB, DESK_AUTHOR_NAME, buildLimitations, citedClaims, disambiguateSlug } from '@robywire/gate';
import type { Claim, Draft } from '@robywire/gate';
import { z } from 'zod';
import type { StageContext } from './context';

// What the composer writes, and what code adds to it. The model writes sentences that cite claim ids and says which
// categories the piece is in; it does not write the slug, the date, the author or the limitation sentences, and it cannot:
// the schema of its reply has no place for them and refuses a reply that tries. Code writes them, the way the design says
// (section 6.5): the slug from the title, the date of the run, the name of the Desk, and the "What we couldn't verify"
// sentences from the claims the piece cites, through the gate's own templates.

/** The longest slug that a title gives. The date that `disambiguateSlug` may add after it is not counted. */
export const SLUG_MAX_LENGTH = 80;

/** Apostrophes, straight and curly: they are taken out of a word and do not split it ("Brindle's" is "brindles"). */
const APOSTROPHES = new RegExp(`['${String.fromCharCode(0x2018, 0x2019)}]`, 'g');

/**
 * The slug of a title: its letters and digits, in lowercase ASCII, in words joined by single hyphens. A letter with an accent
 * is the letter without it (`cafe` for the word with an acute e), an apostrophe is dropped, every other mark and every
 * character that is not a letter or a digit of ASCII (an emoji, a letter of another alphabet) separates words and is lost. A slug longer than
 * SLUG_MAX_LENGTH is cut at the last hyphen that fits, so that it does not end in half a word; one long word is cut at the limit. A slug may start with a
 * digit. A title with no letter or digit in it has no slug, and that is an error: the run fails closed.
 */
export function slugFromTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug === '') throw new Error(`slugFromTitle: the title ${JSON.stringify(title)} has no letter or digit to make a slug from`);
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH + 1);
  const hyphen = cut.lastIndexOf('-');
  return hyphen > 0 ? cut.slice(0, hyphen) : cut.slice(0, SLUG_MAX_LENGTH);
}

// --- The reply of the composer ------------------------------------------------------------------------------------

// The shape and nothing more: whether a sentence cites a claim that exists, starts with a capital, or is allowed where it
// stands is the gate's to say, by code, so that a failure goes back to be revised and does not end the run as a bad reply.
// Every object is strict, so a field that the Desk does not write (a limitation, an author, a slug) is refused.

const FactReply = z.strictObject({ kind: z.literal('fact'), text: z.string(), claimIds: z.array(z.string()), attributed: z.boolean().optional() });
const AnalysisReply = z.strictObject({ kind: z.literal('analysis'), text: z.string(), claimIds: z.array(z.string()) });

/** A sentence as the composer writes it: a fact (which may be an attribution to another outlet) or analysis. Never a limitation. */
export const ReplySentence = z.discriminatedUnion('kind', [FactReply, AnalysisReply]);
export type ReplySentence = z.infer<typeof ReplySentence>;

/**
 * What the composer replies: the categories of the piece (each one of the vocabulary, or the reply is refused), the title and
 * the description as sentences, the opening, the key takeaways, and the sections, each with a heading and paragraphs of sentences.
 */
export const ComposeReply = z.strictObject({
  categories: z.array(z.enum(CATEGORY_VOCAB)),
  title: ReplySentence,
  description: ReplySentence,
  opening: z.array(ReplySentence),
  takeaways: z.array(ReplySentence),
  sections: z.array(z.strictObject({ heading: z.string(), paragraphs: z.array(z.array(ReplySentence)) })),
});
export type ComposeReply = z.infer<typeof ComposeReply>;

// --- The draft ----------------------------------------------------------------------------------------------------

/** What a draft is before code adds its slug, its date, its author and its limitations. */
export type DraftBody = Omit<Draft, 'slug' | 'publishedAt' | 'author' | 'limitations'>;

/**
 * The draft that is a body and what code writes: the slug (`slugFromTitle` of the title, then `disambiguateSlug` against the slugs
 * already published, which fails when all four candidates are taken), the date of the run, the Desk as the author, and the limitation
 * sentences that `buildLimitations` makes of the claims the body cites. The arguments are not changed.
 */
export function finishDraft(body: DraftBody, claims: readonly Claim[], ctx: Pick<StageContext, 'date' | 'published'>): Draft {
  const slug = disambiguateSlug(slugFromTitle(body.title.text), ctx.date, new Set(ctx.published.slugs));
  const draft: Draft = { ...structuredClone(body), slug, publishedAt: ctx.date, author: { name: DESK_AUTHOR_NAME }, limitations: [] };
  draft.limitations = buildLimitations(citedClaims(draft, claims));
  return draft;
}

/** The draft of a reply of the composer: its sentences as they are, and what code adds (see `finishDraft`). */
export function assembleDraft(reply: ComposeReply, claims: readonly Claim[], ctx: Pick<StageContext, 'date' | 'published'>): Draft {
  return finishDraft(reply, claims, ctx);
}
