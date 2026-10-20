import { CHECK_IDS, renderDraft } from '@robywire/gate';
import type { GateResult } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import type { GitCli } from '../../src/run/git';
import type { PieceFiles } from '../../src/run/target';
import { placePiece } from './pieces';
import { initRepo } from './repo';
import { makeSite } from './site';

// A piece that was published, for the tests of what happens to a piece afterwards. It is the golden piece of the gate package, rendered as Publish renders a piece the gate
// cleared (`release: 'auto'`), and put in a checkout of the site that is a real repository with that one commit.

/** What the gate says of a piece that it clears: every check passed, route publish. */
export const CLEARED: GateResult = { route: 'publish', failures: [], warnings: [], holdReasons: [], checks: Object.fromEntries(CHECK_IDS.map((id) => [id, 'pass'])) as GateResult['checks'] };

const META = { runId: '2026-10-04-043100', gate: CLEARED, verifier: { model: 'claude-sonnet-5-5', passed: true, notes: [] }, release: 'auto' as const };

/** The day that the golden piece was published. */
export const PUBLISHED_ON = GOLDEN_DRAFT.publishedAt;

/** The slug of the golden piece. */
export const PUBLISHED_SLUG = GOLDEN_DRAFT.slug;

/** The two files of the golden piece, as Publish writes them. `updatedAt` is for the file that the renderer would have written had the piece been corrected that day. */
export function publishedPiece(updatedAt?: string): PieceFiles {
  const { mdx, ledger } = renderDraft(GOLDEN_DRAFT, GOLDEN_CLAIMS, { ...META, ...(updatedAt === undefined ? {} : { updatedAt }) });
  return { slug: GOLDEN_DRAFT.slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` };
}

/** A checkout of the site in a new folder with the golden piece published in it, committed on `main` as `start`; and the `GitCli` that commits there. */
export function publishedSite(scratch: () => string): { repoDir: string; cli: GitCli; piece: PieceFiles } {
  const repoDir = makeSite(scratch());
  const piece = publishedPiece();
  placePiece(repoDir, piece);
  return { repoDir, cli: initRepo(repoDir), piece };
}
