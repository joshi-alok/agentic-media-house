import { z } from 'zod';
import { CATEGORY_VOCAB } from '../constants';

/**
 * The frontmatter block of a news piece, as the content contract defines it
 * and as the renderer writes it. The site's `news` collection uses this same
 * schema, so a piece the renderer writes is a piece the site accepts, and a
 * hand-edited key the contract does not know is a build error.
 */
export const NewsFrontmatter = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1).max(155),
  publishedAt: z.iso.date(),
  categories: z.array(z.enum(CATEGORY_VOCAB)).min(1).max(3),
  format: z.literal('news'),
  featured: z.boolean(),
  author: z.strictObject({ name: z.string().min(1) }),
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
