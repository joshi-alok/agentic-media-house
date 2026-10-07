import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DeskState } from '@robywire/gate';
import { writeFileAtomic } from './atomic';
import { assertNothingLost, readDeskState, updateDeskState } from './desk-state';
import { MAIN_BRANCH } from './git';
import type { GitTarget } from './git';

// Where a run puts what it made. A run changes the site in one way: it may add a piece (an `.mdx` file and a ledger `.json` file with the
// same slug) and it changes the desk state, and all of that goes into one commit. A `PublishTarget` is that, so that the stages do not know
// whether they are writing to the real checkout of the site or only going through the motions. `SiteTarget` writes and commits; `DryTarget`
// runs the same checks and writes nothing (a dry run, `desk run --dry`). A held piece is the one thing that is not committed to the checkout: its two files go
// on a branch of their own, made beside the checkout, which is pushed for the owner to merge or close (`commitPieceToBranch`).

/** The folders and the files of the site that the Desk uses, as paths below the repository (the folder of the site is `site`). */
export interface SitePaths {
  newsDir: string;
  ledgerDir: string;
  stateFile: string;
  newsFile(slug: string): string;
  ledgerFile(slug: string): string;
}

export function sitePaths(siteDir = 'site'): SitePaths {
  const newsDir = `${siteDir}/src/content/news`;
  const ledgerDir = `${siteDir}/src/content/ledger`;
  return {
    newsDir,
    ledgerDir,
    stateFile: `${siteDir}/src/data/desk-state.json`,
    newsFile: (slug) => `${newsDir}/${slug}.mdx`,
    ledgerFile: (slug) => `${ledgerDir}/${slug}.json`,
  };
}

/** The two files of a piece: the text of the `.mdx` file and the text of the ledger, as they are written, byte for byte. */
export interface PieceFiles {
  slug: string;
  mdx: string;
  ledger: string;
}

/** What a run changes: a piece, when it published one; the change of the desk state; and the subject of the commit. */
export interface TargetChange {
  piece?: PieceFiles;
  state: (state: DeskState) => DeskState;
  message: string;
}

/** What was done: the id of the commit (null when nothing was written) and the files the change covers, as paths below the repository. */
export interface TargetResult {
  commit: string | null;
  files: string[];
}

/** A piece to put on a branch of its own: the name of the branch, the two files of the piece, and the subject of the one commit. */
export interface BranchChange {
  branch: string;
  piece: PieceFiles;
  message: string;
}

/** The commit that the piece is in, on its branch, and the files it covers, as paths below the repository. */
export interface BranchResult {
  commit: string;
  files: string[];
}

export interface PublishTarget {
  /** True for a target that writes nothing. */
  readonly dry: boolean;
  /**
   * Check, before a run spends anything, that the places it writes to are in order: the desk state can be read and, for a target that writes, nothing
   * in them has a change that is not committed. Throws when they are not.
   */
  preflight(): Promise<void>;
  /**
   * Write the piece (if there is one), change the desk state and commit it all. Refuses, before anything is written, when the slug is taken,
   * when the places it writes to have changes that are not committed, or when the desk state cannot be read or the change would lose a hold or a
   * correction.
   */
  apply(change: TargetChange): Promise<TargetResult>;
  /**
   * Put the two files of a piece on a new branch, in one commit made from the commit that the checkout is on, and say which commit. The checkout is not changed: nothing is
   * written to it, and it stays on the branch it is on. Refuses, before anything is made, when the checkout is not on `main` (the pull request of the branch is into `main`, and
   * a branch made from another would carry that branch's commits), when the slug is not a plain slug, and when the files are already there. A dry target makes no branch.
   */
  commitPieceToBranch(change: BranchChange): Promise<BranchResult>;
  /** Remove a branch that `commitPieceToBranch` made, when what had to follow it failed. */
  dropBranch(branch: string): Promise<void>;
}

/** A slug is a file name, so it is held to the shape that the renderer and the gate give every slug: nothing that could name another folder. */
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `slug` is lowercase letters and digits joined by single hyphens, which is the only kind of slug that is safe as a file name. */
export function isPlainSlug(slug: string): boolean {
  return PLAIN_SLUG.test(slug);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * What both targets check before anything is written, and what the change covers: the slug is plain and not taken, the desk state can be read, and the
 * change does not lose anything from it. Returns the files of the change, as paths below the repository, the piece first.
 */
async function check(repoDir: string, paths: SitePaths, change: TargetChange): Promise<string[]> {
  const files: string[] = [];
  if (change.piece !== undefined) {
    const { slug } = change.piece;
    if (!isPlainSlug(slug)) throw new Error(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens), and a slug is a file name`);
    for (const file of [paths.newsFile(slug), paths.ledgerFile(slug)]) {
      if (await exists(path.join(repoDir, file))) throw new Error(`${file} is already there, so the slug "${slug}" is taken: the Desk never overwrites a piece`);
      files.push(file);
    }
  }
  const before = await readDeskState(path.join(repoDir, paths.stateFile));
  assertNothingLost(before, change.state(structuredClone(before)), paths.stateFile);
  files.push(paths.stateFile);
  return files;
}

/** Writes into a checkout of the site and commits with git. */
export class SiteTarget implements PublishTarget {
  readonly dry = false;
  private readonly paths: SitePaths;

  constructor(
    private readonly repoDir: string,
    private readonly git: GitTarget,
    siteDir = 'site',
  ) {
    this.paths = sitePaths(siteDir);
  }

  /** Refuse when any of `watched` has a change that is not committed. */
  private async assertClean(watched: string[]): Promise<void> {
    if (!(await this.git.isClean(watched))) {
      throw new Error(`the site has changes that are not committed (${watched.join(', ')}), so the Desk does not write there: commit or discard them first`);
    }
  }

  async preflight(): Promise<void> {
    await readDeskState(path.join(this.repoDir, this.paths.stateFile));
    await this.assertClean([this.paths.stateFile, this.paths.newsDir, this.paths.ledgerDir]);
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    const files = await check(this.repoDir, this.paths, change);

    // What the run is about to change must have nothing else of anyone's in it: git is asked before anything is written.
    await this.assertClean(change.piece === undefined ? [this.paths.stateFile] : [this.paths.stateFile, this.paths.newsDir, this.paths.ledgerDir]);

    const stateFile = path.join(this.repoDir, this.paths.stateFile);
    const original = await readFile(stateFile, 'utf8');
    const written: string[] = [];
    try {
      await updateDeskState(stateFile, change.state);
      if (change.piece !== undefined) {
        const { slug, mdx, ledger } = change.piece;
        for (const [file, text] of [
          [this.paths.newsFile(slug), mdx],
          [this.paths.ledgerFile(slug), ledger],
        ] as const) {
          await writeFileAtomic(path.join(this.repoDir, file), text);
          written.push(file);
        }
      }
      return { commit: await this.git.commit(files, change.message), files };
    } catch (error) {
      // A commit that fails leaves the checkout as it was found: the new files are removed and the desk state is put back.
      for (const file of written) await rm(path.join(this.repoDir, file), { force: true });
      await writeFileAtomic(stateFile, original);
      throw error;
    }
  }

  async commitPieceToBranch(change: BranchChange): Promise<BranchResult> {
    const { slug, mdx, ledger } = change.piece;
    if (!isPlainSlug(slug)) throw new Error(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens), and a slug is a file name`);
    const on = await this.git.currentBranch();
    if (on !== MAIN_BRANCH) {
      throw new Error(`the Desk makes the branch of a pull request from ${MAIN_BRANCH}, but the checkout is ${on === undefined ? 'on no branch' : `on ${on}`}, so the branch would carry commits that are not the piece's`);
    }
    const files = [this.paths.newsFile(slug), this.paths.ledgerFile(slug)];
    for (const file of files) {
      if (await exists(path.join(this.repoDir, file))) throw new Error(`${file} is already there, so the slug "${slug}" is taken: the Desk never overwrites a piece`);
    }
    const commit = await this.git.commitToNewBranch(
      change.branch,
      [
        { path: files[0] as string, text: mdx },
        { path: files[1] as string, text: ledger },
      ],
      change.message,
    );
    return { commit, files };
  }

  async dropBranch(branch: string): Promise<void> {
    await this.git.deleteBranch(branch);
  }
}

/** Goes through the checks of `SiteTarget` that need no git and writes nothing, so that a dry run says what a real run would have done. */
export class DryTarget implements PublishTarget {
  readonly dry = true;
  private readonly paths: SitePaths;

  constructor(
    private readonly repoDir: string,
    siteDir = 'site',
  ) {
    this.paths = sitePaths(siteDir);
  }

  async preflight(): Promise<void> {
    await readDeskState(path.join(this.repoDir, this.paths.stateFile));
  }

  async apply(change: TargetChange): Promise<TargetResult> {
    return { commit: null, files: await check(this.repoDir, this.paths, change) };
  }

  async commitPieceToBranch(_change: BranchChange): Promise<BranchResult> {
    throw new Error('a dry run makes no branch');
  }

  async dropBranch(_branch: string): Promise<void> {
    throw new Error('a dry run makes no branch');
  }
}
