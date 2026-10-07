import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { parse } from 'yaml';
import { sitePaths } from '../../src/run/target';
import type { PieceFiles } from '../../src/run/target';

// What the tests of pieces share: putting the two files of a piece into a checkout of the site, and reading the pieces of a checkout back the way that the site
// reads them (the collections of Astro: the frontmatter checked against the schema, the body below it, and the ledger checked against its schema), so that a test can
// hand them to `matchPieces` of the site, which is the check that a piece and its ledger belong together.

/** The text of a piece split into its frontmatter, checked against the schema of the site, and the body below it. */
export function splitPiece(mdx: string): { data: NewsFrontmatter; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(mdx);
  if (match === null) throw new Error('splitPiece: the text has no frontmatter');
  return { data: NewsFrontmatter.parse(parse(match[1] as string)), body: (match[2] as string).replace(/^\n/, '') };
}

/** Write the two files of a piece into the content folders of the site in `repoDir`. */
export function placePiece(repoDir: string, piece: PieceFiles): void {
  const paths = sitePaths();
  for (const [file, text] of [
    [paths.newsFile(piece.slug), piece.mdx],
    [paths.ledgerFile(piece.slug), piece.ledger],
  ] as const) {
    mkdirSync(path.dirname(path.join(repoDir, file)), { recursive: true });
    writeFileSync(path.join(repoDir, file), text);
  }
}

/** The pieces and the ledgers in the content folders of the site in `repoDir`, as the site hands them to `matchPieces`: each with its id (the slug) and its data. */
export function readPieces(repoDir: string) {
  const paths = sitePaths();
  const news = readdirSync(path.join(repoDir, paths.newsDir))
    .filter((name) => name.endsWith('.mdx'))
    .sort()
    .map((name) => {
      const { data, body } = splitPiece(readFileSync(path.join(repoDir, paths.newsDir, name), 'utf8'));
      return { id: name.slice(0, -'.mdx'.length), data, body };
    });
  const ledgers = readdirSync(path.join(repoDir, paths.ledgerDir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ id: name.slice(0, -'.json'.length), data: LedgerEntry.parse(JSON.parse(readFileSync(path.join(repoDir, paths.ledgerDir, name), 'utf8'))) }));
  return { news, ledgers };
}
