import { BEATS, CATEGORY_VOCAB, CROSS_TAGS, DESK_AUTHOR_NAME } from '../constants';
import type { Check, Failure } from '../gate';
import { dayNumber } from '../normalise';
import { SLUG_PATTERN } from '../schemas';

/** Every failure code G1 can report. */
export const G1_CODES = [
  'G1_TITLE_EMPTY',
  'G1_DESCRIPTION_EMPTY',
  'G1_DESCRIPTION_TOO_LONG',
  'G1_BAD_DATE',
  'G1_SLUG_FORMAT',
  'G1_CATEGORY_COUNT',
  'G1_CATEGORY_UNKNOWN',
  'G1_CATEGORY_NO_BEAT',
  'G1_AUTHOR_MISSING',
  'G1_AUTHOR_NOT_DESK',
] as const;

const MIN_CATEGORIES = 1;
const MAX_CATEGORIES = 3;

const isBeat = (category: string) => (BEATS as readonly string[]).includes(category);
const isCrossTag = (category: string) => (CROSS_TAGS as readonly string[]).includes(category);
const isKnown = (category: string) => (CATEGORY_VOCAB as readonly string[]).includes(category);

/**
 * G1, frontmatter: the fields the site builds from the draft (title,
 * description, date, slug, categories, author) are present and well formed, and
 * the author is the Desk. `NewsFrontmatter` (render/frontmatter.ts) is what the
 * site checks at build time; gate/test/frontmatter-consistency.test.ts keeps
 * the two from drifting apart.
 */
export const checkG1: Check = ({ draft }, ctx) => {
  const failures: Failure[] = [];
  const fail = (code: string, message: string, where: string) => failures.push({ check: 'G1', code, message, where });

  if (draft.title.text.trim() === '') {
    fail('G1_TITLE_EMPTY', 'the title is empty', 'title');
  }

  const length = draft.description.text.length;
  if (draft.description.text.trim() === '') {
    fail('G1_DESCRIPTION_EMPTY', 'the description is empty: the page and search results need a one-sentence description', 'description');
  } else if (length > ctx.config.descriptionMax) {
    fail(
      'G1_DESCRIPTION_TOO_LONG',
      `the description is ${length} characters; the limit is ${ctx.config.descriptionMax}`,
      'description',
    );
  }

  if (dayNumber(draft.publishedAt) === undefined) {
    fail('G1_BAD_DATE', `publishedAt "${draft.publishedAt}" is not a real date in the form YYYY-MM-DD`, 'publishedAt');
  }

  if (!SLUG_PATTERN.test(draft.slug)) {
    fail('G1_SLUG_FORMAT', `the slug "${draft.slug}" is not lowercase letters and digits separated by single hyphens`, 'slug');
  }

  const { categories } = draft;
  if (categories.length < MIN_CATEGORIES || categories.length > MAX_CATEGORIES) {
    fail('G1_CATEGORY_COUNT', `categories must list ${MIN_CATEGORIES} to ${MAX_CATEGORIES} slugs; found ${categories.length}`, 'categories');
  } else if (new Set(categories).size !== categories.length) {
    fail('G1_CATEGORY_COUNT', 'categories lists the same slug more than once', 'categories');
  }
  for (const category of categories.filter((item) => !isKnown(item))) {
    fail('G1_CATEGORY_UNKNOWN', `the category "${category}" is not in the vocabulary (${CATEGORY_VOCAB.join(', ')})`, 'categories');
  }
  if (categories.some(isCrossTag) && !categories.some(isBeat)) {
    fail('G1_CATEGORY_NO_BEAT', 'funding is a tag, not a beat: list the beat the story is about as well', 'categories');
  }

  const author = draft.author?.name ?? '';
  if (author.trim() === '') {
    fail('G1_AUTHOR_MISSING', 'the author name is missing', 'author');
  } else if (author !== DESK_AUTHOR_NAME) {
    fail('G1_AUTHOR_NOT_DESK', `the author is "${author}", but every piece is written by the Desk: the author must be "${DESK_AUTHOR_NAME}"`, 'author');
  }

  return { failures, holdReasons: [] };
};
