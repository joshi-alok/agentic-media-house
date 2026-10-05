// Which parts of the Desk are running. The Desk is the pipeline that will write
// the site; Plan 1 builds the gate, the ledger, the renderer and the pages, and
// none of the parts below. A sentence on the site that says one of them exists
// is true only when its flag is true, so every such sentence is written by a
// function in copy.ts that takes this switchboard, and site/test/copy.test.ts
// says what each function writes for every setting.
//
// Plan 2 turns the flags on one by one, as each part really runs. Turning a
// flag on is a change to this file and to the tests that name its setting
// (copy.test.ts and, for `publishing`, the tense of the pipeline stages in
// method.test.ts); the tests fail until the copy has been checked.

export interface Live {
  /** The private store that keeps the full text of every source the Desk fetched (a Cloudflare R2 bucket). */
  evidenceStore: boolean;
  /** The independent model check (G10): a second model reads each sentence beside the passages it cites. */
  verifier: boolean;
  /** The daily schedule that starts a run. */
  scheduler: boolean;
  /**
   * The Desk writes pieces and publishes them: the pipeline that finds, fetches and writes stories, the draft
   * pull request that carries a hold to the owner, the owner's release of a held draft, and the command that
   * records a correction or a retraction.
   */
  publishing: boolean;
}

/** Nothing of the Desk runs in Plan 1. */
export const LIVE: Live = {
  evidenceStore: false,
  verifier: false,
  scheduler: false,
  publishing: false,
};
