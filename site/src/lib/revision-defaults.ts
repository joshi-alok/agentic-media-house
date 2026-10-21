// The defaults of the two settings of the Desk that decide how many times a draft goes back to the composer: `maxRevisionRounds` and `extraRevisionRounds` in desk/src/config.ts. The site does not
// depend on the Desk (it builds without it), so it cannot import them, and it holds a copy here, in one place and in a file that imports nothing, so that a test of the Desk can import it. The
// method page counts the rounds of the run that desk.config.yml sets as its settings give them (desk.config.yml, read by run-config.ts) laid over these. desk/test/production-config.test.ts compares
// both with `defaultConfig()` of the Desk, so that a change of a default there fails a test here.

/** The default of `maxRevisionRounds`: how many times a draft goes back to the composer before the extra rounds. */
export const DEFAULT_MAX_REVISION_ROUNDS = 2;

/** The default of `extraRevisionRounds`: how many more times it goes back while a problem that a sentence or a heading can mend is still there. */
export const DEFAULT_EXTRA_REVISION_ROUNDS = 1;
