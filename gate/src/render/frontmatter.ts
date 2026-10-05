import { z } from 'zod';
import { BEATS, CATEGORY_VOCAB, DESK_AUTHOR_NAME } from '../constants';

const isBeat = (category: string): boolean => (BEATS as readonly string[]).includes(category);

/**
 * The frontmatter block of a news piece, as the content contract defines it
 * and as the renderer writes it. The site's `news` collection uses this same
 * schema, so a piece the renderer writes is a piece the site accepts, and a
 * hand-edited key the contract does not know is a build error.
 *
 * It says the same as check G1 (gate/test/frontmatter-consistency.test.ts
 * runs both on the same drafts): the title and the description are not blank,
 * and the spaces around them are trimmed before their length is measured; the
 * categories are one to three different slugs from the vocabulary, and the
 * funding tag comes with a beat; the author is the Desk.
 *
 * `updatedAt` is the day a correction or a retraction was recorded for the
 * piece. It is optional and never before `publishedAt`. The site also checks
 * that it agrees with the corrections in the desk state.
 */
const Block = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).max(155),
  publishedAt: z.iso.date(),
  updatedAt: z.iso.date().optional(),
  categories: z
    .array(z.enum(CATEGORY_VOCAB))
    .min(1)
    .max(3)
    .refine((categories) => new Set(categories).size === categories.length, { message: 'a category is listed twice' })
    .refine((categories) => !categories.includes('funding') || categories.some(isBeat), {
      message: 'funding is a tag, not a beat: list the beat the story is about as well',
    }),
  format: z.literal('news'),
  featured: z.boolean(),
  author: z.strictObject({ name: z.literal(DESK_AUTHOR_NAME) }),
});

export const NewsFrontmatter = Block.refine((block) => block.updatedAt === undefined || block.updatedAt >= block.publishedAt, {
  message: 'updatedAt is before publishedAt',
  path: ['updatedAt'],
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
