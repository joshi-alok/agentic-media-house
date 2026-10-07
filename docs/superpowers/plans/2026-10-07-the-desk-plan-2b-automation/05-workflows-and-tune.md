## Plan 2b (part 5) — Workflows, tuning harness and runbook

**Goal:** the Desk has to run by itself once a day, and the site has to reach the web when it publishes, with nobody typing a command. Until now the pipeline is a program that a person starts on a machine that keeps its folders; this part makes it a **scheduled job on GitHub** and the site a **deploy to Cloudflare**, and it gives the first contact with a real model a **harness** that spends a stated amount, publishes nothing and reports every step. It also writes down, as a **runbook**, the operations that no test can do (creating the repository and the bucket, setting the secrets, the first trials, the shadow week, going live), and ends with the checklist of what is left and who does it. Everything here is built and proved offline: a workflow cannot be run on any machine but GitHub's, so the tests read each file with a YAML parser and run its small scripts in made-up repositories, and the first real run, in the runbook, is the proof.

| Task | What it does |
|---|---|
| 23 | `desk.config.yml`, the settings of the daily run (the private bucket, the real user agent, the budget; no model, no secret), and `secretsIn`, the function that the tests of every file of this part use to say that nothing in it is shaped like a key. |
| 24 | `.github/workflows/desk.yml`: the daily run at 04:30, 06:30 and 08:30 UTC and by hand, one at a time, with the secrets only in the `env` of the step that runs the Desk, the push of what the run committed, the artifacts of `runs/` for 14 days with no page text (a test lists every kind of file that a run writes), and a deploy started by hand. And `desk run --skip-if-done`, so that the second and the third start of a day do nothing when the day is done. |
| 25 | `.github/workflows/deploy.yml`: build, audit and `wrangler deploy` of the site as a Worker with static assets, with `wrangler.jsonc`, `wrangler` pinned at one exact version, and one test that reads the three workflows and `package.json` and fails when they disagree. |
| 26 | `desk tune`: the harness for the first real-model trials. It fetches real pages, sends each through Extract, Compose and Verify, prints what each step found, counts tokens (and dollars, when the settings have prices), stops at a budget of calls, and writes only below `runs/tune/`. |
| 27 | `docs/runbook.md`: thirty-four numbered operations with their commands and what to expect, and a test that holds it to the repository and runs its rewrite of the history on a made-up repository. |
| 28 | The whole check from a clean install, and the go-live checklist: what remains for milestones 5 and 6, and who does it. |

**Starting state:** Plans 1 and 2 are built, and so are parts 1 to 4 of this plan (Tasks 1 to 22): the new name, the run mechanics (a failed day is tried again, the record of a run says how it was made), the hold pull request and `desk retract`, and the private evidence store. `npm run typecheck`, `npm test`, `npm run evals:seeded` (61 of 61 cases caught), `npm run fixtures:check` and `npm run verify` pass. There is one workflow, `.github/workflows/ci.yml`, which runs the steps of `npm run verify` on every push to `main` and every pull request. There is no settings file for a real run, no workflow that runs the Desk or deploys the site, no `wrangler`, no `desk tune` and no runbook.

**Rules for every task in this part:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/desk -- test/<name>.test.ts`. Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong.
- Source files contain ASCII only. Never type a character outside ASCII into a source file, a workflow, a settings file, the README or the runbook; where a test needs one, it uses `String.fromCharCode`. After you create a file, `LC_ALL=C grep -n '[^[:print:][:space:]]' <file>` must print nothing.
- **No live call, no credential.** Nothing in this part calls a model, reads a real key, or contacts GitHub or Cloudflare. Every test gives the code a stand-in (a function with the shape of `fetch`, a scripted model, a bucket made of memory, a repository whose remote is a folder), and every key in a test is made up or built from pieces so that no file holds one. The only network use is `npm`, to install `wrangler` in Task 25; `wrangler` is run only with `--help` and `--dry-run`, with `WRANGLER_SEND_METRICS=false`, which reads files and sends nothing.
- **A workflow cannot be run here.** Where a task says that a property of a workflow is tested, it is tested by reading the file as data, and the first real run (the runbook) is what shows that it works. The plan says so where it matters; do not claim more.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task but the last ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** this part adds one package, `wrangler` `4.148.0`, as a development dependency of the root package (Task 25), installed with `--save-exact`. It was the latest version when this part was verified.

---

### Task 23: The settings of the daily run

**Files:**
- Create: `desk.config.yml`
- Create: `desk/test/support/secrets.ts` (`secretsIn`)
- Create: `desk/test/secret-shapes.test.ts`
- Create: `desk/test/production-config.test.ts`
- Modify: `README.md` (one paragraph of "The desk command")
- Modify: `desk/test/readme.test.ts`

A run that starts from a fresh checkout every day needs its settings in the checkout. `desk run` already takes a file of settings with `--config`, and `loadConfig` lays it over the defaults; this task writes the file that the daily run will use, and checks it. What it says that the defaults do not:

- **The evidence is in the bucket** (`evidence: { kind: r2 }`). With the default (`local`) the snapshots of a run would be written to a folder of the machine that ran, and a scheduled job loses its machine when it ends.
- **The Desk has a name that can be looked up.** The default user agent links to `agenticmediahouse.example`, which does not exist, and a live run is refused with it. The file links to the /method page of the live site, which is at `https://agentic-media-house.joshi-alok.workers.dev` until the owner chooses a domain.
- **The limits of a run are written down**: the folder of the runs, how many runs a day (3, one for each time the workflow starts), and the budget (24 calls, 400,000 tokens in, 60,000 tokens out, which are the defaults, written so that a change is a change of a committed file).

What it does not say, on purpose: **no model**. The models (`select`, `extract`, `compose`, `verify`) are named in `desk/src/config.ts` and nowhere else, so that changing one is one edit. **No secret**: the key of the model and the four variables that describe the bucket (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are given to the run through its environment, by the workflow of Task 24, and `loadConfig` refuses a file that carries any of them.

The file is public (the repository is), so a test reads it for anything shaped like a secret. That test needs a function that says what a secret looks like, and Tasks 24, 25 and 27 need the same function for the workflows, the Cloudflare settings and the runbook, so it is written once, here: `secretsIn(text)` in `desk/test/support/secrets.ts`. It knows the shapes of the keys of this project (an Anthropic key, an access key id, a token of GitHub, a private key, a long token that mixes capitals, small letters and digits, and forty hexadecimal digits or more). It says which kind and on which line, and never what it found, so that a test that fails does not print the secret. It is a safety net and not a proof: a secret of another shape gets through it.

- [ ] **Step 1: Write the test of `secretsIn`**

The samples in the test are built from pieces (`piece('sk', '-ant-', 'api03-', 'abc')` is the text of an Anthropic key), so that the file itself holds nothing shaped like a key.

**Create `desk/test/secret-shapes.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { secretsIn } from './support/secrets';

// The files that this repository publishes about its own running (the settings of the daily run, the two workflows, the Cloudflare settings and the runbook) must
// never hold a key. `secretsIn` is the one function that says whether a text has anything shaped like one, and the tests of those files ask it. It is a safety net
// and not a proof: a secret that looks like none of the shapes below gets through it. So these tests say exactly which shapes it knows, and that it can say yes.
//
// The samples are made here from pieces, so that this file does not itself hold a string shaped like a key, and the shapes are those of the keys of this project
// (an Anthropic key, an access key id of AWS and of R2, the secret that goes with it, a token of Cloudflare, and a token of GitHub).

const piece = (...parts: string[]): string => parts.join('');
const MIXED = piece('q8Zr', 'T1vK', 'm3Xw', 'P9cL', 'e5Jd', 'N7hB', 'y2Fs', 'U4aG', 'o6Qi', 'V0tR');

describe('secretsIn', () => {
  it('finds an Anthropic key, by its prefix', () => {
    expect(secretsIn(`key: ${piece('sk', '-ant-', 'api03-', 'abc')}`)).toEqual(['an Anthropic key (line 1)']);
  });

  it('finds an access key id of AWS or of R2, which is four letters and sixteen capitals or digits', () => {
    expect(secretsIn(`id: ${piece('AK', 'IA', 'ABCDEFGH', 'IJKLMNOP')}`)).toEqual(['an access key id (line 1)']);
    expect(secretsIn(`id: ${piece('AS', 'IA', '0123456789', 'ABCDEF')}`)).toEqual(['an access key id (line 1)']);
  });

  it('finds a token of GitHub, by its prefix', () => {
    expect(secretsIn(piece('gh', 'p_', 'a'.repeat(24)))).toEqual(['a token of GitHub (line 1)']);
    expect(secretsIn(piece('github', '_pat_', 'a'.repeat(24)))).toEqual(['a token of GitHub (line 1)']);
  });

  it('finds a private key, by its first line', () => {
    expect(secretsIn(piece('-----', 'BEGIN ', 'PRIVATE KEY', '-----'))).toEqual(['a private key (line 1)']);
  });

  it('finds a secret of forty characters or more that mixes capitals, small letters and digits, which is how the secret of an access key and a token of Cloudflare look', () => {
    expect(secretsIn(`secret: ${MIXED}`)).toEqual(['a long mixed token (line 1)']);
    expect(secretsIn(`secret: "${MIXED}"`)).toEqual(['a long mixed token (line 1)']);
  });

  it('counts a zero as a digit: a token whose only digit is a zero is as much a secret as any other', () => {
    expect(secretsIn(`secret: ${'aBcD'.repeat(9)}e0Fg`)).toEqual(['a long mixed token (line 1)']);
    expect(secretsIn(`secret: ${'a0'.repeat(20)}`)).toEqual(['a long hexadecimal token (line 1)']);
  });

  it('finds forty hexadecimal digits or more, which is how the secret of an R2 access key looks', () => {
    expect(secretsIn(`secret: ${'0123456789abcdef'.repeat(4)}`)).toEqual(['a long hexadecimal token (line 1)']);
    expect(secretsIn(`secret: ${'0123456789abcdef'.repeat(3).slice(0, 40)}`)).toEqual(['a long hexadecimal token (line 1)']);
  });

  it('says the line, counting from 1, and never what it found', () => {
    const found = secretsIn(`one\ntwo\nkey: ${piece('sk', '-ant-', 'api03-', 'abc')}\nfour`);
    expect(found).toEqual(['an Anthropic key (line 3)']);
    expect(found.join('')).not.toContain('api03');
  });

  it('says every line that has one, once for each kind that it finds there', () => {
    const text = `${piece('sk', '-ant-', 'x')}\nfine\n${piece('AK', 'IA', 'ABCDEFGH', 'IJKLMNOP')} ${MIXED}`;
    expect(secretsIn(text)).toEqual(['an Anthropic key (line 1)', 'an access key id (line 3)', 'a long mixed token (line 3)']);
  });

  it('finds nothing in what these files really say: names of variables, paths, addresses, versions and sentences', () => {
    const fine = [
      'ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
      'path: docs/superpowers/specs/2026-10-06-the-desk-automation-design.md',
      'userAgent: AgenticMediaHouseDesk/0.1 (+https://agentic-media-house.joshi-alok.workers.dev/method)',
      'uses: actions/checkout@v7',
      'a model is named claude-haiku-4-5-20251001',
      'a-very-long-path-of-lowercase-words-and-numbers-like-2026-10-06-and-so-on-and-so-forth',
      'run: gh secret set ANTHROPIC_API_KEY < ~/.config/agentic-media-house/anthropic.key',
    ];
    for (const line of fine) expect(secretsIn(line), line).toEqual([]);
  });

  it('does not take a long word of capitals and small letters with no digit, or a long run of digits, for a secret', () => {
    expect(secretsIn('AVeryLongIdentifierWithCapitalsAndSmallLettersOnlyAndNoDigitsAtAllInIt')).toEqual([]);
    expect(secretsIn('1'.repeat(50))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npm test --workspace @robywire/desk -- test/secret-shapes.test.ts`
Expected: FAIL — `Cannot find module './support/secrets'`

- [ ] **Step 3: Write `secretsIn`**

**Create `desk/test/support/secrets.ts`:**
```ts
// What a secret looks like, for the tests of the files that the repository publishes about its own running (the settings of the daily run, the workflows, the
// Cloudflare settings and the runbook). A safety net and not a proof: it knows the shapes of the keys that this project uses, and a secret of another shape gets through.
// It never says what it found, only which kind and on which line, so that a test that fails does not print the secret.

/** A token of the shape of a secret of an access key or of Cloudflare: forty characters or more of the characters that such secrets are made of. */
const LONG_TOKEN = /[A-Za-z0-9+/_=-]{40,}/g;

/** The fixed shapes: a name for what it is, and the pattern. */
const SHAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: 'an Anthropic key', pattern: /sk-ant-/ },
  { name: 'an access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'a token of GitHub', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** What kind of long token `token` is, if it is shaped like a secret: capitals, small letters and digits all together, or forty hexadecimal digits with letters among them. */
function kindOfToken(token: string): string | undefined {
  if (/^[0-9a-f]+$/.test(token) && /[0-9]/.test(token) && /[a-f]/.test(token)) return 'a long hexadecimal token';
  if (/[A-Z]/.test(token) && /[a-z]/.test(token) && /[0-9]/.test(token)) return 'a long mixed token';
  return undefined;
}

/**
 * What in `text` is shaped like a secret: one string for each kind that is on a line, in the order of the lines, such as `an Anthropic key (line 3)`. An empty list when
 * there is nothing. The text that matched is never in the answer.
 */
export function secretsIn(text: string): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, at) => {
    const kinds = new Set<string>();
    for (const { name, pattern } of SHAPES) if (pattern.test(line)) kinds.add(name);
    for (const match of line.matchAll(LONG_TOKEN)) {
      const kind = kindOfToken(match[0]);
      if (kind !== undefined) kinds.add(kind);
    }
    for (const kind of kinds) found.push(`${kind} (line ${at + 1})`);
  });
  return found;
}
```

- [ ] **Step 4: Run the test and confirm that it passes**

Run: `npm test --workspace @robywire/desk -- test/secret-shapes.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the test of the settings file**

The test loads the file the way the command does (`loadConfig`) and says, one fact to a test, what the file must be.

**Create `desk/test/production-config.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { defaultConfig, loadConfig, placeholderHost } from '../src/config';
import { productToken } from '../src/fetch/robots';
import { secretsIn } from './support/secrets';

// `desk.config.yml` at the root of the repository is the file of settings that the daily workflow passes to `desk run --config`. It is committed, so it is public:
// it holds the settings that a real run needs and the defaults do not give (which store keeps the evidence, who the Desk says it is) and nothing that is secret.
// What is secret, the key of the model and the four variables of the bucket, comes from the environment, and a file that carried one would be refused by `loadConfig`.

const FILE = fileURLToPath(new URL('../../desk.config.yml', import.meta.url));
const TEXT = readFileSync(FILE, 'utf8');
const SETTINGS = parse(TEXT) as Record<string, unknown>;
const DEFAULTS = defaultConfig();

/** Every name of a setting in `value`, at every depth. */
const keysOf = (value: unknown): string[] => (typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]) : []);

describe('desk.config.yml', () => {
  it('is a file that loadConfig accepts', () => {
    expect(() => loadConfig(FILE)).not.toThrow();
  });

  it('keeps the evidence in the private bucket, which the four variables of the environment describe', () => {
    expect(loadConfig(FILE).evidence).toEqual({ kind: 'r2' });
    expect(SETTINGS).not.toHaveProperty('evidenceDir');
  });

  it('says who the Desk is with an address that is not a placeholder, so that a live run is not refused, and the product token is the one that robots.txt files are asked about', () => {
    const { userAgent } = loadConfig(FILE);
    expect(placeholderHost(userAgent)).toBeUndefined();
    expect(userAgent).toMatch(/^AgenticMediaHouseDesk\/\d+\.\d+ \(\+https:\/\/[a-z0-9.-]+\/method\)$/);
    expect(productToken(userAgent)).toBe('AgenticMediaHouseDesk');
    expect(userAgent).not.toBe(DEFAULTS.userAgent);
  });

  it('leaves the models to the defaults: no model is named in the file', () => {
    expect(SETTINGS).not.toHaveProperty('models');
    expect(loadConfig(FILE).models).toEqual(DEFAULTS.models);
    expect(TEXT).not.toMatch(/claude-/);
  });

  it('writes the budget of a run and the number of runs a day, as numbers that are at most ten times the defaults, so that a slip of a zero does not remove the limit', () => {
    const config = loadConfig(FILE);
    expect(Object.keys((SETTINGS.budget ?? {}) as object).sort()).toEqual(['maxCalls', 'maxInputTokens', 'maxOutputTokens']);
    expect(SETTINGS).toHaveProperty('maxAttemptsPerDay');
    expect(config.maxAttemptsPerDay).toBeLessThanOrEqual(3);
    for (const name of ['maxCalls', 'maxInputTokens', 'maxOutputTokens'] as const) {
      expect(config.budget[name], name).toBeGreaterThan(0);
      expect(config.budget[name], name).toBeLessThanOrEqual(10 * DEFAULTS.budget[name]);
    }
  });

  it('keeps the runs in the folder that the workflow uploads from, and no other setting changes how a run behaves', () => {
    expect(loadConfig(FILE).runDir).toBe('runs');
    expect(Object.keys(SETTINGS).sort()).toEqual(['budget', 'evidence', 'maxAttemptsPerDay', 'runDir', 'userAgent']);
  });

  it('has nothing in it that is shaped like a secret, and no setting that is named like one or that describes the bucket', () => {
    expect(secretsIn(TEXT)).toEqual([]);
    expect(keysOf(SETTINGS).filter((key) => /secret|password|credential|api[_-]?key|access[_-]?key|endpoint|bucket/i.test(key))).toEqual([]);
  });

  it('is plain ASCII, like the rest of the source', () => {
    expect([...TEXT].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});
```

- [ ] **Step 6: Run the test and confirm that it fails**

Run: `npm test --workspace @robywire/desk -- test/production-config.test.ts`
Expected: FAIL — `no such file or directory` and `desk.config.yml`

- [ ] **Step 7: Write the file of settings**

**Create `desk.config.yml`:**
```yaml
# The settings of the daily run of the Desk: .github/workflows/desk.yml passes this file to `npm run desk -- run --config desk.config.yml`.
# It is committed, so it is public, and it holds no secret. The key of the model and the four variables that describe the private bucket (R2_ENDPOINT, R2_BUCKET,
# R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY) come from the secrets of the repository, through the environment of the run; a file of settings that carried one
# would be refused. Every setting that is not written here has its default, from desk/src/config.ts, and so do the models: they are named there and nowhere else.

# What the Desk calls itself to every site it fetches from. It must link to the /method page, which says who the Desk is. When the site gets a domain of its own,
# change the address here and the default of SITE_URL in .github/workflows/deploy.yml together.
userAgent: AgenticMediaHouseDesk/0.1 (+https://agentic-media-house.joshi-alok.workers.dev/method)

# The snapshots of the pages that a run reads are kept in the private bucket, so that a run that starts from a fresh checkout every day does not lose them.
evidence:
  kind: r2

# Where a run writes its artifacts. The workflow uploads this folder (without the evidence, which is in the bucket) and keeps it for 14 days.
runDir: runs

# How many runs a day may have. The workflow starts at 04:30, 06:30 and 08:30 UTC, and a day that already has a run that did not fail is not run again.
maxAttemptsPerDay: 3

# What one run may spend. A run that goes over any of these stops and fails.
budget:
  maxCalls: 24
  maxInputTokens: 400000
  maxOutputTokens: 60000
```

- [ ] **Step 8: Run the test and confirm that it passes**

Run: `npm test --workspace @robywire/desk -- test/production-config.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk.config.yml desk/test/support/secrets.ts desk/test/secret-shapes.test.ts desk/test/production-config.test.ts`
Expected: PASS — prints nothing

- [ ] **Step 9: Say it in the README, and keep it true**

The README has a test for every limit it states. Add the test first.

**In `desk/test/readme.test.ts`, replace:**
```ts
    expect(limits()).toContain('on purpose');
  });
});
```

**with:**
```ts
    expect(limits()).toContain('on purpose');
  });
});

describe('the README: the file of settings of the daily run', () => {
  it('says that desk.config.yml is the file of the daily run, what it holds, and that it holds no secret and names no model', () => {
    const command = section('The desk command');
    expect(command).toContain('`desk.config.yml` at the root of the repository is the file of settings of the daily run');
    expect(command).toContain('`evidence: { kind: r2 }`');
    expect(command).toContain('it holds no secret, and it names no model');
    expect(command).toContain('come from the environment, never from this file');
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: FAIL — `the file of settings of the daily run`

Then the paragraph, after the paragraph about `--config`.

**In `README.md`, replace:**
```markdown
`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store (see The evidence store); the address, the name and the keys of a bucket are not settings, and a file that carries one is refused like any other setting that does not exist. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.

```

**with:**
```markdown
`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store (see The evidence store); the address, the name and the keys of a bucket are not settings, and a file that carries one is refused like any other setting that does not exist. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

`desk.config.yml` at the root of the repository is the file of settings of the daily run: the real user agent (it links to the /method page of the live site), `evidence: { kind: r2 }`, the folder of the runs, `maxAttemptsPerDay` and the budget of a run. It is committed, so it holds no secret, and it names no model (the models are the defaults of `desk/src/config.ts`). The key of the model and the four variables of the bucket come from the environment, never from this file. `desk/test/production-config.test.ts` loads it and checks all of this.

The exit code is 0 for a run that published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 10: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 11: Commit**

```bash
git add desk.config.yml README.md desk/test/production-config.test.ts desk/test/readme.test.ts desk/test/secret-shapes.test.ts desk/test/support/secrets.ts
git commit -m "feat(desk): desk.config.yml, the file of settings of the daily run: the real user agent, the private bucket as the evidence store, the folder of the runs, the number of runs a day and the budget of a run, with no secret and no model, loaded by a test that also says what a secret looks like (secretsIn) for the files that come after it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 12: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing

---

### Task 24: The daily workflow

**Files:**
- Modify: `desk/src/cli.ts` (the option `--skip-if-done`, `skippedLines`, the usage)
- Modify: `desk/test/cli.test.ts`, `desk/test/run-states.test.ts`
- Create: `.github/workflows/desk.yml`
- Create: `desk/test/support/workflow.ts`
- Create: `desk/test/workflows/desk-workflow.test.ts`
- Create: `desk/test/workflows/uploaded-runs.test.ts`
- Modify: `README.md` (the section "The daily workflow" and the sentences that change with it), `desk/test/readme.test.ts`

This task makes the Desk run by itself, once a day, on GitHub. Four things have to be true, and each is held by a test.

**1. A second start on the same day does nothing.** The workflow starts three times a day (04:30, 06:30 and 08:30 UTC), so that a day whose run failed is tried again. But a start that finds the day done must not run it a second time, and it must not be an error either, because GitHub would tell the owner that the job failed. `desk run` already refuses a day that has a run that did not fail, with exit code 1. The new flag `--skip-if-done` turns exactly that refusal into a quiet exit: the command prints `outcome: refused-already-done` and exits 0, and runs nothing. How does a job that starts from a **fresh checkout** know that the day is done? The folder `runs/` is not committed, so it is not there. The desk state is: every run that is not dry commits it, with the id of the run (which starts with its day) and how it ended. So the flag asks the desk state first (the last run is of this day and did not fail), and, for a machine that does have the folder, it also turns the refusal `date-done` of the orchestrator into the same quiet exit. It asks before anything else is built, so a day that is done needs no key and no bucket. Every other refusal (a lock, a day that has used up its tries) stays an exit code 1, a placeholder user agent stays an exit code 2, and the flag cannot be given with `--force-new`, which says the opposite.

**2. The workflow.** `.github/workflows/desk.yml`, written exactly as the design says: three crons and a manual start, a concurrency group that never cancels a run that has started, a checkout with the whole history, Node from `.nvmrc`, `npm ci`, a name for the committer (`github-actions[bot]`), the Desk, a push, an artifact, and a deploy. The tests read it with the YAML parser and check every property; two of its scripts are also run, in a made-up repository whose remote is a folder.

Three things in it are not obvious.

- *The secrets.* The five secrets (`ANTHROPIC_API_KEY` and the four `R2_*` variables) are in the `env` of the one step that runs the Desk, and nowhere else. No command in the file has an expression (`${{ ... }}`) in it, so nothing is pasted into a script, and none names a secret or prints the environment, so nothing is echoed. The token of the workflow (`GH_TOKEN: ${{ github.token }}`, not a secret) is for the `gh` program that opens the pull request of a hold.
- *The deploy.* **A push that is made with the token of a workflow does not start any other workflow** (GitHub does this on purpose, so that workflows cannot start each other in a loop; only a start by hand, `workflow_dispatch`, is exempt). The deploy workflow (Task 25) starts on a push to `main`, so a piece that the Desk pushed would never be deployed. The design did not say this; the workflow therefore has one more step and one more permission than the design lists: after a push, the last step starts the deploy by hand (`gh workflow run deploy.yml --ref main`), and the token has `actions: write` for it.
- *The artifact.* `runs/` is kept for 14 days **even when the run failed** (that is when it is wanted), and `runs/tune/`, where `desk tune` (Task 26) writes, is never kept. Artifacts of a public repository can be read by anyone, and the pages that the Desk reads are somebody else's text. So the test file `uploaded-runs.test.ts` makes a run of the made-up world for each way that a run can end (published, held, no story, failed), lists every file that the orchestrator wrote, and holds it to two things: every file is of a kind that the test knows (the artifact of a stage, a held draft, a recorded reply of the model, the record of the run), so a new kind of file fails the test until somebody decides whether it may be public; and no string in any of them shares with any page more than the length of a quotation (300 characters, the longest that the gate accepts) in a row. The pages themselves are in the evidence store, and with the bucket there is no folder of evidence at all.

**3. What nothing here can prove.** A workflow cannot be run on any machine but GitHub's. The tests can say what the file says; only the first real run (the runbook, Task 27) shows that the steps do it. And **the versions of the actions** (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`) were not checked against GitHub when this plan was verified, because nothing in it may use the network: the first two are those that `ci.yml` already uses, and the third is the same major, which is a guess. The runbook has a step that checks all three against the latest release of each.

**4. The README says it** (a new section, and the sentences that said that the workflow is not built), and a test keeps it true.

- [ ] **Step 1: Write the tests of the flag**

The first edit is to the tests that read the arguments (two of them list every field of what `run` parses, and that gains one), then new tests of the options, then a new group for what `main` does, and the table of the states of a day gains a row for each state with the flag.

**In `desk/test/cli.test.ts`, replace:**
```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs, resultLines } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
```

**with:**
```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs, resultLines, skippedLines } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
```

**In `desk/test/cli.test.ts`, replace:**
```ts
describe('parseArgs: run', () => {
  it('has the defaults of a real run: the api, the live sources, today, not dry', () => {
    expect(parsed('run')).toEqual({ command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, cassettes: undefined, config: undefined });
  });

```

**with:**
```ts
describe('parseArgs: run', () => {
  it('has the defaults of a real run: the api, the live sources, today, not dry', () => {
    expect(parsed('run')).toEqual({ command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, skipIfDone: false, cassettes: undefined, config: undefined });
  });

```

**In `desk/test/cli.test.ts`, replace:**
```ts
  });

  it('reads --client and --sources', () => {
    expect(parsed('run', '--dry', '--client', 'fake')).toMatchObject({ client: 'fake' });
```

**with:**
```ts
  });

  it('reads --skip-if-done, which takes no value, in any order with the other options, and is off unless it is given', () => {
    expect(parsed('run', '--skip-if-done')).toMatchObject({ skipIfDone: true, forceNew: false, dry: false });
    expect(parsed('run', '--dry', '--skip-if-done', '--config', 'desk.config.yml')).toMatchObject({ skipIfDone: true, dry: true, config: 'desk.config.yml' });
    expect(parsed('run', '--config', 'desk.config.yml', '--skip-if-done')).toMatchObject({ skipIfDone: true });
    expect(parsed('run', '--dry')).toMatchObject({ skipIfDone: false });
  });

  it('refuses --skip-if-done together with --force-new, which say opposite things about a day that is done, and --skip-if-done given twice', () => {
    expect(refused('run', '--skip-if-done', '--force-new')).toBe('--skip-if-done and --force-new contradict each other: the first leaves a day that is done alone and the second runs it again');
    expect(refused('run', '--force-new', '--skip-if-done')).toContain('contradict each other');
    expect(refused('run', '--skip-if-done', '--skip-if-done')).toBe('--skip-if-done is given twice');
  });

  it('does not give --skip-if-done to the other commands', () => {
    expect(refused('replay', 'runs/2026-10-05', '--skip-if-done')).toBe('unknown option --skip-if-done for replay');
    expect(refused('status', '--skip-if-done')).toBe('unknown option --skip-if-done for status');
    expect(refused('retract', 'a-piece', '--reason', 'x', '--skip-if-done')).toBe('unknown option --skip-if-done for retract');
  });

  it('reads --client and --sources', () => {
    expect(parsed('run', '--dry', '--client', 'fake')).toMatchObject({ client: 'fake' });
```

**In `desk/test/cli.test.ts`, replace:**
```ts
      sources: 'fixtures',
      forceNew: true,
      cassettes: undefined,
    });
```

**with:**
```ts
      sources: 'fixtures',
      forceNew: true,
      skipIfDone: false,
      cassettes: undefined,
    });
```

**In `desk/test/cli.test.ts`, replace:**
```ts
    expect(USAGE).toContain('if that fails the run ends failed at the stage hold');
    expect(USAGE).toContain('(the branch hold/<day>-<slug> is pushed with git and gh, and the');
    expect(USAGE).toContain('[--config <path>]');
    // Every command that reads the settings says so; `retract` does not read them.
```

**with:**
```ts
    expect(USAGE).toContain('if that fails the run ends failed at the stage hold');
    expect(USAGE).toContain('(the branch hold/<day>-<slug> is pushed with git and gh, and the');
    expect(USAGE).toContain('[--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]');
    expect(USAGE).toContain('--skip-if-done is for a schedule that starts the command more than once a day');
    expect(USAGE).toContain('"outcome: refused-already-done", exits 0 and runs nothing');
    expect(USAGE).toContain('Every other refusal is still an exit code 1, and it cannot be given with --force-new.');
    expect(USAGE).toContain('[--config <path>]');
    // Every command that reads the settings says so; `retract` does not read them.
```

**In `desk/test/cli.test.ts`, replace:**
```ts
});

describe('main: a day that failed is tried again', () => {
  // A live run with no network fails at Discover, which makes a failed day without any stage of a test: the same command is the next try of the day.
```

**with:**
```ts
});

describe('main: --skip-if-done, a day that is done is left alone', () => {
  const DAY = '2026-10-05';
  const run = (outcome: string, runId = `${DAY}-043100`) => ({ at: `${DAY}T04:31:20.000Z`, outcome, runId, slug: outcome === 'published' ? 'a-piece' : null });
  const stateOf = (cwd: string, lastRun: unknown): void => writeFileSync(path.join(cwd, STATE), JSON.stringify({ lastRun, holds: [], corrections: [] }));
  const SKIPPED = (why: string): string[] => ['outcome: refused-already-done', `day: ${DAY}`, `reason: ${why}`, 'nothing was run: no model was asked, no page was fetched and nothing was written'];

  it.each(['published', 'held', 'no-story'])('says so, exits 0 and does nothing when the desk state says that the last run was of the day and ended %s, with no key and no bucket in the environment', async (outcome) => {
    const { call, out, err, cwd, git } = setup();
    stateOf(cwd, run(outcome));
    const before = filesBelow(cwd);
    // The client is the api, which needs a key, and the settings may ask for a bucket: neither is looked at for a day that is done.
    expect(await call('run', '--date', DAY, '--skip-if-done')).toBe(0);
    expect(out).toEqual(SKIPPED(`the desk state says that the run ${DAY}-043100 ended ${outcome} at ${DAY}T04:31:20.000Z`));
    expect(err).toEqual([]);
    expect(filesBelow(cwd)).toEqual(before);
    expect(git.commits).toEqual([]);
  });

  it('does not ask the evidence store or the model, even when the settings say r2 and there is no variable for it', async () => {
    const { call, out, cwd } = setup({ config: { ...defaultConfig(), runDir: 'runs', evidence: { kind: 'r2' }, userAgent: TEST_AGENT } });
    stateOf(cwd, run('published'));
    expect(await call('run', '--date', DAY, '--skip-if-done')).toBe(0);
    expect(out[0]).toBe('outcome: refused-already-done');
  });

  it('takes the day from the clock when it is not told one, as a run does', async () => {
    const { call, out, cwd } = setup();
    stateOf(cwd, run('published'));
    expect(await call('run', '--skip-if-done')).toBe(0);
    expect(out[0]).toBe('outcome: refused-already-done');
    expect(out[1]).toBe(`day: ${DAY}`);
  });

  it('runs the day when the last run of the desk state failed, or was of another day, or the state has no run at all', async () => {
    for (const lastRun of [run('failed'), run('published', '2026-10-04-043100'), null]) {
      const { call, out, cwd } = setup();
      stateOf(cwd, lastRun);
      expect(await call(...DRY_DEMO, '--skip-if-done'), JSON.stringify(lastRun)).toBe(0);
      expect(out).toContain('outcome: published');
      expect(out).not.toContain('outcome: refused-already-done');
      expect(existsSync(path.join(cwd, 'runs', DAY))).toBe(true);
    }
  });

  it('reads the run id and not the time of the record: a run id that does not start with a day is not a run of the day', async () => {
    const { call, out, cwd } = setup();
    stateOf(cwd, run('published', 'r'));
    expect(await call(...DRY_DEMO, '--skip-if-done')).toBe(0);
    expect(out).toContain('outcome: published');
  });

  it('says so when the folder of the runs has a record of a run of the day that did not fail, which is what a dry run leaves, and writes nothing', async () => {
    const { call, out, cwd } = setup();
    await call(...DRY_DEMO);
    out.length = 0;
    const before = filesBelow(cwd);
    expect(await call(...DRY_DEMO, '--skip-if-done')).toBe(0);
    expect(out).toEqual(SKIPPED(`the run of ${DAY} is already done: runs/${DAY}/run.json is there`));
    expect(filesBelow(cwd)).toEqual(before);
  });

  it('runs a day that the folder of the runs says failed, as it does with no flag', async () => {
    const { call, out, cwd } = setup({ env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await call('run', '--date', DAY)).toBe(1);
    out.length = 0;
    // The record of the failed run is there, and the state says failed: the next try is made.
    expect(await call('run', '--date', DAY, '--skip-if-done')).toBe(1);
    expect(out).toContain('outcome: failed');
    expect(out).toContain('attempt: 2');
    expect(existsSync(path.join(cwd, 'runs', `${DAY}.failed-1`))).toBe(true);
  });

  it('is not a way past a settings mistake: a placeholder user agent is refused first, with exit code 2, and so is a file of settings that cannot be read', async () => {
    const placeholder = setup({ config: undefined });
    stateOf(placeholder.cwd, run('published'));
    expect(await placeholder.call('run', '--date', DAY, '--skip-if-done')).toBe(2);
    expect(placeholder.err.join('\n')).toContain('placeholder address');
    expect(placeholder.out).toEqual([]);
    const missing = setup();
    stateOf(missing.cwd, run('published'));
    expect(await missing.call('run', '--date', DAY, '--skip-if-done', '--config', 'nope.yml')).toBe(2);
    expect(missing.err.join('\n')).toContain('cannot read the file');
  });

  it('leaves a desk state that cannot be read to the run, which says so', async () => {
    const { call, out, err, cwd } = setup();
    writeFileSync(path.join(cwd, STATE), '{ not json');
    expect(await call(...DRY_DEMO, '--skip-if-done')).not.toBe(0);
    expect(out).not.toContain('outcome: refused-already-done');
    expect([...out, ...err].join('\n')).toContain('desk-state.json');
  });
});

describe('skippedLines', () => {
  it('says the outcome, the day, why, and that nothing was run, one to a line', () => {
    expect(skippedLines('2026-10-05', 'the desk state says so')).toEqual([
      'outcome: refused-already-done',
      'day: 2026-10-05',
      'reason: the desk state says so',
      'nothing was run: no model was asked, no page was fetched and nothing was written',
    ]);
  });
});

describe('main: a day that failed is tried again', () => {
  // A live run with no network fails at Discover, which makes a failed day without any stage of a test: the same command is the next try of the day.
```

**In `desk/test/run-states.test.ts`, replace:**
```ts
  /** The try that the new run was, when it ran. */
  attempt?: number;
}

```

**with:**
```ts
  /** The try that the new run was, when it ran. */
  attempt?: number;
  /** The command ran nothing and said so, with exit code 0 (`--skip-if-done` on a day that is done). */
  skipped?: true;
}

```

**In `desk/test/run-states.test.ts`, replace:**
```ts
    folders: kept(),
  },
  {
    state: 'another run holds the lock',
```

**with:**
```ts
    folders: kept(),
  },
  { state: 'nothing has run on the day, and --skip-if-done is given', make: async () => aDay(), extra: ['--skip-if-done'], exit: 0, says: 'outcome: published', folders: kept(), attempt: 1 },
  { state: 'the day published and --skip-if-done is given', make: () => endedDay({}), extra: ['--skip-if-done'], exit: 0, says: 'outcome: refused-already-done', folders: kept(), skipped: true },
  { state: 'the day was held and --skip-if-done is given', make: () => endedDay({ fake: unentailed() }), extra: ['--skip-if-done'], exit: 0, says: 'outcome: refused-already-done', folders: kept(), skipped: true },
  {
    state: 'the day had no story and --skip-if-done is given',
    make: () => endedDay({ fake: new FakeClient().script('select', { chosenId: null, reasons: ['none'] }) }),
    extra: ['--skip-if-done'],
    exit: 0,
    says: 'outcome: refused-already-done',
    folders: kept(),
    skipped: true,
  },
  { state: 'the day failed once and --skip-if-done is given', make: () => failedDay(1), extra: ['--skip-if-done'], exit: 0, says: 'outcome: published', folders: kept('failed-1'), attempt: 2 },
  {
    state: 'the day failed three times and --skip-if-done is given',
    make: () => failedDay(3),
    extra: ['--skip-if-done'],
    exit: 1,
    says: `the run was refused: the run of ${DEMO_DATE} has already been tried 3 times and maxAttemptsPerDay is 3: nothing was run`,
    folders: kept('failed-1', 'failed-2'),
  },
  {
    state: 'the record of the day cannot be read and --skip-if-done is given',
    make: async () => {
      const day = aDay();
      mkdirSync(path.join(day.made.config.runDir, DEMO_DATE), { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, DEMO_DATE, 'run.json'), '{"outcome": "failed"');
      return day;
    },
    extra: ['--skip-if-done'],
    exit: 0,
    says: 'outcome: refused-already-done',
    folders: kept(),
    skipped: true,
  },
  {
    state: 'the folder of the day has artifacts and no record, and --skip-if-done is given',
    make: async () => {
      const day = aDay();
      mkdirSync(path.join(day.made.config.runDir, DEMO_DATE), { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, DEMO_DATE, '01-discover.json'), '{}');
      return day;
    },
    extra: ['--skip-if-done'],
    exit: 0,
    says: 'outcome: published',
    folders: kept('old-1'),
    attempt: 2,
  },
  {
    state: 'another run holds the lock and --skip-if-done is given',
    make: async () => {
      const day = aDay();
      mkdirSync(day.made.config.runDir, { recursive: true });
      writeFileSync(path.join(day.made.config.runDir, LOCK_FILE), `${JSON.stringify({ pid: 1, runId: 'other', startedAt: START.toISOString() })}\n`);
      return day;
    },
    extra: ['--skip-if-done'],
    exit: 1,
    says: 'the run was refused: another run holds the lock',
    folders: [],
  },
  {
    state: 'another run holds the lock',
```

**In `desk/test/run-states.test.ts`, replace:**
```ts
    const day = await row.make();
    const { runDir } = day.made.config;
    const before = row.exit === 0 ? [] : filesBelow(runDir);
    expect(await day.command(...(row.extra ?? []))).toBe(row.exit);
    // What it says: the line of its output that tells the outcome when it ran, and the last line of its error output when it did not.
    expect((row.exit === 0 ? day.out : day.err).some((line) => line.includes(row.says)), row.says).toBe(true);
    if (row.attempt !== undefined) expect(day.out).toContain(`attempt: ${row.attempt}`);
    expect(day.folders()).toEqual(row.folders);
    if (row.exit !== 0) {
```

**with:**
```ts
    const day = await row.make();
    const { runDir } = day.made.config;
    const before = row.exit === 0 && row.skipped !== true ? [] : filesBelow(runDir);
    expect(await day.command(...(row.extra ?? []))).toBe(row.exit);
    // What it says: the line of its output that tells the outcome when it ran, and the last line of its error output when it did not.
    expect((row.exit === 0 ? day.out : day.err).some((line) => line.includes(row.says)), row.says).toBe(true);
    if (row.attempt !== undefined) expect(day.out).toContain(`attempt: ${row.attempt}`);
    if (row.skipped === true) {
      // A day that is left alone is not a run: no try, no folder, no file, and nothing is committed.
      expect(day.out.some((line) => line.startsWith('attempt:'))).toBe(false);
      expect(filesBelow(runDir)).toEqual(before);
    }
    expect(day.folders()).toEqual(row.folders);
    if (row.exit !== 0) {
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts test/run-states.test.ts`
Expected: FAIL — `unknown option --skip-if-done for run`

- [ ] **Step 3: Write the flag**

**In `desk/src/cli.ts`, replace:**
```ts

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; cassettes: string | undefined; config: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
```

**with:**
```ts

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; skipIfDone: boolean; cassettes: string | undefined; config: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
```

**In `desk/src/cli.ts`, replace:**
```ts
export const USAGE = [
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
```

**with:**
```ts
export const USAGE = [
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
```

**with:**
```ts
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  '        --skip-if-done is for a schedule that starts the command more than once a day: a day that is done is not an error but a day to leave alone. The command says',
  '        "outcome: refused-already-done", exits 0 and runs nothing (asks no model, fetches nothing, writes nothing) when the desk state says that the last run was of this day and',
  '        did not fail, or when the folder of the runs has a record of a run of this day that did not fail. Every other refusal is still an exit code 1, and it cannot be given with --force-new.',
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
```

**In `desk/src/cli.ts`, replace:**
```ts

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'retract', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
```

**with:**
```ts

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'retract', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new', '--skip-if-done'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
```

**In `desk/src/cli.ts`, replace:**
```ts
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
  const cassettes = value('--cassettes');
  if (client === 'recorded' && cassettes === undefined) return fail('--client recorded needs --cassettes, the folder of the recorded replies');
  if (client !== 'recorded' && cassettes !== undefined) return fail('--cassettes is for --client recorded: the other clients record their replies in the folder of the run');
  return { ok: true, args: { command: 'run', date, dry, client: client as ClientKind, sources: sources as SourcesKind, forceNew: given.has('--force-new'), cassettes, config: value('--config') } };
}

```

**with:**
```ts
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
  if (given.has('--skip-if-done') && given.has('--force-new')) {
    return fail('--skip-if-done and --force-new contradict each other: the first leaves a day that is done alone and the second runs it again');
  }
  const cassettes = value('--cassettes');
  if (client === 'recorded' && cassettes === undefined) return fail('--client recorded needs --cassettes, the folder of the recorded replies');
  if (client !== 'recorded' && cassettes !== undefined) return fail('--cassettes is for --client recorded: the other clients record their replies in the folder of the run');
  return { ok: true, args: { command: 'run', date, dry, client: client as ClientKind, sources: sources as SourcesKind, forceNew: given.has('--force-new'), skipIfDone: given.has('--skip-if-done'), cassettes, config: value('--config') } };
}

```

**In `desk/src/cli.ts`, replace:**
```ts
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
```

**with:**
```ts
}

/** A path as it is shown to a person: relative to the folder the command was started in, with forward slashes. */
const shownPath = (cwd: string, file: string): string => path.relative(cwd, file).split(path.sep).join('/');

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
  const day = runId.slice(0, 10);
  return runId.charAt(10) === '-' && isDay(day) ? day : undefined;
}

/**
 * What a day that is done looks like in a checkout that has no folder of runs, which is every checkout of a scheduled job: the last run of the desk state, when it is a run of
 * `date` that did not fail. The state is committed, so it is the one record of a run that the next job has. A state that cannot be read is not an answer: it is left for the run to report.
 */
async function doneInState(deps: CliDeps, date: string): Promise<{ runId: string; outcome: string; at: string } | undefined> {
  try {
    const { lastRun } = await readDeskState(path.join(deps.cwd, sitePaths().stateFile));
    return lastRun !== null && lastRun.outcome !== 'failed' && dayOfRun(lastRun.runId) === date ? lastRun : undefined;
  } catch {
    return undefined;
  }
}

/** What `desk run --skip-if-done` prints when the day is done: the outcome that says so, the day, why, and that nothing was run. */
export function skippedLines(date: string, why: string): string[] {
  return ['outcome: refused-already-done', `day: ${date}`, `reason: ${why}`, 'nothing was run: no model was asked, no page was fetched and nothing was written'];
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
```

**In `desk/src/cli.ts`, replace:**
```ts
  }
  const date = args.date ?? (args.sources === 'fixtures' ? DEMO_DATE : deps.now().toISOString().slice(0, 10));
  let world: ReturnType<typeof sourcesOf>;
  try {
```

**with:**
```ts
  }
  const date = args.date ?? (args.sources === 'fixtures' ? DEMO_DATE : deps.now().toISOString().slice(0, 10));
  if (args.skipIfDone) {
    // Before the sources, the evidence store and the client are built, so that a day that is done needs no key and no bucket.
    const done = await doneInState(deps, date);
    if (done !== undefined) {
      for (const line of skippedLines(date, `the desk state says that the run ${done.runId} ended ${done.outcome} at ${done.at}`)) deps.out(line);
      return 0;
    }
  }
  let world: ReturnType<typeof sourcesOf>;
  try {
```

**In `desk/src/cli.ts`, replace:**
```ts
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
    deps.err(error instanceof RunRefused ? `the run was refused: ${error.message}` : `the run could not start: ${describeError(error)}`);
    return 1;
```

**with:**
```ts
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
    if (args.skipIfDone && error instanceof RunRefused && error.kind === 'date-done') {
      for (const line of skippedLines(date, `the run of ${date} is already done: ${shownPath(deps.cwd, path.join(runPath(config.runDir, date), 'run.json'))} is there`)) deps.out(line);
      return 0;
    }
    deps.err(error instanceof RunRefused ? `the run was refused: ${error.message}` : `the run could not start: ${describeError(error)}`);
    return 1;
```

**In `desk/src/cli.ts`, replace:**
```ts
}

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
  const day = runId.slice(0, 10);
  return runId.charAt(10) === '-' && isDay(day) ? day : undefined;
}

/**
 * Which try of its day the run `runId` was, as the words that say it: from `run.json` in the folder of its day, which is there only on the machine that made the run (the
```

**with:**
```ts
}

/**
 * Which try of its day the run `runId` was, as the words that say it: from `run.json` in the folder of its day, which is there only on the machine that made the run (the
```

**In `desk/src/cli.ts`, replace:**
```ts
async function describeAttempt(config: DeskConfig, cwd: string, day: string, runId: string): Promise<string> {
  const file = path.join(config.runDir, day, 'run.json');
  const shown = path.relative(cwd, file).split(path.sep).join('/');
  if (!(await stat(file).then(() => true, () => false))) return `attempt not known (${shown} is not here)`;
  let record: StoredRunRecord;
```

**with:**
```ts
async function describeAttempt(config: DeskConfig, cwd: string, day: string, runId: string): Promise<string> {
  const file = path.join(config.runDir, day, 'run.json');
  const shown = shownPath(cwd, file);
  if (!(await stat(file).then(() => true, () => false))) return `attempt not known (${shown} is not here)`;
  let record: StoredRunRecord;
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/cli.test.ts test/run-states.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 5: Write the tests of the workflow**

`support/workflow.ts` reads a workflow as data. The test file is the list of every property of `desk.yml`.

**Create `desk/test/support/workflow.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// The workflows of the repository (`.github/workflows/`) as data, for the tests that say what each of them does. A workflow cannot be run on any machine but GitHub's, so
// what these tests can do is read the file with a YAML parser and check every property that matters: when it starts, what it may do, which steps it has in which order,
// where its secrets go. The first real run (docs/runbook.md) is the proof that the steps do what they say.

/** The root of the repository, with a slash at the end. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
  'continue-on-error'?: unknown;
  'working-directory'?: string;
  shell?: string;
}

export interface Job {
  'runs-on': string;
  'timeout-minutes'?: number;
  steps: Step[];
  [key: string]: unknown;
}

export interface Workflow {
  name: string;
  on: Record<string, unknown>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
  [key: string]: unknown;
}

/** The text of a workflow file: `workflowText('desk.yml')`. */
export const workflowText = (file: string): string => readFileSync(`${ROOT}.github/workflows/${file}`, 'utf8');

/** A workflow file, parsed. */
export const loadWorkflow = (file: string): Workflow => parse(workflowText(file)) as Workflow;

/** The steps of the only job of a workflow; throws when it has more than one. */
export function stepsOf(workflow: Workflow): Step[] {
  const jobs = Object.values(workflow.jobs);
  if (jobs.length !== 1) throw new Error(`expected one job, found ${jobs.length}`);
  return (jobs[0] as Job).steps;
}

/** The step with this name; throws when there is none, so that a renamed step fails the test that looks for it. */
export function stepNamed(workflow: Workflow, name: string): Step {
  const found = stepsOf(workflow).find((step) => step.name === name);
  if (found === undefined) throw new Error(`no step is named "${name}"`);
  return found;
}

/** Every string in `tree` that contains `needle`, with where it is (`jobs.desk.steps.4.env.ANTHROPIC_API_KEY`). */
export function stringsWith(tree: unknown, needle: string, where = ''): { path: string; value: string }[] {
  if (typeof tree === 'string') return tree.includes(needle) ? [{ path: where, value: tree }] : [];
  if (typeof tree !== 'object' || tree === null) return [];
  return Object.entries(tree).flatMap(([key, inner]) => stringsWith(inner, needle, where === '' ? key : `${where}.${key}`));
}

/** The names of the actions that a workflow uses, with their tag: `actions/checkout@v7`, in order, each once. */
export function actionsOf(workflow: Workflow): string[] {
  return [...new Set(Object.values(workflow.jobs).flatMap((job) => job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]))))];
}
```

**Create `desk/test/workflows/desk-workflow.test.ts`:**
```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli';
import { R2_VARIABLES } from '../../src/run/evidence-factory';
import { useScratch } from '../support/context';
import { ISOLATED, git } from '../support/repo';
import { secretsIn } from '../support/secrets';
import { ROOT, actionsOf, loadWorkflow, stepNamed, stepsOf, stringsWith, workflowText } from '../support/workflow';

// `.github/workflows/desk.yml` starts the Desk every day. Nothing can run it here, so these tests read it as data and say every property that matters: when it starts,
// that two runs never overlap, what the token may do, which steps there are and in which order, that every secret goes into the environment of the one step that needs it
// and is never written in a command, what is pushed and when, and what is kept as an artifact. The two small scripts in it (who the commits are by, and the push) are
// run here, in a made-up repository with a made-up remote that is a folder, to show that they do what they say.

const scratch = useScratch();
const workflow = loadWorkflow('desk.yml');
const text = workflowText('desk.yml');
const steps = stepsOf(workflow);
const names = steps.map((step) => step.name);

/** Run the commands of a step the way GitHub runs `run:` on Linux (bash, stopping at the first error), in `cwd`. */
function runScript(script: string, cwd: string, env: Record<string, string> = {}): string {
  return execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ISOLATED, ...env } });
}

describe('desk.yml: when it starts', () => {
  it('starts at 04:30, 06:30 and 08:30 UTC every day, and by hand, and at nothing else', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.on.schedule).toEqual([{ cron: '30 4 * * *' }, { cron: '30 6 * * *' }, { cron: '30 8 * * *' }]);
  });

  it('never runs two at once and never cancels one that has started', () => {
    expect(workflow.concurrency).toEqual({ group: 'desk', 'cancel-in-progress': false });
  });

  it('has one job, on Ubuntu, with a time after which GitHub stops it', () => {
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    const job = Object.values(workflow.jobs)[0]!;
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(60);
  });
});

describe('desk.yml: what the token may do', () => {
  it('may write the repository (the piece and the desk state go to main, the branch of a hold is pushed), write pull requests (a hold is sent to the owner), and start a workflow (the deploy), and may do nothing else', () => {
    expect(workflow.permissions).toEqual({ contents: 'write', 'pull-requests': 'write', actions: 'write' });
  });

  it('gives no job a permission of its own, which would change what the line above says', () => {
    for (const job of Object.values(workflow.jobs)) expect(job).not.toHaveProperty('permissions');
  });
});

describe('desk.yml: the steps, in order', () => {
  it('checks out, sets up Node, installs, names the committer, runs the Desk, pushes, keeps the artifacts and deploys', () => {
    expect(names).toEqual([
      'Check out the repository, with its history',
      'Set up Node',
      'Install dependencies',
      'Give the commits of the Desk a name',
      'Run the Desk',
      'Push what the run committed',
      'Keep the artifacts of the run for 14 days',
      'Deploy the site',
    ]);
  });

  it('gives every step a name', () => {
    for (const step of steps) expect(step.name, JSON.stringify(step)).toBeTruthy();
  });

  it('checks out the whole history with the token of the workflow, which is what a push needs: no other token and no switch that forgets it', () => {
    const checkout = stepNamed(workflow, 'Check out the repository, with its history');
    expect(checkout.uses).toBe('actions/checkout@v7');
    expect(checkout.with).toEqual({ 'fetch-depth': 0 });
  });

  it('uses the Node of .nvmrc and the cache of npm, and installs exactly what the lock file says', () => {
    const setup = stepNamed(workflow, 'Set up Node');
    expect(setup.uses).toBe('actions/setup-node@v7');
    expect(setup.with).toEqual({ 'node-version-file': '.nvmrc', cache: 'npm' });
    expect(stepNamed(workflow, 'Install dependencies').run).toBe('npm ci');
    expect(readFileSync(`${ROOT}.nvmrc`, 'utf8').trim()).toBe('22');
  });

  it('never lets a step fail without failing the job: no step has continue-on-error', () => {
    expect(stringsWith(workflow, 'continue-on-error')).toEqual([]);
    for (const step of steps) expect(step).not.toHaveProperty('continue-on-error');
  });
});

describe('desk.yml: the commits of the Desk', () => {
  const script = stepNamed(workflow, 'Give the commits of the Desk a name').run!;

  it('are by the bot of GitHub, with the address that GitHub gives it', () => {
    const repo = scratch();
    git(repo, 'init', '--quiet', '-b', 'main');
    runScript(script, repo);
    expect(git(repo, 'config', 'user.name')).toBe('github-actions[bot]');
    expect(git(repo, 'config', 'user.email')).toBe('41898282+github-actions[bot]@users.noreply.github.com');
  });
});

describe('desk.yml: the run', () => {
  const run = stepNamed(workflow, 'Run the Desk');

  it('is the command of the daily run: the file of settings of the repository, a day that is done left alone, and the defaults that make it real (the api, live sources, not dry)', () => {
    expect(run.run).toBe('npm run desk -- run --config desk.config.yml --skip-if-done');
    const parsed = parseArgs(run.run!.replace('npm run desk -- ', '').split(' '));
    expect(parsed).toEqual({
      ok: true,
      args: { command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, skipIfDone: true, cassettes: undefined, config: 'desk.config.yml' },
    });
    expect(existsSync(`${ROOT}desk.config.yml`)).toBe(true);
  });

  it('has the key of the model and the four variables of the bucket from the secrets of the repository, each under the name it is read by, and the token of the workflow for gh', () => {
    expect(run.env).toEqual({
      ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}',
      R2_ENDPOINT: '${{ secrets.R2_ENDPOINT }}',
      R2_BUCKET: '${{ secrets.R2_BUCKET }}',
      R2_ACCESS_KEY_ID: '${{ secrets.R2_ACCESS_KEY_ID }}',
      R2_SECRET_ACCESS_KEY: '${{ secrets.R2_SECRET_ACCESS_KEY }}',
      GH_TOKEN: '${{ github.token }}',
    });
    // The four names are the ones that the Desk reads (makeEvidenceStore), so a variable that is renamed there fails here.
    for (const name of R2_VARIABLES) expect(run.env).toHaveProperty(name);
  });

  it('is the step that has an id, so that the steps after it can say whether it ran', () => {
    expect(run.id).toBe('desk');
  });
});

describe('desk.yml: the secrets', () => {
  it('are named only in the env of a step, and nowhere else: not in a command, not in a condition, not in a name, not in an input of an action', () => {
    for (const { path: where, value } of stringsWith(workflow, 'secrets.')) {
      expect(where, `${where}: ${value}`).toMatch(/^jobs\.[a-z]+\.steps\.\d+\.env\.[A-Z0-9_]+$/);
      expect(value).toMatch(/^\$\{\{ secrets\.[A-Z0-9_]+ \}\}$/);
    }
    expect(stringsWith(workflow, 'secrets.').length).toBeGreaterThan(0);
  });

  it('never appear in a command: no run: has an expression at all, so that nothing is pasted into a script, and none names a secret or prints the environment', () => {
    const commands = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command, command).not.toContain('${{');
      expect(command, command).not.toMatch(/ANTHROPIC|R2_|secret|token/i);
      expect(command, command).not.toMatch(/\b(?:printenv|env|set -x)\b/);
    }
  });

  it('are given to the step that runs the Desk, and to no other step', () => {
    for (const step of steps) {
      const carries = Object.values(step.env ?? {}).some((value) => value.includes('secrets.'));
      expect(carries, step.name).toBe(step.name === 'Run the Desk');
    }
  });

  it('and nothing else in the file is shaped like a key', () => {
    expect(secretsIn(text)).toEqual([]);
  });
});

describe('desk.yml: pushing what the run committed', () => {
  const push = stepNamed(workflow, 'Push what the run committed');

  /** A made-up remote (a bare repository in a folder) and a clone of it that is on main and follows origin/main, as the checkout of the workflow is. */
  function checkout() {
    const root = scratch();
    const remote = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    mkdirSync(remote);
    git(remote, 'init', '--quiet', '--bare', '-b', 'main');
    const seed = path.join(root, 'seed');
    mkdirSync(seed);
    git(seed, 'init', '--quiet', '-b', 'main');
    git(seed, 'config', 'user.name', 'Seed');
    git(seed, 'config', 'user.email', 'seed@example.com');
    writeFileSync(path.join(seed, 'a.txt'), 'a\n');
    git(seed, 'add', '.');
    git(seed, 'commit', '--quiet', '-m', 'start');
    git(seed, 'push', '--quiet', remote, 'main');
    execFileSync('git', ['clone', '--quiet', remote, work], { env: { ...process.env, ...ISOLATED } });
    git(work, 'config', 'user.name', 'github-actions[bot]');
    git(work, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
    const output = path.join(root, 'output');
    writeFileSync(output, '');
    const commit = (file: string): void => {
      writeFileSync(path.join(work, file), `${file}\n`);
      git(work, 'add', file);
      git(work, 'commit', '--quiet', '-m', `desk: ${file}`);
    };
    const step = (): string => runScript(push.run!, work, { GITHUB_OUTPUT: output });
    return { remote, work, output, commit, step, remoteHead: () => git(remote, 'rev-parse', 'main'), outputs: () => readFileSync(output, 'utf8') };
  }

  it('pushes when the run made a commit, and says so for the step that deploys', () => {
    const made = checkout();
    made.commit('b.txt');
    made.step();
    expect(made.remoteHead()).toBe(git(made.work, 'rev-parse', 'HEAD'));
    expect(made.outputs()).toBe('pushed=true\n');
  });

  it('pushes the commit of a run that failed too: the desk state says that it failed', () => {
    const made = checkout();
    made.commit('desk-state.json');
    made.step();
    expect(made.remoteHead()).toBe(git(made.work, 'rev-parse', 'HEAD'));
  });

  it('does nothing, and says that it did nothing, when the run made no commit (a day that was done, or a dry run)', () => {
    const made = checkout();
    const before = made.remoteHead();
    expect(made.step()).toContain('nothing to push');
    expect(made.remoteHead()).toBe(before);
    expect(made.outputs()).toBe('');
  });

  it('does not push a branch that the run made for a hold, which the Desk pushes itself: only what main is ahead by', () => {
    const made = checkout();
    git(made.work, 'checkout', '--quiet', '-b', 'hold/2026-10-05-a-piece');
    made.commit('held.txt');
    git(made.work, 'checkout', '--quiet', 'main');
    const before = made.remoteHead();
    made.step();
    expect(made.remoteHead()).toBe(before);
    expect(made.outputs()).toBe('');
  });

  it('fails the step when the push is refused, and does not say that it pushed', () => {
    const made = checkout();
    made.commit('b.txt');
    // Someone else pushed to main since the checkout.
    const other = path.join(path.dirname(made.work), 'other');
    execFileSync('git', ['clone', '--quiet', made.remote, other], { env: { ...process.env, ...ISOLATED } });
    git(other, 'config', 'user.name', 'Someone');
    git(other, 'config', 'user.email', 'someone@example.com');
    writeFileSync(path.join(other, 'c.txt'), 'c\n');
    git(other, 'add', '.');
    git(other, 'commit', '--quiet', '-m', 'someone');
    git(other, 'push', '--quiet', 'origin', 'main');
    expect(() => made.step()).toThrow();
    expect(made.outputs()).toBe('');
  });

  it('is asked after the run whatever way the run ended, unless the workflow was cancelled or the run never started', () => {
    expect(push.if).toBe("${{ !cancelled() && steps.desk.conclusion != 'skipped' }}");
    expect(push.id).toBe('push');
  });
});

describe('desk.yml: the artifacts', () => {
  const keep = stepNamed(workflow, 'Keep the artifacts of the run for 14 days');

  it('are the files of runs/ for 14 days, even when the run failed (that is when they are wanted), and are not an error when there are none', () => {
    expect(keep.uses).toBe('actions/upload-artifact@v7');
    expect(keep.if).toBe('${{ !cancelled() }}');
    expect(keep.with).toEqual({ name: 'desk-runs', path: 'runs/**\n!runs/tune/**\n', 'retention-days': 14, 'if-no-files-found': 'ignore' });
  });

  it('are the only thing that is uploaded: no step uploads anything else, and none names the folder of the evidence', () => {
    const uploads = steps.filter((step) => step.uses?.startsWith('actions/upload-artifact') === true);
    expect(uploads).toHaveLength(1);
    expect(text).not.toMatch(/evidence/i);
  });
});

describe('desk.yml: the deploy', () => {
  const deploy = stepNamed(workflow, 'Deploy the site');

  it('is started by hand when something was pushed, because a push by the token of a workflow starts no workflow, and by nothing else', () => {
    expect(deploy.run).toBe('gh workflow run deploy.yml --ref main');
    expect(deploy.if).toBe("${{ !cancelled() && steps.push.outputs.pushed == 'true' }}");
    expect(deploy.env).toEqual({ GH_TOKEN: '${{ github.token }}' });
  });
});

describe('desk.yml: the actions', () => {
  it('are used by a major version, the same one that the CI workflow uses for the same action', () => {
    const ci = actionsOf(loadWorkflow('ci.yml'));
    for (const action of actionsOf(workflow)) {
      expect(action, action).toMatch(/^[a-z-]+\/[a-z-]+@v\d+$/);
      const name = action.split('@')[0]!;
      const same = ci.find((candidate) => candidate.startsWith(`${name}@`));
      if (same !== undefined) expect(action).toBe(same);
    }
    expect(actionsOf(workflow)).toEqual(['actions/checkout@v7', 'actions/setup-node@v7', 'actions/upload-artifact@v7']);
  });
});
```

- [ ] **Step 6: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/workflows/desk-workflow.test.ts`
Expected: FAIL — `no such file or directory` and `desk.yml`

- [ ] **Step 7: Write the workflow**

**Create `.github/workflows/desk.yml`:**
```yaml
name: Desk

# The daily run of the Desk. It starts three times a day, so that a day whose run fails (a model that is down, a bucket that cannot be reached) is tried again;
# `--skip-if-done` makes the second and the third start do nothing when the day already has a run that did not fail. It starts by hand too (Actions > Desk > Run workflow).
#
# The secrets of the repository reach the run only through the `env` of the step that runs the Desk, and nothing here prints them. A workflow cannot be run on a
# machine other than GitHub's, so what this file says is checked by desk/test/workflows/desk-workflow.test.ts, which parses it, and proved by the first real run
# (docs/runbook.md).
on:
  schedule:
    - cron: '30 4 * * *'
    - cron: '30 6 * * *'
    - cron: '30 8 * * *'
  workflow_dispatch:

# Two runs of the Desk must never overlap, and a run that has started is never cancelled: it would leave a half-done day.
concurrency:
  group: desk
  cancel-in-progress: false

# contents: the run pushes the piece and the desk state to main. pull-requests: a held piece is sent to the owner as a draft pull request.
# actions: the push of a workflow does not start the workflows that listen for a push, so the last step starts the deploy itself.
permissions:
  contents: write
  pull-requests: write
  actions: write

jobs:
  desk:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Check out the repository, with its history
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Give the commits of the Desk a name
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

      # The outcome of the run decides how this step ends: published, held and no story are exit code 0, failed is 1, and a day that is done is 0 and runs nothing.
      - name: Run the Desk
        id: desk
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          GH_TOKEN: ${{ github.token }}
        run: npm run desk -- run --config desk.config.yml --skip-if-done

      # A run that is not dry makes one commit, whatever way it ends (the piece and the desk state, or the desk state alone). Push it, and only when there is one.
      - name: Push what the run committed
        id: push
        if: ${{ !cancelled() && steps.desk.conclusion != 'skipped' }}
        run: |
          if [ -n "$(git rev-list '@{u}..HEAD')" ]; then
            git push
            echo 'pushed=true' >> "$GITHUB_OUTPUT"
          else
            echo 'The run made no commit, so there is nothing to push.'
          fi

      # The artifacts of the run are the files of runs/: hashes, the short quotations of the claims, the drafts and the record of the run. Never the text of a page
      # (the snapshots are in the bucket, and runs/ has none), and never the trials of `desk tune`. A public repository's artifacts can be read by anyone.
      - name: Keep the artifacts of the run for 14 days
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: desk-runs
          path: |
            runs/**
            !runs/tune/**
          retention-days: 14
          if-no-files-found: ignore

      - name: Deploy the site
        if: ${{ !cancelled() && steps.push.outputs.pushed == 'true' }}
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh workflow run deploy.yml --ref main
```

- [ ] **Step 8: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/workflows/desk-workflow.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 9: Write the test of what the artifact holds**

**Create `desk/test/workflows/uploaded-runs.test.ts`:**
```ts
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defaultContext } from '@robywire/gate';
import { describe, expect, it } from 'vitest';
import { DEMO_DATE } from '../../src/demo/world';
import { loadConfig } from '../../src/config';
import { FakeClient } from '../../src/model/fake';
import { useScratch } from '../support/context';
import { SELECT, setupRun, unentailed } from '../support/run';
import { filesBelow } from '../support/site';
import { ROOT, loadWorkflow, stepNamed } from '../support/workflow';

// The workflow keeps the folder of the runs as an artifact for 14 days, and the artifacts of a public repository can be read by anyone. The pages that the Desk reads are
// somebody else's text, and the repository may hold only the short quotations of the claims (at most `spanMax` characters each) and hashes. This is made true by
// construction, in two places that these tests hold: the snapshots are in the evidence store and not in `runs/` (with `evidence.kind: r2` there is no folder of evidence at
// all), and every file that a run writes into `runs/` is of a kind that is known and checked here. So a run of every kind of ending is made in the made-up world, every file
// it wrote is listed by kind, and no string in any of them shares with any page more than a quotation's length of characters.

const scratch = useScratch();

/** The most characters of a page that an artifact may hold in one piece: the longest quotation that the gate accepts. */
const QUOTATION_MAX = defaultContext().config.spanMax;

/** The kinds of file that the orchestrator writes into the folder of a run, each with how a name of that kind looks. A file of a kind that is not here fails the test below. */
const KINDS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'the artifact of a stage', pattern: /^\d{2}-[a-z]+\.json$/ },
  { kind: 'a held draft', pattern: /^held\/[a-z0-9-]+\.json$/ },
  { kind: 'a recorded reply of the model', pattern: /^cassettes\/[0-9a-f]{64}\.json$/ },
  { kind: 'the record of the run', pattern: /^run\.json$/ },
];

/** The kind of the file `name`, a path below the folder of its day. */
const kindOf = (name: string): string | undefined => KINDS.find(({ pattern }) => pattern.test(name))?.kind;

/** The length of the longest run of characters that `a` and `b` have in common, one after the other in both. */
function longestCommonRun(a: string, b: string): number {
  let longest = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = (previous[j - 1] as number) + 1;
        if ((row[j] as number) > longest) longest = row[j] as number;
      }
    }
    previous = row;
  }
  return longest;
}

/** Every string in a value read from JSON (the values, not the names of the fields). */
const stringsIn = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn);
  return [];
};

/** The patterns of an upload step, one to a line, as the action reads them: a line that starts with `!` takes files out. */
function uploaded(patterns: string, files: readonly string[]): string[] {
  const regexp = (glob: string): RegExp =>
    new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')}$`);
  const lines = patterns.split('\n').filter((line) => line.trim() !== '');
  const wanted = lines.filter((line) => !line.startsWith('!')).map(regexp);
  const unwanted = lines.filter((line) => line.startsWith('!')).map((line) => regexp(line.slice(1)));
  return files.filter((file) => wanted.some((pattern) => pattern.test(file)) && !unwanted.some((pattern) => pattern.test(file)));
}

/** A run of the made-up world that ends the way `how` says, with its replies recorded as the workflow's runs are. Not dry: the piece is published to a made-up site. */
async function aRun(how: 'published' | 'held' | 'no-story' | 'failed') {
  const made = setupRun(scratch, {
    record: true,
    ...(how === 'held' ? { fake: unentailed() } : {}),
    // No story because Extract keeps too few claims: the pages were fetched, so they are in the store.
    ...(how === 'no-story' ? { fake: new FakeClient().script('select', SELECT).script('extract', { claims: [] }) } : {}),
    ...(how === 'failed'
      ? {
          stages: {
            compose: async () => {
              throw new Error('the composer fell over');
            },
          },
        }
      : {}),
  });
  const result = await made.run();
  expect(result.outcome).toBe(how);
  const day = path.join(made.config.runDir, DEMO_DATE);
  const pages = readdirSync(made.config.evidenceDir)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => readFileSync(path.join(made.config.evidenceDir, name), 'utf8'));
  return { day, files: filesBelow(day), pages };
}

const ENDINGS = ['published', 'held', 'no-story', 'failed'] as const;

describe('the folder of a run, as the workflow uploads it', () => {
  it.each(ENDINGS)('has only files of the kinds that are known, when the run %s', async (how) => {
    const { files } = await aRun(how);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(kindOf(file), file).toBeDefined();
  });

  it('has, over the four ways that a run can end, every kind that there is and no other: a new kind of file makes this test fail, so that someone decides whether it may be public', async () => {
    const kinds = new Set<string>();
    for (const how of ENDINGS) for (const file of (await aRun(how)).files) kinds.add(kindOf(file) as string);
    expect([...kinds].sort()).toEqual(KINDS.map(({ kind }) => kind).sort());
  });

  it.each(ENDINGS)('holds no more of any page than the length of a quotation, in any string of any file, when the run %s', async (how) => {
    const { day, files, pages } = await aRun(how);
    expect(pages.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(path.join(day, file), 'utf8');
      for (const string of stringsIn(JSON.parse(text))) {
        for (const page of pages) expect(longestCommonRun(string, page), `${file} shares ${longestCommonRun(string, page)} characters in a row with a page`).toBeLessThanOrEqual(QUOTATION_MAX);
      }
    }
  });

  it('does hold the quotations of its claims, so that the test above is looking at something', async () => {
    const { day, pages } = await aRun('published');
    const quotes = (JSON.parse(readFileSync(path.join(day, '04-extract.json'), 'utf8')) as { claims: { span: { quote: string } }[] }).claims.map((claim) => claim.span.quote);
    expect(quotes.length).toBeGreaterThan(3);
    for (const quote of quotes) expect(pages.some((page) => page.includes(quote))).toBe(true);
  });

  it('keeps no snapshot: not a file of text of a page, whatever its name', async () => {
    const { day, files, pages } = await aRun('published');
    for (const file of files) for (const page of pages) expect(readFileSync(path.join(day, file), 'utf8'), file).not.toContain(page);
  });
});

describe('longestCommonRun, which says how much of a page is in a string', () => {
  const page = 'Fixture Robotics announced that deliveries have started to a second plant, and the company said the arm needs no new safety cage.';

  it('says the length of the longest stretch that the two have in common, and 0 for none', () => {
    expect(longestCommonRun('abcdef', 'xxcdexx')).toBe(3);
    expect(longestCommonRun('abc', 'xyz')).toBe(0);
    expect(longestCommonRun('', 'xyz')).toBe(0);
    expect(longestCommonRun(page, page)).toBe(page.length);
  });

  it('finds a page that is copied into a longer string, so a leak of the whole page would fail the test', () => {
    const leaked = `{"notes": "${page}${page}"}`;
    expect(longestCommonRun(leaked, page)).toBe(page.length);
    expect(longestCommonRun(leaked, page + page)).toBe(page.length * 2);
    expect(longestCommonRun(`${page.slice(0, 40)}-${page.slice(40)}`, page)).toBeLessThan(page.length);
  });
});

describe('desk.yml: what the artifact step takes', () => {
  const patterns = stepNamed(loadWorkflow('desk.yml'), 'Keep the artifacts of the run for 14 days').with!.path as string;

  it('takes every file of every kind that a run writes, below the folder that the settings give the runs', async () => {
    const { runDir } = loadConfig(`${ROOT}desk.config.yml`);
    const all: string[] = [];
    for (const how of ENDINGS) all.push(...(await aRun(how)).files.map((file) => `${runDir}/${DEMO_DATE}/${file}`));
    expect(all.length).toBeGreaterThan(10);
    expect(uploaded(patterns, all)).toEqual(all);
  });

  it('takes nothing else: not the evidence, not the trials of `desk tune`, not the site, not the settings, not a file that begins with a dot', () => {
    const others = [
      'evidence/1f1ad911cc7868886e36831a9bee848782f8f6d838d715e448c149f012762e8f.txt',
      'evidence/1f1ad911cc7868886e36831a9bee848782f8f6d838d715e448c149f012762e8f.json',
      'runs/tune/20261006-120000/evidence/abc.txt',
      'runs/tune/20261006-120000/tune.json',
      'site/src/content/news/a-piece.mdx',
      'desk.config.yml',
      '.env',
      'package.json',
    ];
    expect(uploaded(patterns, others)).toEqual([]);
  });

  it('is told by this test what it takes: a pattern that took the evidence would take its file', () => {
    expect(uploaded('runs/**\nevidence/**', ['evidence/a.txt', 'runs/x/run.json'])).toEqual(['evidence/a.txt', 'runs/x/run.json']);
    expect(uploaded('runs/**\n!runs/tune/**', ['runs/tune/x/run.json', 'runs/2026-10-05/run.json'])).toEqual(['runs/2026-10-05/run.json']);
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/workflows/uploaded-runs.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

This test describes what the pipeline and the workflow already do, so it passes the first time. The next step shows that it can fail: take the exclusion of the trials out of the upload, and the test that lists what the step takes must fail.

- [ ] **Step 10: Show that it can fail**

Run: `node -e "const fs=require('fs');const f='.github/workflows/desk.yml';const t=fs.readFileSync(f,'utf8');const line='            !runs/tune/**\n';if(!t.includes(line))throw new Error('not found');fs.writeFileSync(f,t.replace(line,''))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/workflows/uploaded-runs.test.ts test/workflows/desk-workflow.test.ts`
Expected: FAIL — `takes nothing else`

Put the line back.

Run: `node -e "const fs=require('fs');const f='.github/workflows/desk.yml';const t=fs.readFileSync(f,'utf8');const at='            runs/**\n';if(!t.includes(at))throw new Error('not found');fs.writeFileSync(f,t.replace(at,at+'            !runs/tune/**\n'))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/workflows`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 11: Say it in the README, and keep it true**

The tests first.

**In `desk/test/readme.test.ts`, replace:**
```ts
    expect(command).toContain('come from the environment, never from this file');
  });
});
```

**with:**
```ts
    expect(command).toContain('come from the environment, never from this file');
  });
});

describe('the README: the daily workflow', () => {
  const workflow = (): string => section('The daily workflow');

  it('says when it starts, that it runs one at a time, and the command that it runs', () => {
    expect(workflow()).toContain('04:30, 06:30 and 08:30 UTC every day and by hand');
    expect(workflow()).toContain('the concurrency group `desk`, which never cancels a run that has started');
    expect(workflow()).toContain('`npm run desk -- run --config desk.config.yml --skip-if-done`');
  });

  it('says where the secrets go and that a test fails if that stops being true', () => {
    expect(workflow()).toContain('given to the one step that runs the Desk, in its `env`, and nowhere else');
    expect(workflow()).toContain('A test fails if that stops being true.');
  });

  it('says what is pushed, why the last step starts the deploy by hand, and what is kept as an artifact and why no page text is in it', () => {
    expect(workflow()).toContain('`git rev-list @{u}..HEAD`');
    expect(workflow()).toContain('A push by the token of a workflow starts no other workflow');
    expect(workflow()).toContain('kept as an artifact for 14 days, even when the run failed, except `runs/tune/`');
    expect(workflow()).toContain('no page text goes there');
    expect(workflow()).toContain('shares more than the length of a quotation (300 characters) with a page');
  });

  it('says that nothing could run it, that the versions of the actions were not checked, and what it assumes of the repository', () => {
    expect(workflow()).toContain('A workflow cannot be run anywhere but on GitHub');
    expect(workflow()).toContain('were not checked against GitHub');
    expect(workflow()).toContain('no branch protection that forbids it');
  });

  it('is no longer listed as not built, and the schedule is said to have never run', () => {
    expect(section('The desk workspace')).not.toContain('the GitHub Actions workflow that runs the Desk every day');
    expect(section('Which parts are live')).toContain('`.github/workflows/desk.yml`, which tests read and which has never run on GitHub');
  });
});

describe('the README: a day that is done, for a schedule', () => {
  it('says what --skip-if-done does, what it needs and does not need, and what it does not change', () => {
    const command = section('The desk command');
    expect(command).toContain('[--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]');
    expect(command).toContain('The command prints `outcome: refused-already-done` and exits 0, and runs nothing (asks no model, fetches nothing, writes nothing, and needs no key and no bucket)');
    expect(command).toContain('The desk state is the record that a scheduled job has, because it starts from a fresh checkout and has no folder of runs.');
    expect(command).toContain('Every other refusal is still exit code 1, and `--skip-if-done` cannot be given with `--force-new`.');
    expect(command).toContain('and for a day that `--skip-if-done` left alone');
  });
});

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: FAIL — `The daily workflow`

Then the README: the flag in the description of `run`, the new section "The daily workflow", and the two places that said that the schedule is not built.

**In `README.md`, replace:**
```markdown
## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that do not yet run for real: the private evidence store (the Desk keeps its evidence in a folder on disk unless a file of settings asks for the bucket, which is built and tested against a stand-in that checks every signature, and has never been used against Cloudflare), the independent model check (built and tested with scripted models, and measured on no real model), the daily schedule (not built) and the pipeline that writes and publishes (built and tested offline, and it has never published a real piece). Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace
```

**with:**
```markdown
## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that do not yet run for real: the private evidence store (the Desk keeps its evidence in a folder on disk unless a file of settings asks for the bucket, which is built and tested against a stand-in that checks every signature, and has never been used against Cloudflare), the independent model check (built and tested with scripted models, and measured on no real model), the daily schedule (written as the workflow `.github/workflows/desk.yml`, which tests read and which has never run on GitHub) and the pipeline that writes and publishes (built and tested offline, and it has never published a real piece). Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace
```

**In `README.md`, replace:**
```markdown
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**with:**
```markdown
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the Cloudflare deploy, a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**In `README.md`, replace:**
```markdown
`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. `--client api` with `--sources fixtures` is refused with exit code 2, dry or not: it would spend money on the answers of a model about pages that are made up, which are worth nothing (use `--client fake` for the scripted story, or `--sources live`). A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run).
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state. The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has: when the record is not there, or is of another run, status says that the try is not known and why.
```

**with:**
```markdown
`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. `--client api` with `--sources fixtures` is refused with exit code 2, dry or not: it would spend money on the answers of a model about pages that are made up, which are worth nothing (use `--client fake` for the scripted story, or `--sources live`). A day that published, was held or found no story is refused unless `--force-new` is given; a day whose run failed is run again with the same command, and the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run). `--skip-if-done` is for a schedule that starts the command more than once a day (see The daily workflow): a day that is done is then not an error but a day to leave alone. The command prints `outcome: refused-already-done` and exits 0, and runs nothing (asks no model, fetches nothing, writes nothing, and needs no key and no bucket), when the desk state says that the last run was of this day and did not fail, or when `runs/<date>/run.json` is there and says the same. The desk state is the record that a scheduled job has, because it starts from a fresh checkout and has no folder of runs. Every other refusal is still exit code 1, and `--skip-if-done` cannot be given with `--force-new`.
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same. The record of the run says which client and which sources it used, so a replay needs no flag for them; `--sources` and `--client` are only checks, and one that contradicts the record is refused with exit code 2 (a replay with another registry would differ for that reason alone). A run made with `--client recorded` has no replies in its own folder, so replay it with `--cassettes`. A record from before records said how a run was made has no such information and needs `--sources`.
- `npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state. The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has: when the record is not there, or is of another run, status says that the try is not known and why.
```

**In `README.md`, replace:**
```markdown
`desk.config.yml` at the root of the repository is the file of settings of the daily run: the real user agent (it links to the /method page of the live site), `evidence: { kind: r2 }`, the folder of the runs, `maxAttemptsPerDay` and the budget of a run. It is committed, so it holds no secret, and it names no model (the models are the defaults of `desk/src/config.ts`). The key of the model and the four variables of the bucket come from the environment, never from this file. `desk/test/production-config.test.ts` loads it and checks all of this.

The exit code is 0 for a run that published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.

`npm run desk:demo` runs the whole pipeline once as one command, `desk run --dry --client fake --sources fixtures`, and then replays the run. It exits 0 only if the made-up story ended published in a dry run, nothing was written to the site and git was not asked to commit, and the replay found every artifact equal. It is a step of `npm run verify`. The last line it prints says what it has shown, and what it has not: `desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality`. The model and the verifier of the demo are scripts written to pass, so it shows that the stages fit together and that a run can be replayed, and nothing about how well a real model writes or a real verifier judges.
```

**with:**
```markdown
`desk.config.yml` at the root of the repository is the file of settings of the daily run: the real user agent (it links to the /method page of the live site), `evidence: { kind: r2 }`, the folder of the runs, `maxAttemptsPerDay` and the budget of a run. It is committed, so it holds no secret, and it names no model (the models are the defaults of `desk/src/config.ts`). The key of the model and the four variables of the bucket come from the environment, never from this file. `desk/test/production-config.test.ts` loads it and checks all of this.

The exit code is 0 for a run that published, held or found no story (and for a day that `--skip-if-done` left alone), for a replay that came out equal and for a correction that was made, 1 for a run that failed or was refused, for a replay that differs and for a correction that was refused or failed, and 2 for a mistake in the arguments.

`npm run desk:demo` runs the whole pipeline once as one command, `desk run --dry --client fake --sources fixtures`, and then replays the run. It exits 0 only if the made-up story ended published in a dry run, nothing was written to the site and git was not asked to commit, and the replay found every artifact equal. It is a step of `npm run verify`. The last line it prints says what it has shown, and what it has not: `desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality`. The model and the verifier of the demo are scripts written to pass, so it shows that the stages fit together and that a run can be replayed, and nothing about how well a real model writes or a real verifier judges.
```

**In `README.md`, replace:**
```markdown
**How the bucket is made.** The runbook makes it, once, outside this plan: a bucket that is private; a rule that deletes the objects of the prefix `pending/` 90 days after they were written (and none for `published/`); an API token that may read and write objects, limited to this bucket; and the four variables set as secrets of the workflow. The store is built and tested with no bucket and no network: every test gives it a bucket made of memory that answers as S3 does and refuses a request whose signature it cannot check. It has never been used against Cloudflare, so what R2 answers to a real request is for the first real run to confirm.

## The verifier evals

```

**with:**
```markdown
**How the bucket is made.** The runbook makes it, once, outside this plan: a bucket that is private; a rule that deletes the objects of the prefix `pending/` 90 days after they were written (and none for `published/`); an API token that may read and write objects, limited to this bucket; and the four variables set as secrets of the workflow. The store is built and tested with no bucket and no network: every test gives it a bucket made of memory that answers as S3 does and refuses a request whose signature it cannot check. It has never been used against Cloudflare, so what R2 answers to a real request is for the first real run to confirm.

## The daily workflow

`.github/workflows/desk.yml` runs the Desk. It starts at 04:30, 06:30 and 08:30 UTC every day and by hand (Actions, Desk, Run workflow), one run at a time (the concurrency group `desk`, which never cancels a run that has started), and runs `npm run desk -- run --config desk.config.yml --skip-if-done` after a checkout with the whole history, Node from `.nvmrc` and `npm ci`. The first start of a day does the day's work; the second and the third do nothing when the day already has a run that did not fail, and run the day again when it did. The commits of the Desk are by `github-actions[bot]`.

- **Secrets.** `ANTHROPIC_API_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are secrets of the repository, and they are given to the one step that runs the Desk, in its `env`, and nowhere else: no command in the file has an expression, names a secret or prints the environment. A test fails if that stops being true.
- **What is pushed.** A run that is not dry makes one commit, whatever way it ends. The step after the run pushes `main` when `git rev-list @{u}..HEAD` says that there is something to push, and a held piece's branch is pushed by the Desk itself. A push by the token of a workflow starts no other workflow, so when something was pushed the last step starts the deploy workflow by hand (`gh workflow run deploy.yml --ref main`), which is why the token may start workflows.
- **What is kept.** The files of `runs/` are kept as an artifact for 14 days, even when the run failed, except `runs/tune/`. Artifacts of a public repository can be read by anyone, so no page text goes there: the snapshots are in the bucket and `runs/` has none, `desk/test/workflows/uploaded-runs.test.ts` lists every kind of file that a run writes and fails for a new kind, and no string in any of them shares more than the length of a quotation (300 characters) with a page.
- **Failure.** The job fails when the run fails (exit code 1), so GitHub tells the owner.
- **What is not proved.** A workflow cannot be run anywhere but on GitHub. The tests read the file with a YAML parser and run its two small scripts in a made-up repository; the first real run (docs/runbook.md, when it is written) is the proof, and the versions of the actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) were not checked against GitHub, because nothing in the plan may use the network: the runbook says how to check them. The workflow assumes a repository where the token of a workflow may push to `main` (no branch protection that forbids it) and may open pull requests (a setting of the repository), which only the first real run can show.

## The verifier evals

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' .github/workflows/desk.yml desk/src/cli.ts desk/test/cli.test.ts desk/test/run-states.test.ts desk/test/support/workflow.ts desk/test/workflows/desk-workflow.test.ts desk/test/workflows/uploaded-runs.test.ts README.md`
Expected: PASS — prints nothing

- [ ] **Step 12: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 13: Commit**

```bash
git add .github/workflows/desk.yml README.md desk/src/cli.ts desk/test/cli.test.ts desk/test/readme.test.ts desk/test/run-states.test.ts desk/test/support/workflow.ts desk/test/workflows
git commit -m "feat(desk): the daily workflow, desk.yml, which starts the Desk at 04:30, 06:30 and 08:30 UTC and by hand, one run at a time, with the secrets only in the env of the step that runs it, the push of what the run committed, the folder of the runs kept for 14 days without any page text, and a deploy started by hand after a push, and desk run --skip-if-done, which leaves a day that is done alone with exit code 0, from the desk state of a fresh checkout or from the folder of the runs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 14: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing

---

### Task 25: The deploy workflow

**Files:**
- Modify: `package.json`, `package-lock.json` (`wrangler`, installed by `npm`)
- Create: `wrangler.jsonc`
- Create: `.github/workflows/deploy.yml`
- Modify: `.gitignore`, `desk/test/gitignore.test.ts`
- Modify: `desk/test/support/secrets.ts`, `desk/test/secret-shapes.test.ts` (the id of a Cloudflare account)
- Create: `desk/test/workflows/deploy-workflow.test.ts`, `desk/test/workflows/wrangler-config.test.ts`, `desk/test/workflows/workflows.test.ts`
- Modify: `README.md` (the section "The deploy workflow"), `desk/test/readme.test.ts`

The site is already live: it was deployed once, by hand, at `https://agentic-media-house.joshi-alok.workers.dev`, with `wrangler deploy --assets site/dist --name agentic-media-house`, run from a folder outside the repository. This task makes the repository do it: every push to `main` builds the site, audits the build, and deploys it.

**A Worker with static assets, not a Pages project.** Cloudflare's own program (`wrangler`) now recommends Workers for every new project, and will not create a new Pages project without an option that is not documented. A Worker whose only content is static assets does exactly what a static site needs: it serves the files of a folder, and answers an address that has no file with the page `404.html` that the site builds. What it needs is a settings file, `wrangler.jsonc`, that names the Worker and the folder.

**Why the settings file is not optional here.** The repository is an npm workspace, and `wrangler deploy` at the root of a workspace with no settings file refuses to run (its detection of the application "has been run in the root of a workspace instead of targeting a specific project"). Step 2 shows it. With the file it runs there (step 7 shows that, without deploying).

**What is in the file, and what is not.** The name of the Worker (`agentic-media-house`), the date of the runtime that it is made for (`2026-10-01`), that it is served at its address at `workers.dev`, and the assets: the folder (`./site/dist`, where the production build of the site writes, and which the audit reads), how an address with and without a slash at the end is answered (`auto-trailing-slash`, which is what the Worker that is already live does), and the page for an address that has none (`404-page`). Nothing else: no account id, no token, no route, no variable. The account and the token come from secrets of the repository, as the environment of the one step that deploys.

**The program is pinned.** `wrangler` is installed as a development dependency of the root, at one exact version (`4.148.0`, which was the latest when this plan was verified), so that what is deployed with is what was tested with. The tests check that the version in `package.json`, the one in `node_modules` and the one in the lock file are the same, and that every setting of the file is one that this version knows, by reading the schema that the program ships.

**The workflow.** On a push to `main` and by hand (the daily workflow of Task 24 starts it by hand, because a push by the token of a workflow starts no other workflow): check out, Node from `.nvmrc`, `npm ci`, `npm run build`, `npm run audit:prod`, `npx wrangler deploy`. There is no condition and no `continue-on-error` on any step, so a step that fails stops the ones after it: **a site that does not build, or whose audit fails, is never deployed**. The build is given the address that the site says it is at (canonical links, the sitemap, the feed) from the repository variable `SITE_URL`, and the address that the site is already live at when there is none, so that a domain of its own, later, is a change of one variable (and of the user agent of `desk.config.yml`, which a test makes sure of). `concurrency: { group: deploy, cancel-in-progress: true }`: a newer deploy replaces an older one that is still running. The token and the account of Cloudflare are in the `env` of the deploy step and nowhere else.

**One test for all three workflows.** `workflows.test.ts` reads CI, the daily run and the deploy together with `package.json`, and fails when they disagree: an `npm run X` whose script does not exist, an `npx` program that the root does not pin, an action at one major version in one file and another in the next, a workflow that starts one that cannot be started, a secret that is not in an `env`.

**What nothing here proves.** A workflow cannot be run on any machine but GitHub's, and the secrets of Cloudflare are not here, so `wrangler deploy` itself is not run in this plan. The dry run (step 7) bundles what would be uploaded and exits. The first real run is in the runbook (Task 27).

- [ ] **Step 1: Install wrangler**

`--save-exact` writes the version without a caret. The version is named so that the command gives the same program on any day.

Run: `npm install --save-exact --save-dev wrangler@4.148.0`
Expected: PASS — `added`

Run: `grep -n '"wrangler"' package.json`
Expected: PASS — `"wrangler": "4.148.0"`

The lock file gains the program and what it depends on (about eighty entries, none of them a version of a package that was there). If `npm` resolves a package that wrangler depends on to a newer patch version than the one in this plan's repository, `package-lock.json` differs, and that is not an error.

- [ ] **Step 2: See what wrangler does at the root of the workspace with no settings file**

`WRANGLER_SEND_METRICS=false` keeps its usage statistics from being sent, and `CI=true` stops it asking questions. `--dry-run` says that nothing is uploaded, and nothing can be: there is no token.

Run: `WRANGLER_SEND_METRICS=false CI=true npx wrangler deploy --dry-run`
Expected: FAIL — `root of a workspace`

- [ ] **Step 3: Write the tests**

The id of a Cloudflare account is 32 hexadecimal digits, and nothing that is committed needs it, so `secretsIn` (Task 23) learns the shape first.

**In `desk/test/secret-shapes.test.ts`, replace:**
```ts
  });

  it('finds a secret of forty characters or more that mixes capitals, small letters and digits, which is how the secret of an access key and a token of Cloudflare look', () => {
    expect(secretsIn(`secret: ${MIXED}`)).toEqual(['a long mixed token (line 1)']);
```

**with:**
```ts
  });

  it('finds the id of a Cloudflare account, which is thirty-two hexadecimal digits, and not a longer or a shorter run', () => {
    expect(secretsIn(`account_id: ${'0123456789abcdef'.repeat(2)}`)).toEqual(['an account id (line 1)']);
    expect(secretsIn(`account_id: "${'0123456789abcdef'.repeat(2)}"`)).toEqual(['an account id (line 1)']);
    expect(secretsIn(`account_id: ${'0123456789abcdef'.repeat(2).slice(0, 31)}`)).toEqual([]);
    expect(secretsIn(`hash: ${'0123456789abcdef'.repeat(2)}0`)).toEqual([]);
  });

  it('finds a secret of forty characters or more that mixes capitals, small letters and digits, which is how the secret of an access key and a token of Cloudflare look', () => {
    expect(secretsIn(`secret: ${MIXED}`)).toEqual(['a long mixed token (line 1)']);
```

**In `desk/test/support/secrets.ts`, replace:**
```ts
  { name: 'a token of GitHub', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

```

**with:**
```ts
  { name: 'a token of GitHub', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // The id of a Cloudflare account is 32 hexadecimal digits. It is not a secret by itself, but nothing that is committed needs it: it comes from a secret of the repository.
  { name: 'an account id', pattern: /\b[0-9a-f]{32}\b/ },
];

```

The two new folders that the program makes are never committed, and the file that it reads is.

**In `desk/test/gitignore.test.ts`, replace:**
```ts
  });
});
```

**with:**
```ts
  });
});

describe('.gitignore: what the Cloudflare program keeps', () => {
  it('ignores the state of wrangler and the file of secrets of wrangler dev, anywhere', () => {
    expect(ignored('.wrangler/tmp/bundle.js')).toBe(true);
    expect(ignored('.dev.vars')).toBe(true);
    expect(ignored('.dev.vars.production')).toBe(true);
  });

  it('does not ignore the settings that wrangler reads, which are committed', () => {
    expect(ignored('wrangler.jsonc')).toBe(false);
  });
});

```

The tests of the three files.

**Create `desk/test/workflows/deploy-workflow.test.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { secretsIn } from '../support/secrets';
import { ROOT, loadWorkflow, stepNamed, stepsOf, stringsWith, workflowText } from '../support/workflow';

// `.github/workflows/deploy.yml` puts the site on Cloudflare. Nothing can run it here, so these tests read it as data and say every property that matters: when it starts,
// that a newer deploy replaces an older one, what the token may do, the steps in their order (so that a build or an audit that fails stops the deploy), what the build is for
// (production, never the fixtures), and that the two secrets of Cloudflare reach the deploy and nothing else.

const workflow = loadWorkflow('deploy.yml');
const text = workflowText('deploy.yml');
const steps = stepsOf(workflow);
const SITE_URL_DEFAULT = 'https://agentic-media-house.joshi-alok.workers.dev';

describe('deploy.yml: when it starts', () => {
  it('starts on a push to main, and by hand, and at nothing else: not on a pull request, not on a schedule', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(workflow.on.push).toEqual({ branches: ['main'] });
  });

  it('lets a newer deploy cancel an older one that is still running', () => {
    expect(workflow.concurrency).toEqual({ group: 'deploy', 'cancel-in-progress': true });
  });

  it('may read the repository and do nothing else: the secrets are what it deploys with', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs)) expect(job).not.toHaveProperty('permissions');
  });

  it('has one job, on Ubuntu, with a time after which GitHub stops it', () => {
    const jobs = Object.values(workflow.jobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!['runs-on']).toBe('ubuntu-latest');
    expect(jobs[0]!['timeout-minutes']).toBeGreaterThan(0);
  });
});

describe('deploy.yml: the steps, in order', () => {
  it('checks out, sets up Node, installs, builds, audits the build, and deploys', () => {
    expect(steps.map((step) => step.name)).toEqual(['Check out the repository', 'Set up Node', 'Install dependencies', 'Production build', 'Audit the production build', 'Deploy to Cloudflare']);
    expect(steps.map((step) => step.uses ?? step.run)).toEqual(['actions/checkout@v7', 'actions/setup-node@v7', 'npm ci', 'npm run build', 'npm run audit:prod', 'npx wrangler deploy']);
  });

  it('stops at the first step that fails: no step has a condition or continue-on-error, so a build that fails or an audit that fails is never followed by the deploy', () => {
    for (const step of steps) {
      expect(step, step.name).not.toHaveProperty('if');
      expect(step, step.name).not.toHaveProperty('continue-on-error');
    }
  });

  it('uses the Node of .nvmrc and the cache of npm, and installs exactly what the lock file says', () => {
    expect(stepNamed(workflow, 'Set up Node').with).toEqual({ 'node-version-file': '.nvmrc', cache: 'npm' });
    expect(stepNamed(workflow, 'Install dependencies').run).toBe('npm ci');
  });

  it('builds the production site and audits that build, with the same two commands as CI, and never builds the fixtures', () => {
    const ci = loadWorkflow('ci.yml');
    const ciRuns = stepsOf(ci).flatMap((step) => (step.run === undefined ? [] : [step.run]));
    expect(ciRuns).toContain(stepNamed(workflow, 'Production build').run);
    expect(ciRuns).toContain(stepNamed(workflow, 'Audit the production build').run);
    expect(text).not.toContain('build:fixtures');
    expect(text).not.toContain('ROBYWIRE_FIXTURES');
  });

  it('deploys with the program that the root package pins, from the settings of wrangler.jsonc, and with no flag that would say otherwise', () => {
    const deploy = stepNamed(workflow, 'Deploy to Cloudflare');
    expect(deploy.run).toBe('npx wrangler deploy');
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('deploy.yml: the address of the site', () => {
  it('is the variable SITE_URL of the repository, and the address that the site is already live at when there is none, for the build and for nothing else', () => {
    expect(stepNamed(workflow, 'Production build').env).toEqual({ SITE_URL: `\${{ vars.SITE_URL || '${SITE_URL_DEFAULT}' }}` });
    for (const step of steps) if (step.name !== 'Production build') expect(step.env ?? {}, step.name).not.toHaveProperty('SITE_URL');
  });

  it('is on the same host as the /method page that the user agent of the daily run links to, so that a site that moves changes both or fails here', () => {
    const settings = parse(readFileSync(`${ROOT}desk.config.yml`, 'utf8')) as { userAgent: string };
    const linked = /\(\+(https?:\/\/[^)\s]+)\)/.exec(settings.userAgent)?.[1];
    expect(linked).toBeDefined();
    expect(new URL(linked!).host).toBe(new URL(SITE_URL_DEFAULT).host);
    expect(new URL(linked!).pathname).toBe('/method');
  });
});

describe('deploy.yml: the secrets', () => {
  it('are the token and the account of Cloudflare, in the env of the step that deploys, and nowhere else: not in a command, not in a condition, not in another step', () => {
    for (const { path: where, value } of stringsWith(workflow, 'secrets.')) {
      expect(where, `${where}: ${value}`).toMatch(/^jobs\.deploy\.steps\.5\.env\.CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)$/);
    }
    expect(stepNamed(workflow, 'Deploy to Cloudflare').env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      WRANGLER_SEND_METRICS: 'false',
    });
  });

  it('never appear in a command: no run: has an expression, names a secret, or prints the environment', () => {
    for (const step of steps) {
      if (step.run === undefined) continue;
      expect(step.run).not.toContain('${{');
      expect(step.run).not.toMatch(/CLOUDFLARE|secret|token|printenv|set -x/i);
    }
  });

  it('and nothing else in the file is shaped like a key or an account id', () => {
    expect(secretsIn(text)).toEqual([]);
  });
});
```

**Create `desk/test/workflows/wrangler-config.test.ts`:**
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { secretsIn } from '../support/secrets';
import { ROOT } from '../support/workflow';

// `wrangler.jsonc` at the root of the repository is what `wrangler deploy` reads: the name of the Worker, the folder of the site that it serves, and nothing that is secret.
// The first deploy was made by hand, from a folder outside the workspace, with `--assets site/dist --name agentic-media-house`; wrangler refuses to run at the root of an npm
// workspace without a settings file (it says that its detection of the application "has been run in the root of a workspace"), and with this file it runs there. The file is
// held to the schema that the installed wrangler ships (`node_modules/wrangler/config-schema.json`), so that a setting that this version does not know fails here and not on GitHub.

const TEXT = readFileSync(`${ROOT}wrangler.jsonc`, 'utf8');
const SETTINGS = JSON.parse(TEXT) as { name: string; compatibility_date: string; workers_dev: boolean; assets: Record<string, string> } & Record<string, unknown>;
const SCHEMA = JSON.parse(readFileSync(`${ROOT}node_modules/wrangler/config-schema.json`, 'utf8')) as {
  definitions: { RawConfig: { properties: Record<string, unknown> }; Assets: { properties: Record<string, { enum?: string[] }> } };
};
const PKG = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { devDependencies: Record<string, string> };

describe('wrangler.jsonc: what it says', () => {
  it('names the Worker for the site, the day of the runtime it is made for, and the address at workers.dev', () => {
    expect(SETTINGS.name).toBe('agentic-media-house');
    expect(SETTINGS.compatibility_date).toBe('2026-10-01');
    expect(SETTINGS.workers_dev).toBe(true);
  });

  it('serves the folder that the production build of the site writes, and a page for an address that has none', () => {
    expect(path.resolve(ROOT, SETTINGS.assets.directory!)).toBe(path.join(ROOT, 'site', 'dist'));
    expect(SETTINGS.assets.not_found_handling).toBe('404-page');
    expect(SETTINGS.assets.html_handling).toBe('auto-trailing-slash');
  });

  it('is the folder that the build, and the audit of the build, use: astro writes dist below site, and the audit reads site/dist', () => {
    const astro = readFileSync(`${ROOT}site/astro.config.mjs`, 'utf8');
    expect(astro).not.toMatch(/outDir/);
    const siteScripts = (JSON.parse(readFileSync(`${ROOT}site/package.json`, 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(siteScripts.build).toMatch(/^astro build\b/);
    expect(readFileSync(`${ROOT}site/scripts/audit.mjs`, 'utf8')).toContain("path.join(SITE_DIR, 'dist')");
  });
});

describe('wrangler.jsonc: what it does not say', () => {
  it('has no setting but these, which are all that a Worker with static assets needs: no account, no route, no binding, no variable', () => {
    expect(Object.keys(SETTINGS).sort()).toEqual(['$schema', 'assets', 'compatibility_date', 'name', 'workers_dev']);
    expect(Object.keys(SETTINGS.assets).sort()).toEqual(['directory', 'html_handling', 'not_found_handling']);
  });

  it('holds no account id and no token: nothing in it is shaped like one, and no setting is named like one', () => {
    expect(secretsIn(TEXT)).toEqual([]);
    expect(TEXT).not.toMatch(/account|token|secret|key|password/i);
  });

  it('is plain JSON with no comment, so that it can be read by anything that reads JSON', () => {
    expect(TEXT.replace(/"[^"]*"/g, '""')).not.toMatch(/\/\/|\/\*/);
    expect([...TEXT].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('wrangler.jsonc: against the program that reads it', () => {
  it('is the settings that the installed wrangler knows: every setting is in its schema, and a value that is a choice is one of its choices', () => {
    for (const key of Object.keys(SETTINGS)) expect(SCHEMA.definitions.RawConfig.properties, key).toHaveProperty(key);
    for (const key of Object.keys(SETTINGS.assets)) expect(SCHEMA.definitions.Assets.properties, key).toHaveProperty(key);
    expect(SCHEMA.definitions.Assets.properties.html_handling!.enum).toContain(SETTINGS.assets.html_handling);
    expect(SCHEMA.definitions.Assets.properties.not_found_handling!.enum).toContain(SETTINGS.assets.not_found_handling);
  });

  it('points $schema at the file that wrangler ships, which is there', () => {
    expect(existsSync(path.join(ROOT, SETTINGS.$schema as string))).toBe(true);
  });

  it('is read by the wrangler that the root package pins to one exact version, which is the one that is installed and the one that the lock file has', () => {
    const pinned = PKG.devDependencies.wrangler!;
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect((JSON.parse(readFileSync(`${ROOT}node_modules/wrangler/package.json`, 'utf8')) as { version: string }).version).toBe(pinned);
    const lock = JSON.parse(readFileSync(`${ROOT}package-lock.json`, 'utf8')) as { packages: Record<string, { version: string }> };
    expect(lock.packages['node_modules/wrangler']!.version).toBe(pinned);
  });
});
```

**Create `desk/test/workflows/workflows.test.ts`:**
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT, actionsOf, loadWorkflow } from '../support/workflow';
import type { Workflow } from '../support/workflow';

// The three workflows of the repository (CI, the daily run of the Desk, the deploy) call the scripts of package.json and each other. A script that is renamed, a workflow
// that is deleted, or an action that is one version in one file and another in the next, would fail on GitHub and nowhere else, which is the worst place to find out. These
// tests read all of them and `package.json` and say that they agree. (`site/test/verify.test.ts` keeps the steps of CI identical to the steps of `npm run verify`.)

const FILES = readdirSync(`${ROOT}.github/workflows`).sort();
const WORKFLOWS = Object.fromEntries(FILES.map((file) => [file, loadWorkflow(file)])) as Record<string, Workflow>;
const PKG = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { scripts: Record<string, string>; devDependencies: Record<string, string> };

/** Every `run:` text of a workflow, one line at a time. */
const linesOf = (workflow: Workflow): string[] =>
  Object.values(workflow.jobs)
    .flatMap((job) => job.steps.flatMap((step) => (step.run === undefined ? [] : step.run.split('\n'))))
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** What an `npm` command line runs: a script of package.json, `npm ci`, or something that this test does not know (and so fails). */
function npmOf(line: string): { script: string } | { install: true } | { unknown: string } | undefined {
  const match = /^npm\s+(?:(run)\s+)?([\w:.-]+)/.exec(line);
  if (match === null) return undefined;
  if (match[1] === 'run' || match[2] === 'test') return { script: match[2]! };
  if (match[2] === 'ci') return { install: true };
  return { unknown: line };
}

describe('the workflows of the repository', () => {
  it('are these three, and no other: CI, the daily run of the Desk and the deploy', () => {
    expect(FILES).toEqual(['ci.yml', 'deploy.yml', 'desk.yml']);
  });

  it('each has a name, a block of permissions of its own that is not a blanket, and only jobs that run on Ubuntu', () => {
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      expect(workflow.name, file).toBeTruthy();
      expect(workflow.permissions, file).toBeDefined();
      expect(Object.values(workflow.permissions ?? {}), file).not.toContain('write-all');
      for (const job of Object.values(workflow.jobs)) expect(job['runs-on'], file).toBe('ubuntu-latest');
    }
  });

  it('call only scripts that package.json has, and no npm command but `npm ci` and the scripts', () => {
    let seen = 0;
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      for (const line of linesOf(workflow)) {
        const npm = npmOf(line);
        if (npm === undefined) continue;
        seen++;
        expect(npm, `${file}: ${line}`).not.toHaveProperty('unknown');
        if ('script' in npm) expect(PKG.scripts, `${file}: ${line}`).toHaveProperty(npm.script);
      }
    }
    expect(seen).toBeGreaterThan(15);
  });

  it('run a program of a package only when the root package pins it: `npx wrangler` is the wrangler of devDependencies, at one exact version', () => {
    const npx = Object.entries(WORKFLOWS).flatMap(([file, workflow]) => linesOf(workflow).filter((line) => line.startsWith('npx ')).map((line) => ({ file, line })));
    expect(npx).toEqual([{ file: 'deploy.yml', line: 'npx wrangler deploy' }]);
    expect(PKG.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('use every action by a major version, and one major for one action in all of them', () => {
    const majors = new Map<string, Set<string>>();
    for (const workflow of Object.values(WORKFLOWS)) {
      for (const action of actionsOf(workflow)) {
        expect(action).toMatch(/^[a-z-]+\/[a-z-]+@v\d+$/);
        const [name, major] = action.split('@') as [string, string];
        majors.set(name, (majors.get(name) ?? new Set()).add(major));
      }
    }
    expect([...majors.keys()].sort()).toEqual(['actions/checkout', 'actions/setup-node', 'actions/upload-artifact']);
    for (const [name, found] of majors) expect([...found], name).toHaveLength(1);
  });

  it('take Node from .nvmrc, wherever they set it up', () => {
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      const setups = Object.values(workflow.jobs).flatMap((job) => job.steps.filter((step) => step.uses?.startsWith('actions/setup-node') === true));
      expect(setups.length, file).toBeGreaterThan(0);
      for (const step of setups) expect(step.with?.['node-version-file'], file).toBe('.nvmrc');
    }
  });

  it('start each other only where the other can be started: the workflow that the daily run starts exists, and can be started by hand', () => {
    const starts = linesOf(WORKFLOWS['desk.yml']!).flatMap((line) => /^gh workflow run (\S+)/.exec(line)?.[1] ?? []);
    expect(starts).toEqual(['deploy.yml']);
    for (const file of starts) {
      expect(FILES).toContain(file);
      expect(WORKFLOWS[file]!.on).toHaveProperty('workflow_dispatch');
    }
    expect(WORKFLOWS['desk.yml']!.permissions).toHaveProperty('actions', 'write');
  });

  it('give a secret to a step only in its env, in all three files', () => {
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      const text = readFileSync(`${ROOT}.github/workflows/${file}`, 'utf8');
      const expressions = [...text.matchAll(/\$\{\{[^}]*secrets\.[^}]*\}\}/g)];
      for (const expression of expressions) {
        const line = text.slice(text.lastIndexOf('\n', expression.index) + 1, text.indexOf('\n', expression.index));
        expect(line.trim(), `${file}: ${line}`).toMatch(/^[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/);
      }
      for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.run !== undefined) expect(step.run, file).not.toContain('secrets.');
    }
  });
});
```

- [ ] **Step 4: Run the tests and confirm that they fail**

Run: `npm test --workspace @robywire/desk -- test/secret-shapes.test.ts test/gitignore.test.ts test/workflows`
Expected: FAIL — `no such file or directory` and `wrangler.jsonc`

- [ ] **Step 5: Write the settings and the workflow**

**Create `wrangler.jsonc`:**
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "agentic-media-house",
  "compatibility_date": "2026-10-01",
  "workers_dev": true,
  "assets": {
    "directory": "./site/dist",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

**Create `.github/workflows/deploy.yml`:**
```yaml
name: Deploy

# Builds the site for production and puts it on Cloudflare, as a Worker that serves static assets (wrangler.jsonc names the folder, site/dist). It starts on every push
# to main (a piece that the owner merged, a change of the code), and by hand: the daily workflow starts it by hand after it pushes, because a push by the token of a
# workflow starts no other workflow. A step that fails stops the ones after it, so a site that does not build, or whose audit fails, is never deployed.
#
# Cloudflare's token and account reach the one step that deploys, through its env, and nothing here prints them. A workflow cannot be run anywhere but on GitHub, so
# desk/test/workflows/deploy-workflow.test.ts reads this file as data, and the first real run (docs/runbook.md) is the proof.
on:
  push:
    branches: [main]
  workflow_dispatch:

# A newer deploy makes an older one that is still running pointless: it would put a site on Cloudflare that is already out of date.
concurrency:
  group: deploy
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out the repository
        uses: actions/checkout@v7

      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      # The address that the site says it is at (canonical links, the sitemap, the feed, robots.txt). The repository variable SITE_URL says it once there is a domain of
      # one's own; until then it is the address that the site is already live at.
      - name: Production build
        env:
          SITE_URL: ${{ vars.SITE_URL || 'https://agentic-media-house.joshi-alok.workers.dev' }}
        run: npm run build

      - name: Audit the production build
        run: npm run audit:prod

      - name: Deploy to Cloudflare
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_SEND_METRICS: 'false'
        run: npx wrangler deploy
```

**In `.gitignore`, replace:**
```text
/runs/
/evidence/
```

**with:**
```text
/runs/
/evidence/
# Wrangler (Cloudflare's program) keeps its local state in .wrangler/, and a file of secrets for `wrangler dev` in .dev.vars. Neither is ever committed.
.wrangler/
.dev.vars
.dev.vars.*
```

- [ ] **Step 6: Run the tests and confirm that they pass**

Run: `npm test --workspace @robywire/desk -- test/secret-shapes.test.ts test/gitignore.test.ts test/workflows`
Expected: PASS — `Test Files  7 passed (7)`

- [ ] **Step 7: Build the site as the workflow does, audit it, and let wrangler read what it would upload**

The build and the audit are the first two steps of the workflow, with the address that the workflow gives the build. The dry run reads the folder that the settings name and stops before it uploads anything.

Run: `SITE_URL=https://agentic-media-house.joshi-alok.workers.dev npm run build`
Expected: PASS — `14 page(s) built`

Run: `npm run audit:prod`
Expected: PASS — `Passed: 18 checks.`

Run: `WRANGLER_SEND_METRICS=false CI=true npx wrangler deploy --dry-run`
Expected: PASS — `files from the assets directory` and `--dry-run: exiting now.`

The folder that wrangler makes for its own use is not in the repository.

Run: `git status --short -- .wrangler site/dist`
Expected: PASS — prints nothing

- [ ] **Step 8: Say it in the README, and keep it true**

The tests first.

**In `desk/test/readme.test.ts`, replace:**
```ts
    expect(command).toContain('and for a day that `--skip-if-done` left alone');
  });
});

```

**with:**
```ts
    expect(command).toContain('and for a day that `--skip-if-done` left alone');
  });
});

describe('the README: the deploy workflow', () => {
  const deploy = (): string => section('The deploy workflow');

  it('says what it is: a Worker with static assets, started by a push to main and by hand, and why by hand', () => {
    expect(deploy()).toContain('as a Worker that serves static assets, not as a Pages project');
    expect(deploy()).toContain('It starts on every push to `main` and by hand');
    expect(deploy()).toContain('a push by the token of a workflow starts no other workflow');
  });

  it('says the steps, and that a step that fails stops the deploy', () => {
    expect(deploy()).toContain('`npm ci`, `npm run build`, `npm run audit:prod` and `npx wrangler deploy`');
    expect(deploy()).toContain('so a site that does not build or whose audit fails is never deployed');
  });

  it('says where the address of the site comes from, and what the settings file of Cloudflare holds', () => {
    expect(deploy()).toContain('`https://agentic-media-house.joshi-alok.workers.dev`');
    expect(deploy()).toContain('`assets.directory`, which is `./site/dist`');
    expect(deploy()).toContain('refuses to run at the root of an npm workspace');
  });

  it('says where the two secrets go, that the account id is in no committed file, and that no deploy has been made by the workflow', () => {
    expect(deploy()).toContain('`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are secrets of the repository, given to the one step that deploys');
    expect(deploy()).toContain('The account id is in no committed file.');
    expect(deploy()).toContain('no deploy has been made by this workflow: the one deploy that exists was made by hand');
  });

  it('is no longer listed as not built', () => {
    expect(section('The desk workspace')).not.toContain('the Cloudflare deploy');
  });
});

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: FAIL — `The deploy workflow`

Then the README: the new section, and the list of what is not built.

**In `README.md`, replace:**
```markdown
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the Cloudflare deploy, a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**with:**
```markdown
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**In `README.md`, replace:**
```markdown
- **What is not proved.** A workflow cannot be run anywhere but on GitHub. The tests read the file with a YAML parser and run its two small scripts in a made-up repository; the first real run (docs/runbook.md, when it is written) is the proof, and the versions of the actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) were not checked against GitHub, because nothing in the plan may use the network: the runbook says how to check them. The workflow assumes a repository where the token of a workflow may push to `main` (no branch protection that forbids it) and may open pull requests (a setting of the repository), which only the first real run can show.

## The verifier evals

```

**with:**
```markdown
- **What is not proved.** A workflow cannot be run anywhere but on GitHub. The tests read the file with a YAML parser and run its two small scripts in a made-up repository; the first real run (docs/runbook.md, when it is written) is the proof, and the versions of the actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) were not checked against GitHub, because nothing in the plan may use the network: the runbook says how to check them. The workflow assumes a repository where the token of a workflow may push to `main` (no branch protection that forbids it) and may open pull requests (a setting of the repository), which only the first real run can show.

## The deploy workflow

`.github/workflows/deploy.yml` builds the site for production and puts it on Cloudflare as a Worker that serves static assets, not as a Pages project (Cloudflare's command line recommends Workers for every new project). It starts on every push to `main` and by hand: the daily workflow starts it by hand after it pushes, because a push by the token of a workflow starts no other workflow. Its steps are `npm ci`, `npm run build`, `npm run audit:prod` and `npx wrangler deploy`, and a step that fails stops the ones after it, so a site that does not build or whose audit fails is never deployed. A newer deploy cancels an older one that is still running (the concurrency group `deploy`).

- **The address.** The build is given `SITE_URL` from the repository variable of that name, or `https://agentic-media-house.joshi-alok.workers.dev`, where the site already is, when there is none. When the site gets a domain of its own, the variable and the user agent of `desk.config.yml` change together, and a test fails if the two hosts differ before then.
- **The settings of Cloudflare.** `wrangler.jsonc` at the root holds the settings that are not secret: the name of the Worker (`agentic-media-house`), the date of the runtime, the address at `workers.dev`, and `assets.directory`, which is `./site/dist`, the folder that the production build writes and the audit reads. Without a settings file `wrangler deploy` refuses to run at the root of an npm workspace; with this one it runs there (`npx wrangler deploy --dry-run` shows that without deploying). A test holds the file to the schema that the installed wrangler ships.
- **The program.** `wrangler` is a development dependency of the root package, at one exact version, so that what is deployed with is what was tested with.
- **The secrets.** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are secrets of the repository, given to the one step that deploys, in its `env`, and nowhere else. The account id is in no committed file.
- **What is not proved.** A workflow cannot be run anywhere but on GitHub, and no deploy has been made by this workflow: the one deploy that exists was made by hand. `desk/test/workflows/` reads the three workflows and `package.json` and fails when they disagree (every `npm run` has its script, one major version for each action, Node from `.nvmrc`, secrets only in an `env`).

## The verifier evals

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' README.md wrangler.jsonc .gitignore .github/workflows/deploy.yml desk/test/support/secrets.ts desk/test/secret-shapes.test.ts desk/test/gitignore.test.ts desk/test/workflows/deploy-workflow.test.ts desk/test/workflows/wrangler-config.test.ts desk/test/workflows/workflows.test.ts`
Expected: PASS — prints nothing

- [ ] **Step 9: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 10: Commit**

```bash
git add .github/workflows/deploy.yml .gitignore README.md desk/test/gitignore.test.ts desk/test/readme.test.ts desk/test/secret-shapes.test.ts desk/test/support/secrets.ts desk/test/workflows package-lock.json package.json wrangler.jsonc
git commit -m "feat: the deploy workflow, deploy.yml, which builds the production site, audits it and puts it on Cloudflare as a Worker with static assets, on a push to main and by hand, with wrangler pinned at one exact version and wrangler.jsonc, the settings of the Worker that hold no account and no token, and tests that read the three workflows and package.json and fail when a script, an action or a secret is not where the others expect it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing

---

### Task 26: `desk tune`, the harness for the first trials with a real model

**Files:**
- Modify: `desk/src/config.ts` (the setting `prices`), `desk/test/config.test.ts`
- Modify: `desk/src/model/factory.ts` (`clientFromConfig` takes a layer to put round the chosen client), `desk/test/model/factory.test.ts`
- Create: `desk/src/run/tune.ts`
- Create: `desk/test/run/tune.test.ts`
- Modify: `desk/src/cli.ts` (the command `tune`, `CliDeps.tuneClient`)
- Create: `desk/test/tune.test.ts`
- Modify: `desk/test/fetch/exports.test.ts`
- Modify: `README.md` (the section "The tuning harness"), `desk/test/readme.test.ts`

Everything so far was tested with scripted models and made-up pages. The prompts are written, and nobody knows what a real model does with them on a real page: how many claims it proposes, how many the rules of Extract throw away and why, whether the piece it composes passes the gate, whether the model check agrees. The first real trials will find that out, and the trials need a tool that does not publish anything, spends a stated amount, and reports every step. That tool is `desk tune`:

```text
desk tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]
```

**What it does.** `<file>` lists the addresses of pages, one to a line; `#` starts a comment (but a `#` inside an address is the start of its fragment, not a comment). For each address: if it is on no host that `sources.yml` lists, it is not fetched at all (the Desk reads pages of the sources it knows). Otherwise it is fetched by the same fetcher that a run uses (`robots.txt` honoured, the pace of the settings), turned into text by the same code, kept in a folder of its own, and sent through **Extract, Compose and Verify** with the chosen client, as one story whose only page it is. Select is not run: the page *is* the story. `--trials N` runs those three steps N times on the same page (a model does not answer the same twice, and one answer says little). The table has, for each page and trial, one line for each step: how many claims the model proposed, how many each rule dropped (a claim with two reasons is counted under both), how many survived; what the gate said of the first draft, with its failure codes; what the model check said of the first draft that the gate cleared (how many of its sentences and headings were entailed, not entailed, ambiguous or without a verdict, and how many claims had a basis or a status that was not supported); how the verification ended; and the tokens. A page that cannot be tried (robots.txt forbids it, it is not found, it is of no known kind) says why. A trial that fails (a reply that does not match its schema) says why, and the next page is tried: **what happened is the result**, so none of these makes the exit code 1.

**What it costs, and the two limits.**
- *Dollars are not guessed.* The Desk does not know what a model costs. The settings may have a block `prices: { inputPerMillion: 3, outputPerMillion: 15 }`, which the owner copies from the price list, and then the table shows dollars for each trial and in all. Without the block it shows tokens only, and it shows no dollars when extract, compose and verify are not one model, because the block holds one price.
- *`--max-calls M`* (1 to 200, 40 by default) is the most model calls that the **whole invocation** may make. It is counted where a call reaches the model, so a retry counts, and a call that the Desk itself refuses does not. When the calls are spent the invocation stops where it is, says so in the table and on the error output, and exits 1, and what was done is kept.
- *The budget of the settings* (calls, tokens in, tokens out) holds **each trial**, as it holds each run: a trial is a run of the pipeline, and what a run may not spend, a trial may not either. A trial that goes over it fails, and the next trial has the whole budget again. (The stage text says that the budget of the invocation is "also bounded by the config budget". Taken literally, the default of the settings, 24 calls, would silently lower the 40 of `--max-calls`, so this reads it as the budget of a run, which is what the settings describe.)
- *The api client is refused on the made-up world* by the same function that a run asks (`refuseApiOnFixtures`). The command line has no `--sources`, so for it the pages are always live; the rule is in the code that runs the invocation (`runTune`), which a test gives the made-up world.

**What it writes.** Only below `runs/tune/<stamp>/`, where `<stamp>` is the time of the start (`20261005-043100`): `tune.json` (the table as data, checked against a schema, and written again after every trial so that a program that is stopped leaves what it did), the artifacts of each trial in `<page number>/trial-<n>/` (the same three files that a run writes, `04-extract.json`, `05-compose.json` and `06-verify.json`), and the text of the pages in `evidence/`. It never touches `site/`, the desk state or git. The pages are **not** put in the evidence store of the settings, whatever it says: the bucket holds what published pieces cite, and a page that is only being tried must not be in it. The pages are third parties' text: git ignores `runs/`, and the daily workflow (Task 24) does not upload `runs/tune/`.

**`--client fake`.** The scripted client for tuning is one that proposes **no claims** on any page: it tries the fetching and the sorting of the pages (robots, the registry, redirects, the text of the page) and costs nothing, and every page ends with "too few claims". A test gives the command a story to tell (`CliDeps.tuneClient`).

**The one change to existing code besides the command.** `clientFromConfig` builds the client of a run: retrying around budgeting around the model. Counting the calls of a whole invocation needs a layer that sees each call that *reaches the model*, inside the budget of the trial and the retrying. The function gains an optional last argument, `wrap`, a function that is given the chosen client and returns what is put in its place.

**What this does not prove.** It has been run only on scripted models and made-up pages. The runbook (Task 27) runs it on real pages and a real model, within a stated number of calls.

- [ ] **Step 1: Write the tests of the prices**

**In `desk/test/config.test.ts`, replace:**
```ts
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
```

**with:**
```ts
});

describe('the prices setting', () => {
  it('is not there unless the file has it: the Desk does not know what a model costs and never makes a price up', () => {
    expect(defaultConfig()).not.toHaveProperty('prices');
    expect(loadConfig(configFile('recencyHours: 48\n'))).not.toHaveProperty('prices');
    expect(loadConfig().prices).toBeUndefined();
  });

  it('is the price of a million tokens in and of a million tokens out, in dollars, as the file gives them', () => {
    expect(loadConfig(configFile('prices:\n  inputPerMillion: 3\n  outputPerMillion: 15\n')).prices).toEqual({ inputPerMillion: 3, outputPerMillion: 15 });
    expect(loadConfig(configFile('prices:\n  inputPerMillion: 0.8\n  outputPerMillion: 4.25\n')).prices).toEqual({ inputPerMillion: 0.8, outputPerMillion: 4.25 });
    expect(loadConfig(configFile('prices: { inputPerMillion: 1, outputPerMillion: 5 }\n'))).toEqual({ ...defaultConfig(), prices: { inputPerMillion: 1, outputPerMillion: 5 } });
  });

  it('refuses a price that is not a number above zero, a price that is missing, one that does not exist, and a block that is not a mapping, naming the setting', () => {
    expect(failure('prices:\n  inputPerMillion: 0\n  outputPerMillion: 15\n')).toBe('desk config <file>: prices.inputPerMillion: Too small: expected number to be >0');
    expect(failure('prices:\n  inputPerMillion: 3\n  outputPerMillion: -1\n')).toBe('desk config <file>: prices.outputPerMillion: Too small: expected number to be >0');
    expect(failure('prices:\n  inputPerMillion: cheap\n  outputPerMillion: 15\n')).toBe('desk config <file>: prices.inputPerMillion: Invalid input: expected number, received string');
    expect(failure('prices:\n  inputPerMillion: 3\n')).toBe('desk config <file>: prices.outputPerMillion: Invalid input: expected number, received undefined');
    expect(failure('prices:\n  inputPerMillion: 3\n  outputPerMillion: 15\n  cachedPerMillion: 1\n')).toBe('desk config <file>: prices: Unrecognized key: "cachedPerMillion"');
    expect(failure('prices: 3\n')).toBe('desk config <file>: prices: Invalid input: expected object, received number');
  });
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
```

Run: `npm test --workspace @robywire/desk -- test/config.test.ts`
Expected: FAIL — `the prices setting`

- [ ] **Step 2: Write the setting**

**In `desk/src/config.ts`, replace:**
```ts
const Evidence = z.strictObject({ kind: z.enum(EVIDENCE_KINDS) });

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
```

**with:**
```ts
const Evidence = z.strictObject({ kind: z.enum(EVIDENCE_KINDS) });

/**
 * What a million tokens of the model cost, in dollars, for the tokens that go in and for the tokens that come out. The Desk does not know the prices of a provider and never guesses them: the
 * owner reads them from the price list and writes them here, and only `desk tune` uses them, to turn the tokens that a trial reported into dollars. Without the block `desk tune` shows tokens only.
 */
const Prices = z.strictObject({ inputPerMillion: z.number().positive(), outputPerMillion: z.number().positive() });

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
```

**In `desk/src/config.ts`, replace:**
```ts
  evidenceDir: text,
  evidence: Evidence,
});
export type DeskConfig = z.infer<typeof DeskConfig>;
```

**with:**
```ts
  evidenceDir: text,
  evidence: Evidence,
  /** Tune: the price of a million tokens, for `desk tune` to show dollars. Not set unless the owner sets it. */
  prices: Prices.optional(),
});
export type DeskConfig = z.infer<typeof DeskConfig>;
```

Run: `npm test --workspace @robywire/desk -- test/config.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 3: Write the tests of the layer**

**In `desk/test/model/factory.test.ts`, replace:**
```ts
import { RecordingClient } from '../../src/model/recorded';
import { ModelError } from '../../src/model/types';
import { request } from '../support/requests';

```

**with:**
```ts
import { RecordingClient } from '../../src/model/recorded';
import { ModelError } from '../../src/model/types';
import type { ModelClient } from '../../src/model/types';
import { request } from '../support/requests';

```

**In `desk/test/model/factory.test.ts`, replace:**
```ts
});

describe('clientFromConfig with recorded responses', () => {
  it('replays the cassettes in the folder it was given', async () => {
```

**with:**
```ts
});

describe('clientFromConfig with a layer to put round the chosen client', () => {
  /** A layer that counts the calls that reach the chosen client, and keeps what each was asked. */
  const counting = () => {
    const seen: string[] = [];
    return { seen, wrap: (inner: ModelClient): ModelClient => ({ json: async (call) => (seen.push(call.user), inner.json(call)) }) };
  };

  it('puts it directly round the chosen client, so that it sees each call that reaches the model and the answer that the model gives', async () => {
    const layer = counting();
    const fake = new FakeClient().script('select', { answer: 'one' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake }, {}, noWait, undefined, layer.wrap);
    expect((await built.client.json(request())).value).toEqual({ answer: 'one' });
    expect(layer.seen).toEqual([request().user]);
    expect(fake.calls).toHaveLength(1);
  });

  it('sees every try of a call that is retried, because the retrying is outside it, and the budget counts the same tries', async () => {
    const layer = counting();
    const flaky = new FakeClient().script('select', overloaded(), { answer: 'second try' });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: flaky }, {}, noWait, undefined, layer.wrap);
    await built.client.json(request());
    expect(layer.seen).toHaveLength(2);
    expect(built.spent().calls).toBe(2);
  });

  it('sees a call that the budget refuses never, because the budget is outside it', async () => {
    const layer = counting();
    const config = { ...defaultConfig(), budget: { ...defaultConfig().budget, maxCalls: 1 } };
    const built = clientFromConfig(config, { kind: 'fake', fake: new FakeClient().script('select', { answer: 'a' }, { answer: 'b' }) }, {}, noWait, undefined, layer.wrap);
    await built.client.json(request());
    await expect(built.client.json(request())).rejects.toMatchObject({ kind: 'budget' });
    expect(layer.seen).toHaveLength(1);
  });

  it('is put round a client that is recorded too, inside the recording, so that a layer that refuses a call leaves no cassette', async () => {
    const dir = path.join(scratch, 'wrapped-recording');
    const refusing = (): ModelClient => ({
      json: async () => {
        throw new Error('the layer refused');
      },
    });
    const built = clientFromConfig(defaultConfig(), { kind: 'fake', fake: new FakeClient().script('select', { answer: 'x' }) }, {}, noWait, dir, refusing);
    await expect(built.client.json(request())).rejects.toThrow('the layer refused');
    expect(existsSync(dir)).toBe(false);
  });

  it('still needs the key of the api client, and refuses before it builds the layer', () => {
    let built = false;
    expect(() =>
      clientFromConfig(defaultConfig(), { kind: 'api' }, {}, noWait, undefined, (client) => {
        built = true;
        return client;
      }),
    ).toThrow('ANTHROPIC_API_KEY is not set');
    expect(built).toBe(false);
  });
});

describe('clientFromConfig with recorded responses', () => {
  it('replays the cassettes in the folder it was given', async () => {
```

Run: `npm test --workspace @robywire/desk -- test/model/factory.test.ts`
Expected: FAIL — `a layer to put round the chosen client`

- [ ] **Step 4: Write the layer**

**In `desk/src/model/factory.ts`, replace:**
```ts
 * (see `RecordingClient`), so that the run can be replayed later with no model and no network.
 * Recording is the innermost layer: a call that fails is not recorded, and a retry that succeeds is.
 */
export function clientFromConfig(config: DeskConfig, choice: ClientChoice, env: Environment, retry: RetryOptions = {}, record?: string): BuiltClient {
  const chosen = chosenClient(choice, env);
  const budgeted = new BudgetedClient(record === undefined ? chosen : new RecordingClient(chosen, record), config.budget);
  return { client: new RetryClient(budgeted, retry), spent: () => budgeted.spent() };
```

**with:**
```ts
 * (see `RecordingClient`), so that the run can be replayed later with no model and no network.
 * Recording is the innermost layer: a call that fails is not recorded, and a retry that succeeds is.
 *
 * With `wrap`, a function, the chosen client is put inside what it returns before anything else is built around it: the layer that sees exactly the calls that reach the
 * model, each retry included, which `desk tune` uses to count them against the budget of a whole invocation, whatever the budget of one run says.
 */
export function clientFromConfig(
  config: DeskConfig,
  choice: ClientChoice,
  env: Environment,
  retry: RetryOptions = {},
  record?: string,
  wrap?: (client: ModelClient) => ModelClient,
): BuiltClient {
  const chosen = wrap === undefined ? chosenClient(choice, env) : wrap(chosenClient(choice, env));
  const budgeted = new BudgetedClient(record === undefined ? chosen : new RecordingClient(chosen, record), config.budget);
  return { client: new RetryClient(budgeted, retry), spent: () => budgeted.spent() };
```

Run: `npm test --workspace @robywire/desk -- test/model/factory.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 5: Write the tests of the parts that need no page and no model**

**Create `desk/test/run/tune.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { TuneRecord, TuneRow, dollarsOf, parseUrlList, priceOf, rowLines, totalLines } from '../../src/run/tune';

// The pieces of `desk tune` that need no page and no model: the list of addresses, the price of a token, and the lines of the table. The whole command, with pages and a
// scripted model, is tested in test/tune.test.ts.

const urls = (text: string): string[] | string => {
  const result = parseUrlList(text);
  return 'problem' in result ? result.problem : result.urls;
};

describe('parseUrlList', () => {
  it('reads one address to a line, in order', () => {
    expect(urls('https://a.example/one\nhttps://b.example/two\n')).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('leaves out empty lines, lines of spaces and whole-line comments, and the spaces round an address', () => {
    expect(urls('# the pages to try\n\n   \n  https://a.example/one  \n\t# another comment\nhttps://b.example/two')).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('ends a line at a comment that follows a space, and keeps the # of the fragment of an address, which is not a comment', () => {
    expect(urls('https://a.example/one # the first\nhttps://b.example/two#section\nhttps://c.example/three\t# tab')).toEqual(['https://a.example/one', 'https://b.example/two#section', 'https://c.example/three']);
  });

  it('reads lines that end the way Windows ends them', () => {
    expect(urls('https://a.example/one\r\nhttps://b.example/two\r\n')).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('keeps an address twice when it is listed twice: the list is the owner\'s', () => {
    expect(urls('https://a.example/one\nhttps://a.example/one')).toEqual(['https://a.example/one', 'https://a.example/one']);
  });

  it('refuses a line that is not the address of a web page, and says which line and what it said', () => {
    expect(urls('https://a.example/one\nnot an address\n')).toBe('line 2 is not the address of a web page (an http or https address): "not an address"');
    expect(urls('ftp://a.example/file')).toContain('line 1 is not the address of a web page');
    expect(urls('a.example/one')).toContain('line 1 is not the address of a web page');
    expect(urls('# c\n\njavascript:alert(1)')).toContain('line 3 is not the address of a web page');
  });

  it('cuts a long line that it refuses at eighty characters', () => {
    const long = `${'x'.repeat(200)}`;
    const message = urls(long) as string;
    expect(message).toContain(`"${'x'.repeat(80)}..."`);
    expect(message).not.toContain('x'.repeat(81));
  });

  it('cuts a line of eighty-one characters, and shows a line of exactly eighty whole', () => {
    expect(urls('y'.repeat(80))).toBe(`line 1 is not the address of a web page (an http or https address): "${'y'.repeat(80)}"`);
    expect(urls('y'.repeat(81))).toBe(`line 1 is not the address of a web page (an http or https address): "${'y'.repeat(80)}..."`);
  });

  it('refuses a file that lists nothing: no line at all, or only comments', () => {
    expect(urls('')).toBe('it lists no address');
    expect(urls('# nothing here\n\n')).toBe('it lists no address');
  });
});

describe('priceOf and dollarsOf', () => {
  const models = defaultConfig().models;
  const prices = { inputPerMillion: 3, outputPerMillion: 15 };

  it('has no price when the settings have none, and never makes one up', () => {
    expect(priceOf({ models })).toBeUndefined();
  });

  it('gives the price of the settings when extract, compose and verify are one model', () => {
    expect(priceOf({ models, prices })).toEqual({ price: { input: 3, output: 15 } });
  });

  it('says why it cannot apply the one price when the three models are not one, and does not guess which to use', () => {
    expect(priceOf({ models: { ...models, verify: 'another-model' }, prices })).toEqual({ why: 'extract, compose and verify use different models, and the settings hold one price' });
    expect(priceOf({ models: { ...models, extract: 'another-model' }, prices })).toHaveProperty('why');
    expect(priceOf({ models: { ...models, compose: 'another-model' }, prices })).toHaveProperty('why');
  });

  it('does not look at the model that selects, which tune never asks', () => {
    expect(priceOf({ models: { ...models, select: 'a-cheaper-model' }, prices })).toEqual({ price: { input: 3, output: 15 } });
  });

  it('makes dollars of tokens: the tokens in at the price in, the tokens out at the price out, for a million of each', () => {
    expect(dollarsOf({ inputTokens: 1_000_000, outputTokens: 0 }, { input: 3, output: 15 })).toBe(3);
    expect(dollarsOf({ inputTokens: 0, outputTokens: 1_000_000 }, { input: 3, output: 15 })).toBe(15);
    expect(dollarsOf({ inputTokens: 10_000, outputTokens: 2_000 }, { input: 3, output: 15 })).toBeCloseTo(0.06, 10);
    expect(dollarsOf({ inputTokens: 0, outputTokens: 0 }, { input: 3, output: 15 })).toBe(0);
  });
});

const usage = { calls: 3, inputTokens: 10_000, outputTokens: 2_000 };
const judged: TuneRow = {
  url: 'https://a.example/one',
  trial: 2,
  kind: 'company-newsroom',
  status: 'judged',
  note: null,
  claims: { proposed: 9, survivors: 6, dropped: { 'quote-not-found': 2, 'value-not-in-quote': 1 } },
  composed: { route: 'revise', codes: { G4_NUMBER_UNSUPPORTED: 2, G9_BANNED_PHRASE: 1 } },
  modelCheck: { round: 1, judged: 14, entailed: 12, notEntailed: 1, ambiguous: 1, missing: 0, claims: 6, labelProblems: 2 },
  verdict: { outcome: 'hold', rounds: 2, route: 'revise', codes: { G4_NUMBER_UNSUPPORTED: 1 } },
  usage,
};
const POSITION = { page: 3, pages: 5, trials: 4 };

describe('rowLines', () => {
  it('says, for a trial that went all the way, each step in its order: the kind, the claims, the gate, the model check, the verdict and the tokens', () => {
    expect(rowLines(judged, POSITION, undefined)).toEqual([
      'page 3 of 5, trial 2 of 4: https://a.example/one',
      '  kind: company-newsroom (tier 1)',
      '  result: went through the model check',
      '  claims proposed: 9',
      '  claims dropped: quote-not-found 2, value-not-in-quote 1',
      '  claims surviving: 6',
      '  composed draft: the gate says revise (G4_NUMBER_UNSUPPORTED 2, G9_BANNED_PHRASE 1)',
      '  model check: round 1 judged 14 items: entailed 12, not entailed 1, ambiguous 1, missing 0; label problems 2 (6 claims)',
      '  verify: hold after 2 revision rounds; the gate says revise (G4_NUMBER_UNSUPPORTED 1)',
      '  tokens: 10000 in, 2000 out, 3 model calls',
    ]);
  });

  it('adds the dollars when there is a price, and not otherwise', () => {
    expect(rowLines(judged, POSITION, { input: 3, output: 15 }).at(-1)).toBe('  dollars: $0.0600');
    expect(rowLines(judged, POSITION, undefined).some((line) => line.includes('dollars'))).toBe(false);
  });

  it('says none for what was not dropped, leaves the codes out of a gate that says publish, and says singular for one', () => {
    const clean: TuneRow = {
      ...judged,
      claims: { proposed: 3, survivors: 3, dropped: {} },
      composed: { route: 'publish', codes: {} },
      modelCheck: { round: 0, judged: 1, entailed: 1, notEntailed: 0, ambiguous: 0, missing: 0, claims: 1, labelProblems: 0 },
      verdict: { outcome: 'publish', rounds: 1, route: 'publish', codes: {} },
      usage: { calls: 1, inputTokens: 5, outputTokens: 6 },
    };
    const lines = rowLines(clean, POSITION, undefined);
    expect(lines).toContain('  claims dropped: none');
    expect(lines).toContain('  composed draft: the gate says publish');
    expect(lines).toContain('  model check: round 0 judged 1 item: entailed 1, not entailed 0, ambiguous 0, missing 0; label problems 0 (1 claim)');
    expect(lines).toContain('  verify: publish after 1 revision round; the gate says publish');
    expect(lines.at(-1)).toBe('  tokens: 5 in, 6 out, 1 model call');
  });

  it('says that the model was not asked when the gate found failures in every round', () => {
    const lines = rowLines({ ...judged, modelCheck: null }, POSITION, undefined);
    expect(lines).toContain('  model check: not asked (the gate found failures in every round)');
  });

  it('says for a page that was never tried: no trial in the head, the reason, and nothing else', () => {
    const blocked: TuneRow = { ...judged, trial: null, kind: 'tier2', status: 'not-fetched', note: 'https://a.example/one: robots.txt does not allow it', claims: null, composed: null, modelCheck: null, verdict: null, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } };
    expect(rowLines(blocked, POSITION, { input: 3, output: 15 })).toEqual([
      'page 3 of 5: https://a.example/one',
      '  kind: tier2 (tier 2)',
      '  result: not fetched: https://a.example/one: robots.txt does not allow it',
    ]);
  });

  it('says the tier of every kind of source: the four of a primary source are tier 1, another outlet is tier 2, and an unknown address has none', () => {
    const kind = (name: TuneRow['kind']): string => rowLines({ ...judged, kind: name }, POSITION, undefined)[1]!;
    expect(kind('company-newsroom')).toBe('  kind: company-newsroom (tier 1)');
    expect(kind('arxiv')).toBe('  kind: arxiv (tier 1)');
    expect(kind('sec')).toBe('  kind: sec (tier 1)');
    expect(kind('standard')).toBe('  kind: standard (tier 1)');
    expect(kind('tier2')).toBe('  kind: tier2 (tier 2)');
    expect(kind('unknown')).toBe('  kind: unknown (no tier)');
  });

  it('says what each status means, with the reason after it', () => {
    const base: TuneRow = { ...judged, claims: null, composed: null, modelCheck: null, verdict: null, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } };
    const result = (status: TuneRow['status'], note: string | null): string => rowLines({ ...base, status, note }, POSITION, undefined)[2]!;
    expect(result('too-few-claims', '1 of 3 survived')).toBe('  result: too few claims to write a piece from: 1 of 3 survived');
    expect(result('unknown-kind', 'no host')).toBe('  result: not a known kind of source, so not read: no host');
    expect(result('failed', 'the reply is not JSON')).toBe('  result: failed: the reply is not JSON');
    expect(result('stopped', 'the budget')).toBe('  result: stopped by the budget of model calls: the budget');
  });
});

describe('the schemas of what tune.json holds', () => {
  const record: TuneRecord = {
    stamp: 's',
    date: '2026-10-05',
    client: 'fake',
    trials: 1,
    maxCalls: 1,
    models: defaultConfig().models,
    rows: [{ ...judged, url: 'x' }],
    total: { pages: 1, trials: 1, calls: 3, inputTokens: 10_000, outputTokens: 2_000 },
    dollars: null,
    stopped: null,
  };

  it('takes a row and a record as they are, and a name of one character', () => {
    expect(TuneRow.safeParse({ ...judged, url: 'x' }).success).toBe(true);
    expect(TuneRecord.safeParse(record).success).toBe(true);
  });

  it('refuses a row with no address, a record with no name, a record of another client than the two, a count that is not a whole number, and a field that it does not know', () => {
    expect(TuneRow.safeParse({ ...judged, url: '' }).success).toBe(false);
    expect(TuneRow.safeParse({ ...judged, usage: { ...usage, calls: 1.5 } }).success).toBe(false);
    expect(TuneRow.safeParse({ ...judged, extra: 1 }).success).toBe(false);
    expect(TuneRecord.safeParse({ ...record, stamp: '' }).success).toBe(false);
    expect(TuneRecord.safeParse({ ...record, client: 'recorded' }).success).toBe(false);
    expect(TuneRecord.safeParse({ ...record, maxCalls: 0 }).success).toBe(false);
  });
});

describe('totalLines', () => {
  const record: TuneRecord = {
    stamp: '20261005-043100',
    date: '2026-10-05',
    client: 'api',
    trials: 2,
    maxCalls: 40,
    models: defaultConfig().models,
    rows: [],
    total: { pages: 3, trials: 4, calls: 12, inputTokens: 100_000, outputTokens: 20_000 },
    dollars: null,
    stopped: null,
  };

  it('says the totals, and that there are no dollars because the settings have no prices', () => {
    expect(totalLines(record, undefined)).toEqual(['total: 3 pages, 4 trials, 12 of 40 model calls, 100000 tokens in, 20000 out', 'dollars: not shown, because the settings have no prices (see prices in desk/src/config.ts)']);
  });

  it('says the dollars when there is a price, and why not when there is one that cannot be applied', () => {
    expect(totalLines(record, { price: { input: 3, output: 15 } })[1]).toBe('total dollars: $0.6000');
    expect(totalLines(record, { why: 'the models differ' })[1]).toBe('dollars: not shown, because the models differ');
  });

  it('says, singular for one, why the invocation stopped when it did', () => {
    const lines = totalLines({ ...record, total: { ...record.total, pages: 1, trials: 1 }, stopped: 'the budget of 40 model calls is spent' }, undefined);
    expect(lines[0]).toBe('total: 1 page, 1 trial, 12 of 40 model calls, 100000 tokens in, 20000 out');
    expect(lines.at(-1)).toBe('stopped: the budget of 40 model calls is spent');
  });
});
```

Run: `npm test --workspace @robywire/desk -- test/run/tune.test.ts`
Expected: FAIL — `Cannot find module '../../src/run/tune'`

- [ ] **Step 6: Write the harness**

`parseUrlList` reads the file. `priceOf` and `dollarsOf` turn tokens into dollars when the settings say what a token costs. `rowLines` and `totalLines` write the table. `runTune` does the invocation: for each address `prepare` fetches the page and makes it ready, `runTrial` runs Extract, Compose and Verify with a client of its own (the budget of a run, inside the counter of calls of the whole invocation), and the record is written after each row.

**Create `desk/src/run/tune.ts`:**
```ts
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROUTES } from '@robywire/gate';
import type { Claim, Draft, SourcesRegistry } from '@robywire/gate';
import { z } from 'zod';
import { ComposeArtifact, DeskConfig, LocalEvidenceStore, candidateId, canonicalUrl, extractPage, hostKey, readArtifact, refuseApiOnFixtures, sourceKind, tier2Feeds, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, EvidenceStore, Fetcher, ModelClient, ModelRequest, ModelResponse, SelectArtifact, SourceKind, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
import { describeFailure, emptyPublished, isSourceFailure } from '../stages/context';
import type { StageContext } from '../stages/context';
import { kindOfSnapshot, runExtract } from '../stages/extract';
import type { Snapshot } from '../stages/fetch';
import { runVerify } from '../stages/verify';
import type { VerifyResult } from '../stages/verify';
import { verifyPlanOf } from '../stages/verify-model';

// `desk tune`: the first contact of the pipeline with a real model, and the tool for tuning what it is told. It takes a list of the addresses of real pages, fetches each one
// as the Desk fetches (robots.txt honoured, the pace of the settings), says what kind of source the registry says it is, and sends it through Extract, Compose and Verify with
// the client that was chosen, and reports what happened at every step: how many claims the model proposed and which rules dropped which, what the gate said of the draft, what the
// model check said of its sentences, and what it all cost in tokens (and in dollars when the settings hold the prices). Nothing is published, committed or written to the site: it
// writes only into `<runs folder>/tune/<stamp>/`, whose artifacts are checked against schemas like a run's. The pages are kept in the folder `evidence` below it and never in the
// evidence store of the settings, so that nothing that is tried here reaches the bucket. Two things bound what a tuning run can spend. Each trial is a run, so it is held to the
// budget of the settings (calls, tokens in, tokens out); and the whole invocation is held to `maxCalls` model calls, counted where a call reaches the model (each retry included),
// and stops with a message when they are spent.

/** The calls that an invocation may make unless `--max-calls` says otherwise, the most it may be told to make, and the most trials of one page. */
export const TUNE_DEFAULT_CALLS = 40;
export const TUNE_MAX_CALLS = 200;
export const TUNE_MAX_TRIALS = 10;

/** The folder below the folder of the runs where tuning runs write, which the daily workflow does not upload. */
export const TUNE_FOLDER = 'tune';

/** Why a tuning run was not started. */
export class TuneRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TuneRefused';
  }
}

/** The error of a call that would be the one after the last that the invocation may make. */
class CallLimitReached extends Error {
  constructor(readonly limit: number) {
    super(`the budget of ${limit} model calls for this invocation is spent`);
    this.name = 'CallLimitReached';
  }
}

/** What an invocation has made, and may make, of model calls. One for all the clients of all the trials. */
interface CallCount {
  used: number;
  readonly max: number;
}

/** Counts every call that reaches the model and refuses the one after the last that is allowed. */
class CallLimitClient implements ModelClient {
  constructor(
    private readonly inner: ModelClient,
    private readonly count: CallCount,
  ) {}

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    if (this.count.used >= this.count.max) throw new CallLimitReached(this.count.max);
    this.count.used += 1;
    return this.inner.json(request);
  }
}

// --- The list of addresses ---------------------------------------------------

/**
 * The addresses in the text of a file: one to a line, in order. A comment starts with `#` at the start of a line or after a space (a `#` inside an address, the start of its
 * fragment, is not a comment), and an empty line is nothing. A line that is not the address of a web page, and a file that lists none, are `problem`s that say which line.
 */
export function parseUrlList(text: string): { urls: string[] } | { problem: string } {
  const urls: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let at = 0; at < lines.length; at++) {
    const line = (lines[at] as string).replace(/(^|\s)#.*$/, '').trim();
    if (line === '') continue;
    if (canonicalUrl(line) === null) return { problem: `line ${at + 1} is not the address of a web page (an http or https address): ${JSON.stringify(line.length > 80 ? `${line.slice(0, 80)}...` : line)}` };
    urls.push(line);
  }
  return urls.length === 0 ? { problem: 'it lists no address' } : { urls };
}

// --- What a trial leaves --------------------------------------------------------

const count = z.number().int().nonnegative();
/** How many times each code came up: `{ 'quote-not-found': 2 }`. */
const codes = z.record(z.string(), count);

const KINDS = ['company-newsroom', 'arxiv', 'sec', 'standard', 'tier2', 'unknown'] as const satisfies readonly SourceKind[];

/** How a row ended: it went through the model check, it had too few claims to write from, the page could not be fetched or read, it is not a known kind of source, a step failed, or the budget ran out. */
export const TUNE_STATUSES = ['judged', 'too-few-claims', 'not-fetched', 'unknown-kind', 'failed', 'stopped'] as const;

/** One page, or one trial of a page: what each step found. A step that did not run is `null`. */
export const TuneRow = z.strictObject({
  url: z.string().min(1),
  /** Which trial of the page, from 1; `null` for a page that was never tried (not fetched, not a known kind). */
  trial: z.number().int().positive().nullable(),
  kind: z.enum(KINDS),
  status: z.enum(TUNE_STATUSES),
  /** Why, for every status but `judged`. */
  note: z.string().nullable(),
  /** Extract: what the model proposed, what survived, and which rule dropped how many (a claim with two reasons is counted under both). */
  claims: z.strictObject({ proposed: count, survivors: count, dropped: codes }).nullable(),
  /** Compose: what the gate said of the draft that the composer wrote first. */
  composed: z.strictObject({ route: z.enum(ROUTES), codes }).nullable(),
  /** Verify: what the model check said of the first draft that the gate cleared (a draft that the gate fails is not shown to the model). */
  modelCheck: z.strictObject({ round: count, judged: count, entailed: count, notEntailed: count, ambiguous: count, missing: count, claims: count, labelProblems: count }).nullable(),
  /** Verify: how it ended. */
  verdict: z.strictObject({ outcome: z.enum(['publish', 'hold']), rounds: count, route: z.enum(ROUTES), codes }).nullable(),
  usage: z.strictObject({ calls: count, inputTokens: count, outputTokens: count }),
});
export type TuneRow = z.infer<typeof TuneRow>;

/** What `tune.json` holds, the record of a whole invocation. */
export const TuneRecord = z.strictObject({
  stamp: z.string().min(1),
  date: z.iso.date(),
  client: z.enum(['api', 'fake']),
  trials: z.number().int().positive(),
  maxCalls: z.number().int().positive(),
  models: DeskConfig.shape.models,
  rows: z.array(TuneRow),
  total: z.strictObject({ pages: count, trials: count, calls: count, inputTokens: count, outputTokens: count }),
  /** What the tokens cost at the prices of the settings; `null` when there are none, or when they cannot be applied. */
  dollars: z.number().nonnegative().nullable(),
  /** Why the invocation stopped before it was done, or `null`. */
  stopped: z.string().nullable(),
});
export type TuneRecord = z.infer<typeof TuneRecord>;

/** A count of each code in a list, in the order that each first comes up. */
function countBy(items: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

// --- Prices ---------------------------------------------------------------------

/** Dollars for a million tokens in and for a million tokens out. */
export interface Price {
  input: number;
  output: number;
}

/**
 * The price that the settings give, when it can be applied: `undefined` when they give none, `{ why }` when they do and it cannot be, because the models of Extract, Compose and
 * Verify are not one model and a price is for one, otherwise `{ price }`. The Desk never makes up a price.
 */
export function priceOf(config: Pick<DeskConfig, 'prices' | 'models'>): { price: Price } | { why: string } | undefined {
  if (config.prices === undefined) return undefined;
  const { extract, compose, verify } = config.models;
  if (new Set([extract, compose, verify]).size !== 1) return { why: 'extract, compose and verify use different models, and the settings hold one price' };
  return { price: { input: config.prices.inputPerMillion, output: config.prices.outputPerMillion } };
}

/** What `usage` cost at `price`, in dollars. */
export const dollarsOf = (usage: { inputTokens: number; outputTokens: number }, price: Price): number => (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;

const formatDollars = (value: number): string => `$${value.toFixed(4)}`;

// --- The table ---------------------------------------------------------------------

const TIERS: Record<SourceKind, string> = { 'company-newsroom': 'tier 1', arxiv: 'tier 1', sec: 'tier 1', standard: 'tier 1', tier2: 'tier 2', unknown: 'no tier' };

/** `quote-not-found 2, value-not-in-quote 1`, or `none`. */
const listOf = (found: Record<string, number>): string => (Object.keys(found).length === 0 ? 'none' : Object.entries(found).map(([code, times]) => `${code} ${times}`).join(', '));

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The lines of the table for one row: what each step found, then the tokens, and the dollars when there is a price. */
export function rowLines(row: TuneRow, position: { page: number; pages: number; trials: number }, price: Price | undefined): string[] {
  const head = row.trial === null ? `page ${position.page} of ${position.pages}: ${row.url}` : `page ${position.page} of ${position.pages}, trial ${row.trial} of ${position.trials}: ${row.url}`;
  const lines = [head, `  kind: ${row.kind} (${TIERS[row.kind]})`];
  const results: Record<TuneRow['status'], string> = {
    judged: 'went through the model check',
    'too-few-claims': 'too few claims to write a piece from',
    'not-fetched': 'not fetched',
    'unknown-kind': 'not a known kind of source, so not read',
    failed: 'failed',
    stopped: 'stopped by the budget of model calls',
  };
  lines.push(`  result: ${results[row.status]}${row.note === null ? '' : `: ${row.note}`}`);
  if (row.claims !== null) {
    lines.push(`  claims proposed: ${row.claims.proposed}`, `  claims dropped: ${listOf(row.claims.dropped)}`, `  claims surviving: ${row.claims.survivors}`);
  }
  if (row.composed !== null) lines.push(`  composed draft: the gate says ${row.composed.route}${row.composed.route === 'publish' ? '' : ` (${listOf(row.composed.codes)})`}`);
  if (row.modelCheck !== null) {
    const check = row.modelCheck;
    lines.push(
      `  model check: round ${check.round} judged ${plural(check.judged, 'item')}: entailed ${check.entailed}, not entailed ${check.notEntailed}, ambiguous ${check.ambiguous}, missing ${check.missing}; label problems ${check.labelProblems} (${plural(check.claims, 'claim')})`,
    );
  } else if (row.verdict !== null) {
    lines.push('  model check: not asked (the gate found failures in every round)');
  }
  if (row.verdict !== null) {
    lines.push(`  verify: ${row.verdict.outcome} after ${plural(row.verdict.rounds, 'revision round')}; the gate says ${row.verdict.route}${row.verdict.route === 'publish' ? '' : ` (${listOf(row.verdict.codes)})`}`);
  }
  if (row.usage.calls > 0) {
    lines.push(`  tokens: ${row.usage.inputTokens} in, ${row.usage.outputTokens} out, ${plural(row.usage.calls, 'model call')}`);
    if (price !== undefined) lines.push(`  dollars: ${formatDollars(dollarsOf(row.usage, price))}`);
  }
  return lines;
}

/** The lines that end the table: the totals, the dollars or why there are none, and why the invocation stopped when it did. */
export function totalLines(record: TuneRecord, priced: ReturnType<typeof priceOf>): string[] {
  const { total } = record;
  const lines = [`total: ${plural(total.pages, 'page')}, ${plural(total.trials, 'trial')}, ${total.calls} of ${record.maxCalls} model calls, ${total.inputTokens} tokens in, ${total.outputTokens} out`];
  if (priced === undefined) lines.push('dollars: not shown, because the settings have no prices (see prices in desk/src/config.ts)');
  else if ('why' in priced) lines.push(`dollars: not shown, because ${priced.why}`);
  else lines.push(`total dollars: ${formatDollars(dollarsOf(total, priced.price))}`);
  if (record.stopped !== null) lines.push(`stopped: ${record.stopped}`);
  return lines;
}

// --- The run -------------------------------------------------------------------------

export interface TuneOptions {
  /** The addresses to try, in order (see `parseUrlList`). */
  urls: readonly string[];
  /** How many times the model stages are run on each page; the page is fetched once. */
  trials: number;
  /** The most model calls the whole invocation may make. */
  maxCalls: number;
  clientKind: ClientKind;
  /** Where the pages come from. The command line says `live`; `refuseApiOnFixtures` refuses the api on the made-up world as it does for a run. */
  sourcesKind: SourcesKind;
  config: DeskConfig;
  sources: SourcesRegistry;
  fetcher: Fetcher;
  /** A new client for one trial, with `wrap` put around the model itself: what `clientFromConfig` makes. */
  buildClient: (wrap: (client: ModelClient) => ModelClient) => BuiltClient;
  /** The day, for the stages (the date of the piece that would be written), YYYY-MM-DD. */
  date: string;
  /** The name of the folder of this invocation below `<runs folder>/tune/`. */
  stamp: string;
  /** A line of the table, as soon as a trial has ended. */
  out: (line: string) => void;
}

export interface TuneResult {
  record: TuneRecord;
  /** The folder of the invocation. */
  dir: string;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/** The name of the outlet of a page, for a claim that is attributed to it: the name that the registry gives the feed of the host of the page, else the host. Only a page of another outlet has claims that name one. */
function outletOf(url: string, registry: SourcesRegistry): string {
  const host = hostKey(url);
  return tier2Feeds(registry).find((entry) => hostKey(entry.feed) === host)?.name ?? host ?? url;
}

/** A row with nothing in it yet: judged, no note, no step run, nothing spent. */
const blank = (url: string, kind: SourceKind, trial: number | null): TuneRow => ({
  url,
  trial,
  kind,
  status: 'judged',
  note: null,
  claims: null,
  composed: null,
  modelCheck: null,
  verdict: null,
  usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
});

/** A row for a page that no trial was made of. */
const untried = (url: string, kind: SourceKind, status: 'not-fetched' | 'unknown-kind', note: string): TuneRow => ({ ...blank(url, kind, null), status, note });

/** What the model check said of the first draft that it was shown, from the artifacts that Verify wrote. */
async function modelCheckOf(dir: string, claims: Claim[], verified: VerifyResult): Promise<TuneRow['modelCheck']> {
  const asked = verified.history.find((pass) => pass.verifier !== null);
  if (asked === undefined) return null;
  const drafts = (await readArtifact(dir, '05-compose', ComposeArtifact)).drafts;
  const plan = verifyPlanOf(drafts[asked.round] as Draft, claims);
  const items = asked.verifierFailures.filter((failure) => failure.kind !== 'label');
  const judged = plan.sentences.length + plan.headings.length;
  const some = (code: string): number => items.filter((failure) => failure.code === code).length;
  return {
    round: asked.round,
    judged,
    entailed: judged - items.length,
    notEntailed: some('not_entailed'),
    ambiguous: some('ambiguous'),
    missing: some('missing'),
    claims: plan.claims.length,
    labelProblems: asked.verifierFailures.length - items.length,
  };
}

/** One page that is ready to be tried: its snapshot, what kind of source it is, and the story that Select would have chosen for it. */
interface Page {
  snapshot: Snapshot;
  kind: SourceKind;
  selected: SelectArtifact;
}

/** One trial of a page: Extract, Compose and Verify, each only if the one before gave it something to work with, with a client of its own and the budget of a run. */
async function runTrial(options: TuneOptions, calls: CallCount, evidence: EvidenceStore, page: Page, trial: number, dir: string): Promise<TuneRow> {
  const built = options.buildClient((client) => new CallLimitClient(client, calls));
  const callsBefore = calls.used;
  const ctx: StageContext = {
    date: options.date,
    config: options.config,
    sources: options.sources,
    fetcher: options.fetcher,
    client: built.client,
    evidence,
    runDir: dir,
    published: emptyPublished(),
    log: () => undefined,
  };
  const row = blank(page.snapshot.url, page.kind, trial);
  try {
    const extracted = await runExtract(ctx, [page.snapshot], page.selected);
    const dropped = countBy(extracted.artifact.dropped.flatMap((claim) => claim.reasons.map((reason) => reason.code)));
    const survivors = extracted.artifact.claims.length;
    row.claims = { proposed: survivors + extracted.artifact.dropped.length, survivors, dropped };
    if (!extracted.ok) {
      row.status = 'too-few-claims';
      row.note = extracted.reason;
    } else {
      const claims = extracted.artifact.claims;
      const composed = await runCompose(ctx, claims);
      row.composed = { route: composed.gate.route, codes: countBy(composed.gate.failures.map((failure) => failure.code)) };
      const verified = await runVerify(ctx, claims, composed);
      row.verdict = { outcome: verified.outcome, rounds: verified.rounds, route: verified.gate.route, codes: countBy(verified.gate.failures.map((failure) => failure.code)) };
      row.modelCheck = await modelCheckOf(dir, claims, verified);
    }
  } catch (error) {
    row.status = error instanceof CallLimitReached ? 'stopped' : 'failed';
    row.note = describeError(error);
  }
  // The calls are those that reached the model, as the invocation counts them: a call that the budget of the invocation refused is not one. The tokens are what the model reported.
  const spent = built.spent();
  row.usage = { calls: calls.used - callsBefore, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens };
  return row;
}

/**
 * Fetch one page and make it ready to try, or say why it cannot be: an address that is on no host of the registry is not fetched at all, a page that cannot be fetched or read, or has no
 * text, is `not-fetched`, and a page that redirected to another kind of site than it was asked for is not a known kind of source. The text is kept in `evidence`.
 */
async function prepare(options: TuneOptions, evidence: EvidenceStore, url: string): Promise<{ page: Page } | { row: TuneRow }> {
  const asked = sourceKind(url, options.sources);
  if (asked === 'unknown') return { row: untried(url, 'unknown', 'unknown-kind', 'the address is on no host that sources.yml lists, so it was not fetched') };
  const tier: 1 | 2 = asked === 'tier2' ? 2 : 1;
  try {
    const fetched = await options.fetcher.get(url);
    const { title, text } = extractPage(fetched.body, fetched.finalUrl);
    if (text === '') return { row: untried(url, asked, 'not-fetched', 'the page has no text to read') };
    const kind = kindOfSnapshot({ tier, url, finalUrl: fetched.finalUrl }, options.sources);
    if (kind === 'unknown') return { row: untried(url, 'unknown', 'unknown-kind', `the page was served from ${fetched.finalUrl}, which is not the kind of source that ${url} is, so it was not read`) };
    const { hash } = await evidence.put(text, { url, finalUrl: fetched.finalUrl, tier, retrievedAt: fetched.retrievedAt });
    const snapshot: Snapshot = { url, finalUrl: fetched.finalUrl, tier, hash, retrievedAt: fetched.retrievedAt, bytes: Buffer.byteLength(text, 'utf8'), title, text };
    const chosen = { id: candidateId(url), title: title === '' ? url : title, url, outlet: outletOf(url, options.sources), tier, beats: [], origin: tier === 1 ? ('newsroom' as const) : ('feed' as const) };
    return { page: { snapshot, kind, selected: { date: options.date, chosen, reasons: [], tier1Url: tier === 1 ? url : null, shortlist: [chosen.id] } } };
  } catch (error) {
    return { row: untried(url, asked, 'not-fetched', isSourceFailure(error) ? describeFailure(error) : describeError(error)) };
  }
}

/**
 * Try every address, in order, and write what happened to `<runs folder>/tune/<stamp>/`: `tune.json` (the record, rewritten after each trial, so that what was done is kept
 * if the program stops), the artifacts of each trial in `<nn>/trial-<k>/`, and the pages in `evidence/`. The table is given to `out` a row at a time. When the budget of calls is spent
 * the invocation stops where it is, and the record says where; the rows so far are kept. Throws `TuneRefused` for the api client on the made-up world, before anything is written.
 */
export async function runTune(options: TuneOptions): Promise<TuneResult> {
  const spending = refuseApiOnFixtures(options.clientKind, options.sourcesKind);
  if (spending !== undefined) throw new TuneRefused(spending);
  if (options.clientKind !== 'api' && options.clientKind !== 'fake') throw new TuneRefused(`tune takes the api client or the scripted one, not ${options.clientKind}`);
  const dir = path.join(options.config.runDir, TUNE_FOLDER, options.stamp);
  await mkdir(path.dirname(dir), { recursive: true });
  await mkdir(dir);
  const evidence = new LocalEvidenceStore(path.join(dir, 'evidence'));
  const calls: CallCount = { used: 0, max: options.maxCalls };
  const priced = priceOf(options.config);
  const price = priced !== undefined && 'price' in priced ? priced.price : undefined;
  const rows: TuneRow[] = [];
  let stopped: string | null = null;

  const record = (): TuneRecord => {
    const tried = rows.filter((row) => row.trial !== null);
    const total = {
      pages: options.urls.length,
      trials: tried.length,
      calls: rows.reduce((sum, row) => sum + row.usage.calls, 0),
      inputTokens: rows.reduce((sum, row) => sum + row.usage.inputTokens, 0),
      outputTokens: rows.reduce((sum, row) => sum + row.usage.outputTokens, 0),
    };
    return {
      stamp: options.stamp,
      date: options.date,
      client: options.clientKind as 'api' | 'fake',
      trials: options.trials,
      maxCalls: options.maxCalls,
      models: { ...options.config.models },
      rows,
      total,
      dollars: price === undefined ? null : dollarsOf(total, price),
      stopped,
    };
  };
  const keep = async (row: TuneRow, page: number): Promise<void> => {
    rows.push(row);
    for (const line of rowLines(row, { page, pages: options.urls.length, trials: options.trials }, price)) options.out(line);
    await writeJsonFile(path.join(dir, 'tune.json'), 'the record tune.json', record(), TuneRecord);
  };

  const spent = (where: string, how: string): string => `the budget of ${options.maxCalls} model calls (--max-calls) ${how}, so the run stopped ${where}, and what comes after it was not tried`;
  pages: for (const [at, url] of options.urls.entries()) {
    if (calls.used >= options.maxCalls) {
      stopped = spent(`before page ${at + 1} (${url})`, 'is spent');
      break;
    }
    const prepared = await prepare(options, evidence, url);
    if ('row' in prepared) {
      await keep(prepared.row, at + 1);
      continue;
    }
    for (let trial = 1; trial <= options.trials; trial++) {
      const where = `trial ${trial} of page ${at + 1} (${url})`;
      if (calls.used >= options.maxCalls) {
        stopped = spent(`before ${where}`, 'is spent');
        break pages;
      }
      const row = await runTrial(options, calls, evidence, prepared.page, trial, path.join(dir, String(at + 1).padStart(2, '0'), `trial-${trial}`));
      await keep(row, at + 1);
      if (row.status === 'stopped') {
        stopped = spent(`during ${where}`, 'ran out');
        break pages;
      }
    }
  }

  const final = record();
  await writeJsonFile(path.join(dir, 'tune.json'), 'the record tune.json', final, TuneRecord);
  for (const line of totalLines(final, priced)) options.out(line);
  return { record: final, dir };
}
```

Run: `npm test --workspace @robywire/desk -- test/run/tune.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 7: Write the tests of the command**

They call `main` with a list of addresses, a transport that answers from the fixture pages in place of the web (the same transport that the tests of the fetcher use), the registry of the made-up world, and a scripted model. The command is not in `main` yet, and `desk/test/fetch/exports.test.ts` learns that the harness is not exported from the package.

**Create `desk/test/tune.test.ts`:**
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
import { DEMO_CLAIMS, DEMO_REPLY, clearingVerifier } from '../src/demo/story';
import { DEMO_REGISTRY_YAML, DEMO_URLS, demoFetcher, demoRegistry } from '../src/demo/world';
import { clientFromConfig } from '../src/model/factory';
import { FakeClient } from '../src/model/fake';
import { refuseApiOnFixtures } from '../src/run/spending';
import { FakeGit } from '../src/run/git';
import { TUNE_DEFAULT_CALLS, TUNE_FOLDER, TUNE_MAX_CALLS, TUNE_MAX_TRIALS, TuneRecord, TuneRefused, runTune } from '../src/run/tune';
import type { TuneOptions } from '../src/run/tune';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';
import { START, clock } from './support/run';
import { fileReply, scriptedTransport } from './support/transport';
import type { Route } from './support/transport';
import { loadWorkflow, stepNamed } from './support/workflow';

// `desk tune`, called as a function the way every command of the Desk is tested: `main(argv, deps)` with a clock, an environment, a place to print, and a transport that answers
// from the fixture pages in place of the web. The model is a scripted one, and the real one is never reached. What these tests hold the command to: the table that it prints, the
// budget of calls that stops it, a page that robots.txt forbids and a page of no known kind, the api client that is refused without a key before anything is fetched, and that
// nothing is written outside runs/tune/.

const scratch = useScratch();
const TEST_AGENT = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)';
const RELEASE = DEMO_URLS.release;
const ARTICLE = DEMO_URLS.mercerArticle;
const ALLOW = { type: 'text/plain', body: 'User-agent: *\nAllow: /\n' };

/** The routes of the made-up world: both hosts allow every fetch, and the two pages are the fixture files. */
function world(extra: Record<string, Route> = {}): Record<string, Route> {
  return {
    'https://fixture-robotics.example/robots.txt': ALLOW,
    'https://mercer-wire.example/robots.txt': ALLOW,
    [RELEASE]: fileReply('pages/fixture-robotics-fx-1-second-plant.html'),
    [ARTICLE]: fileReply('pages/mercer-wire-fx-1-second-plant.html'),
    ...extra,
  };
}

/** What a model says when it tells the story of the release: seven claims, a piece, and a verifier that clears it. One set of replies for each trial that is asked. */
const story = (trials = 1): FakeClient =>
  new FakeClient()
    .script('extract', ...Array.from({ length: trials }, () => ({ claims: DEMO_CLAIMS })))
    .script('compose', ...Array.from({ length: trials }, () => DEMO_REPLY))
    .script('verify', ...Array.from({ length: trials }, () => clearingVerifier));

/** A repository with the registry of the made-up world and a list of addresses, and everything that `main` is given and prints. */
function tuning(addresses: string[], options: { routes?: Record<string, Route>; deps?: Partial<CliDeps>; list?: string } = {}) {
  const cwd = makeSite(scratch());
  writeFileSync(path.join(cwd, 'sources.yml'), DEMO_REGISTRY_YAML);
  writeFileSync(path.join(cwd, 'urls.txt'), options.list ?? `${addresses.join('\n')}\n`);
  const out: string[] = [];
  const err: string[] = [];
  const git = new FakeGit();
  const { transport, sent } = scriptedTransport(options.routes ?? world());
  const config = { ...defaultConfig(), runDir: path.join(cwd, 'runs'), evidenceDir: path.join(cwd, 'evidence'), userAgent: TEST_AGENT, requestIntervalMs: 0 };
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd, now: clock(), git, transport, lookup: publicLookup, config, ...options.deps };
  const call = (...argv: string[]): Promise<number> => main(['tune', '--urls', 'urls.txt', ...argv], deps);
  const dir = path.join(cwd, 'runs', TUNE_FOLDER, '20261005-043100');
  const record = (): TuneRecord => TuneRecord.parse(JSON.parse(readFileSync(path.join(dir, 'tune.json'), 'utf8')));
  return { cwd, out, err, git, sent, call, dir, record, deps };
}

const parsed = (...argv: string[]): Parsed => {
  const result = parseArgs(argv);
  if (!result.ok) throw new Error(`not parsed: ${result.message}`);
  return result.args;
};
const refused = (...argv: string[]): string => {
  const result = parseArgs(argv);
  if (result.ok) throw new Error(`parsed: ${JSON.stringify(result.args)}`);
  return result.message;
};

describe('parseArgs: tune', () => {
  it('has the defaults: one trial, forty calls, the api, and no settings file', () => {
    expect(parsed('tune', '--urls', 'urls.txt')).toEqual({ command: 'tune', urls: 'urls.txt', trials: 1, maxCalls: TUNE_DEFAULT_CALLS, client: 'api', config: undefined });
    expect(TUNE_DEFAULT_CALLS).toBe(40);
  });

  it('reads every option, in any order', () => {
    expect(parsed('tune', '--max-calls', '12', '--config', 'desk.config.yml', '--client', 'fake', '--trials', '3', '--urls', 'a/b.txt')).toEqual({
      command: 'tune',
      urls: 'a/b.txt',
      trials: 3,
      maxCalls: 12,
      client: 'fake',
      config: 'desk.config.yml',
    });
  });

  it('needs --urls', () => {
    expect(refused('tune')).toBe('tune needs --urls <file>: the file that lists the addresses of the pages to try, one to a line');
    expect(refused('tune', '--trials', '2')).toContain('tune needs --urls');
    expect(refused('tune', '--urls')).toBe('--urls needs a value');
  });

  it('takes a whole number of trials from 1 to ten, and of calls from 1 to two hundred, and says the limits', () => {
    for (const bad of ['0', '-1', '1.5', 'many', '', '011', '11']) expect(refused('tune', '--urls', 'u', '--trials', bad), bad).toBe(`--trials is a whole number from 1 to ${TUNE_MAX_TRIALS}, not "${bad}"`);
    for (const bad of ['0', '-5', '2.5', 'lots', '201', '1000000000']) expect(refused('tune', '--urls', 'u', '--max-calls', bad), bad).toBe(`--max-calls is a whole number from 1 to ${TUNE_MAX_CALLS}, not "${bad}"`);
    expect(parsed('tune', '--urls', 'u', '--trials', '10', '--max-calls', '200')).toMatchObject({ trials: 10, maxCalls: 200 });
    expect(parsed('tune', '--urls', 'u', '--trials', '1', '--max-calls', '1')).toMatchObject({ trials: 1, maxCalls: 1 });
  });

  it('takes the api or the scripted client and no other: the recorded replies are not for tuning', () => {
    expect(refused('tune', '--urls', 'u', '--client', 'recorded')).toBe('--client is api or fake for tune, not "recorded"');
    expect(refused('tune', '--urls', 'u', '--client', 'gpt')).toBe('--client is api or fake for tune, not "gpt"');
  });

  it('has the options of tune and no others: not a flag of run, not an argument, and none twice', () => {
    expect(refused('tune', '--urls', 'u', '--sources', 'fixtures')).toBe('unknown option --sources for tune');
    expect(refused('tune', '--urls', 'u', '--dry')).toBe('unknown option --dry for tune');
    expect(refused('tune', 'urls.txt')).toBe('tune takes no arguments, but was given "urls.txt"');
    expect(refused('tune', '--urls', 'a', '--urls', 'b')).toBe('--urls is given twice');
  });

  it('is in the usage, with the settings file like every command that reads the settings, and the two words that say what --client fake is and what writes where', () => {
    expect(USAGE).toContain('desk tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]');
    expect(USAGE).toContain('--client fake (a model');
    expect(USAGE).toContain('proposes no claims');
    expect(USAGE).toContain('it writes only below runs/tune/<stamp>/');
    expect(USAGE).toContain('--trials N runs the model steps N times on each page (1 to 10, 1 unless told otherwise)');
    expect(USAGE).toContain('--max-calls M stops the whole invocation, with exit code 1, when it has made M model calls (1 to 200, 40 unless told otherwise)');
  });
});

describe('main: tune, the table', () => {
  it('fetches the page, sends it through Extract, Compose and Verify, and prints each step of it, then the total, and exits 0', async () => {
    const { call, out, err } = tuning([RELEASE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(err).toEqual([]);
    expect(out).toEqual([
      'tune: 1 address, 1 trial each, at most 40 model calls, client fake',
      'folder: runs/tune/20261005-043100',
      `page 1 of 1, trial 1 of 1: ${RELEASE}`,
      '  kind: company-newsroom (tier 1)',
      '  result: went through the model check',
      '  claims proposed: 7',
      '  claims dropped: none',
      '  claims surviving: 7',
      '  composed draft: the gate says publish',
      '  model check: round 0 judged 35 items: entailed 35, not entailed 0, ambiguous 0, missing 0; label problems 0 (7 claims)',
      '  verify: publish after 0 revision rounds; the gate says publish',
      '  tokens: 6270 in, 2891 out, 3 model calls',
      'total: 1 page, 1 trial, 3 of 40 model calls, 6270 tokens in, 2891 out',
      'dollars: not shown, because the settings have no prices (see prices in desk/src/config.ts)',
    ]);
  });

  it('shows dollars, for each trial and in all, when the settings have prices, and never otherwise', async () => {
    const config = { ...defaultConfig(), runDir: 'runs', userAgent: TEST_AGENT, requestIntervalMs: 0, prices: { inputPerMillion: 3, outputPerMillion: 15 } };
    const priced = tuning([RELEASE], { deps: { tuneClient: story(), config } });
    // The folders of the settings are relative here, and are below the folder that the command is run in.
    priced.deps.config = { ...config, runDir: path.join(priced.cwd, 'runs'), evidenceDir: path.join(priced.cwd, 'evidence') };
    expect(await priced.call('--client', 'fake')).toBe(0);
    expect(priced.out).toContain('  dollars: $0.0622');
    expect(priced.out).toContain('total dollars: $0.0622');
    expect(priced.record().dollars).toBeCloseTo(0.062175, 8);
  });

  it('does not make dollars of tokens when the three models differ, and says why', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story() } });
    made.deps.config = { ...made.deps.config!, models: { ...defaultConfig().models, verify: 'a-different-model' }, prices: { inputPerMillion: 3, outputPerMillion: 15 } };
    expect(await made.call('--client', 'fake')).toBe(0);
    expect(made.out.some((line) => line.includes('dollars:') && !line.startsWith('dollars: not shown'))).toBe(false);
    expect(made.out).toContain('dollars: not shown, because extract, compose and verify use different models, and the settings hold one price');
    expect(made.record().dollars).toBeNull();
  });

  it('takes the prices from a file of settings', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story(), config: undefined } });
    writeFileSync(path.join(made.cwd, 'desk.yml'), `userAgent: "${TEST_AGENT}"\nrequestIntervalMs: 0\nprices:\n  inputPerMillion: 3\n  outputPerMillion: 15\n`);
    expect(await made.call('--client', 'fake', '--config', 'desk.yml')).toBe(0);
    expect(made.out).toContain('total dollars: $0.0622');
  });

  it('runs the model steps as many times as it is told on a page that is fetched once, a row to each trial', async () => {
    const { call, out, sent } = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    expect(await call('--client', 'fake', '--trials', '2')).toBe(0);
    expect(out[0]).toBe('tune: 1 address, 2 trials each, at most 40 model calls, client fake');
    expect(out.filter((line) => line.startsWith('page '))).toEqual([`page 1 of 1, trial 1 of 2: ${RELEASE}`, `page 1 of 1, trial 2 of 2: ${RELEASE}`]);
    expect(out).toContain('total: 1 page, 2 trials, 6 of 40 model calls, 12540 tokens in, 5782 out');
    expect(sent.filter((request) => request.url === RELEASE)).toHaveLength(1);
  });

  it('tries the pages in the order of the list, with a block of lines to each, and a tier-2 page is read as the page of another outlet', async () => {
    const reading = new FakeClient().script('extract', { claims: [] }, { claims: [] });
    const { call, out } = tuning([ARTICLE, RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.filter((line) => line.startsWith('page '))).toEqual([`page 1 of 2, trial 1 of 1: ${ARTICLE}`, `page 2 of 2, trial 1 of 1: ${RELEASE}`]);
    expect(out).toContain('  kind: tier2 (tier 2)');
    expect(out).toContain('  kind: company-newsroom (tier 1)');
    expect(out).toContain('total: 2 pages, 2 trials, 2 of 40 model calls, 2869 tokens in, 8 out');
  });

  it('counts a claim that the code dropped under each rule that dropped it, and says that too few survived, with no draft after it and no more calls', async () => {
    const lost = { ...DEMO_CLAIMS[0]!, quote: 'This sentence is not in the page at all.' };
    const longLabel = { ...DEMO_CLAIMS[1]!, label: 'a label that is far too long to be a short noun phrase for a claim, and that is not in its quotation either' };
    const reading = new FakeClient().script('extract', { claims: [DEMO_CLAIMS[0]!, DEMO_CLAIMS[1]!, lost, longLabel] });
    const { call, out, record } = tuning([RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.slice(2, 9)).toEqual([
      `page 1 of 1, trial 1 of 1: ${RELEASE}`,
      '  kind: company-newsroom (tier 1)',
      '  result: too few claims to write a piece from: 2 of the 4 claims proposed survived the checks, and at least 3 are needed to write a piece',
      '  claims proposed: 4',
      '  claims dropped: quote-not-found 1, label-not-in-quote 1, label-too-long 1',
      '  claims surviving: 2',
      '  tokens: 1472 in, 499 out, 1 model call',
    ]);
    expect(out.some((line) => line.includes('composed draft'))).toBe(false);
    expect(record().rows[0]).toMatchObject({ status: 'too-few-claims', composed: null, modelCheck: null, verdict: null, usage: { calls: 1 } });
  });
});

describe('main: tune, what the model check found', () => {
  /** A verifier that finds fault: the first sentence is not entailed, the second is ambiguous, the third is not judged at all, and the basis of the first claim is not supported. */
  const faultFinding = (request: Parameters<typeof clearingVerifier>[0]) => {
    const clear = clearingVerifier(request);
    return {
      verdicts: clear.verdicts.flatMap((verdict, at) => (at === 0 ? [{ ...verdict, verdict: 'not_entailed' as const }] : at === 1 ? [{ ...verdict, verdict: 'ambiguous' as const }] : at === 2 ? [] : [verdict])),
      labels: clear.labels.map((label, at) => (at === 0 ? { ...label, basisSupported: false } : label)),
    };
  };

  it('counts, for the first draft that the model was shown, the sentences that were not entailed, ambiguous and not judged, and the labels that were not supported, and says that the piece is held after the rounds of revision', async () => {
    const reading = new FakeClient()
      .script('extract', { claims: DEMO_CLAIMS })
      .script('compose', DEMO_REPLY, { replacements: [] }, { replacements: [] })
      .script('verify', faultFinding, faultFinding, faultFinding);
    const { call, out, record } = tuning([RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out).toContain('  model check: round 0 judged 35 items: entailed 32, not entailed 1, ambiguous 1, missing 1; label problems 1 (7 claims)');
    expect(out).toContain('  verify: hold after 2 revision rounds; the gate says publish');
    expect(record().rows[0]).toMatchObject({
      status: 'judged',
      modelCheck: { round: 0, judged: 35, entailed: 32, notEntailed: 1, ambiguous: 1, missing: 1, claims: 7, labelProblems: 1 },
      verdict: { outcome: 'hold', rounds: 2, route: 'publish', codes: {} },
      usage: { calls: 7 },
    });
  });
});

describe('main: tune, a draft that the gate sends back every time', () => {
  it('says that the model was not asked, because the gate found failures in every round, with the codes of the gate for the first draft and for the last, and that the piece is held', async () => {
    const uncited = { ...DEMO_REPLY, title: { ...DEMO_REPLY.title, claimIds: [] } };
    const reading = new FakeClient().script('extract', { claims: DEMO_CLAIMS }).script('compose', uncited, { replacements: [] }, { replacements: [] });
    const { call, out, record } = tuning([RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    const row = record().rows[0]!;
    expect(row).toMatchObject({ status: 'judged', modelCheck: null, composed: { route: 'revise' }, verdict: { outcome: 'hold', rounds: 2, route: 'revise' }, usage: { calls: 4 } });
    expect(Object.keys(row.composed!.codes).length).toBeGreaterThan(0);
    expect(row.verdict!.codes).toEqual(row.composed!.codes);
    expect(out).toContain('  model check: not asked (the gate found failures in every round)');
    expect(out.some((line) => line.startsWith('  composed draft: the gate says revise ('))).toBe(true);
    expect(out.some((line) => line.startsWith('  verify: hold after 2 revision rounds; the gate says revise ('))).toBe(true);
  });
});

describe('main: tune, the outlet of a page of another outlet', () => {
  it('is the name that the registry gives the outlet, so that the claims of its page are attributed to it', async () => {
    const claim = {
      text: 'The arm is priced from $38,000.',
      label: 'priced from $38,000',
      type: 'number',
      quote: 'The arm is priced from $38,000, the outlet reported.',
      values: [{ kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' }],
      basis: 'reported',
      status: 'unspecified',
      source: 1,
    };
    const { call, dir } = tuning([ARTICLE], { deps: { tuneClient: new FakeClient().script('extract', { claims: [claim] }) } });
    expect(await call('--client', 'fake')).toBe(0);
    const extracted = JSON.parse(readFileSync(path.join(dir, '01/trial-1/04-extract.json'), 'utf8')) as { claims: { source: { tier: number; outlet: string; url: string } }[] };
    expect(extracted.claims).toHaveLength(1);
    expect(extracted.claims[0]!.source).toMatchObject({ tier: 2, outlet: 'Mercer Wire', url: ARTICLE });
  });

  it('is the name of the company for a page of its newsroom, which is a primary source and carries no outlet in its claims', async () => {
    const { call, dir } = tuning([RELEASE], { deps: { tuneClient: new FakeClient().script('extract', { claims: [DEMO_CLAIMS[0]!] }) } });
    expect(await call('--client', 'fake')).toBe(0);
    const extracted = JSON.parse(readFileSync(path.join(dir, '01/trial-1/04-extract.json'), 'utf8')) as { claims: { source: Record<string, unknown> }[] };
    expect(extracted.claims[0]!.source).toMatchObject({ tier: 1 });
    expect(extracted.claims[0]!.source).not.toHaveProperty('outlet');
  });
});

describe('main: tune, the scripted client that proposes nothing', () => {
  it('is what --client fake is when no story is given: every page is fetched and sorted, Extract is told that there are no claims, and nothing costs anything', async () => {
    const { call, out, err } = tuning([RELEASE, ARTICLE]);
    expect(await call('--client', 'fake', '--trials', '2')).toBe(0);
    expect(err).toEqual([]);
    expect(out.filter((line) => line.startsWith('  result:'))).toHaveLength(4);
    for (const line of out.filter((candidate) => candidate.startsWith('  result:'))) expect(line).toContain('too few claims to write a piece from');
    expect(out.filter((line) => line.startsWith('page '))).toHaveLength(4);
    expect(out.find((line) => line.startsWith('total:'))).toMatch(/^total: 2 pages, 4 trials, 4 of 40 model calls, \d+ tokens in, \d+ out$/);
  });
});

describe('main: tune, the budget of model calls', () => {
  it('stops the whole invocation when the calls are spent, and says so in the table and on the error output, with exit code 1, and keeps what was done', async () => {
    const { call, out, err, record } = tuning([RELEASE, ARTICLE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake', '--max-calls', '2')).toBe(1);
    const stopped = `the budget of 2 model calls (--max-calls) ran out, so the run stopped during trial 1 of page 1 (${RELEASE}), and what comes after it was not tried`;
    expect(err).toEqual([`desk: the tuning stopped before it was done: ${stopped}`]);
    expect(out).toContain(`  result: stopped by the budget of model calls: the budget of 2 model calls for this invocation is spent`);
    expect(out.at(-1)).toBe(`stopped: ${stopped}`);
    expect(out.find((line) => line.startsWith('total:'))).toMatch(/^total: 2 pages, 1 trial, 2 of 2 model calls, \d+ tokens in, \d+ out$/);
    expect(record().stopped).toBe(stopped);
    expect(record().rows).toHaveLength(1);
    expect(record().rows[0]).toMatchObject({ status: 'stopped', usage: { calls: 2 } });
  });

  it('does not stop for a budget that is exactly enough: three calls make a trial, and three are allowed', async () => {
    const { call, err, record } = tuning([RELEASE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake', '--max-calls', '3')).toBe(0);
    expect(err).toEqual([]);
    expect(record().stopped).toBeNull();
    expect(record().total.calls).toBe(3);
  });

  it('stops before the next page when the calls were spent at the end of the one before, and does not fetch it', async () => {
    const { call, err, sent, record } = tuning([RELEASE, ARTICLE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake', '--max-calls', '3')).toBe(1);
    expect(err).toEqual([`desk: the tuning stopped before it was done: the budget of 3 model calls (--max-calls) is spent, so the run stopped before page 2 (${ARTICLE}), and what comes after it was not tried`]);
    expect(sent.map((request) => request.url)).not.toContain(ARTICLE);
    expect(sent.some((request) => request.url.startsWith('https://mercer-wire.example'))).toBe(false);
    expect(record().rows).toHaveLength(1);
    expect(record().total).toMatchObject({ pages: 2, trials: 1, calls: 3 });
  });

  it('counts the calls of all the trials together and stops the second trial where the budget runs out', async () => {
    const { call, err, record } = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    expect(await call('--client', 'fake', '--trials', '2', '--max-calls', '4')).toBe(1);
    expect(err[0]).toContain('during trial 2 of page 1');
    expect(record().rows.map((row) => [row.trial, row.status, row.usage.calls])).toEqual([
      [1, 'judged', 3],
      [2, 'stopped', 1],
    ]);
  });

  it('stops before a trial that it has no call for, when the calls were spent by the trial before it', async () => {
    const { call, err, record } = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    expect(await call('--client', 'fake', '--trials', '2', '--max-calls', '3')).toBe(1);
    expect(err[0]).toContain(`so the run stopped before trial 2 of page 1 (${RELEASE})`);
    expect(record().rows).toHaveLength(1);
  });

  it('holds each trial to the budget of the settings as well: a trial that spends more than a run may fails, and the next trial has the whole budget again', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    made.deps.config = { ...made.deps.config!, budget: { ...defaultConfig().budget, maxCalls: 2 } };
    expect(await made.call('--client', 'fake', '--trials', '2')).toBe(0);
    expect(made.record().rows.map((row) => [row.trial, row.status, row.usage.calls])).toEqual([
      [1, 'failed', 2],
      [2, 'failed', 2],
    ]);
    expect(made.record().rows[0]!.note).toBe('budget spent: 2 of 2 model calls');
    expect(made.record().total.calls).toBe(4);
  });
});

describe('main: tune, pages that cannot be tried', () => {
  it('says that a page that robots.txt forbids was not fetched, and asks no model about it', async () => {
    const routes = world({ 'https://fixture-robotics.example/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /news/\n' } });
    const fake = story();
    const { call, out, sent, record } = tuning([RELEASE], { routes, deps: { tuneClient: fake } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.find((line) => line.startsWith('  result:'))).toMatch(/^ {2}result: not fetched: .*robots\.txt/);
    expect(out).toContain('  kind: company-newsroom (tier 1)');
    expect(sent.map((request) => request.url)).toEqual(['https://fixture-robotics.example/robots.txt']);
    expect(fake.calls).toEqual([]);
    expect(record().rows[0]).toMatchObject({ trial: null, status: 'not-fetched', usage: { calls: 0, inputTokens: 0, outputTokens: 0 } });
    expect(record().total).toEqual({ pages: 1, trials: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('says that a page on a host that sources.yml does not list is not a known kind of source, and does not fetch it, not even its robots.txt', async () => {
    const { call, out, sent, record } = tuning(['https://elsewhere.example/story']);
    expect(await call('--client', 'fake')).toBe(0);
    expect(out).toContain('page 1 of 1: https://elsewhere.example/story');
    expect(out).toContain('  kind: unknown (no tier)');
    expect(out).toContain('  result: not a known kind of source, so not read: the address is on no host that sources.yml lists, so it was not fetched');
    expect(sent).toEqual([]);
    expect(record().rows[0]).toMatchObject({ kind: 'unknown', status: 'unknown-kind', trial: null });
  });

  it('says that a page that redirected to another kind of source is not read, and keeps nothing of it', async () => {
    const routes = world({ [RELEASE]: { status: 302, headers: { location: ARTICLE }, body: '' } });
    const { call, out, record, dir } = tuning([RELEASE], { routes });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.find((line) => line.startsWith('  result:'))).toBe(`  result: not a known kind of source, so not read: the page was served from ${ARTICLE}, which is not the kind of source that ${RELEASE} is, so it was not read`);
    expect(record().rows[0]).toMatchObject({ status: 'unknown-kind' });
    expect(existsSync(path.join(dir, 'evidence'))).toBe(false);
  });

  it('says that a page that is not found, or that has no text, was not fetched, and goes on to the next page', async () => {
    const routes = world({ [RELEASE]: { status: 404, body: 'gone' }, [ARTICLE]: { body: '<html><body><script>var x = 1;</script></body></html>' } });
    const reading = new FakeClient().script('extract', { claims: [] });
    const { call, out, record } = tuning([RELEASE, ARTICLE, RELEASE], { routes, deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(record().rows.map((row) => row.status)).toEqual(['not-fetched', 'not-fetched', 'not-fetched']);
    expect(record().rows[0]!.note).toContain('404');
    expect(record().rows[1]!.note).toMatch(/no text|cannot be read/);
    expect(out.filter((line) => line.startsWith('page '))).toHaveLength(3);
  });

  it('says that a trial failed, with why, and goes on to the next page, and the invocation ends 0: what happened is in the table', async () => {
    const reading = new FakeClient().script('extract', { claims: 'not a list' }).script('extract', { claims: [] });
    const { call, out, record } = tuning([RELEASE, ARTICLE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(record().rows.map((row) => row.status)).toEqual(['failed', 'too-few-claims']);
    expect(out).toContain('  result: failed: the reply for the extract role does not match its schema: claims: Invalid input: expected array, received string');
    expect(out.filter((line) => line.startsWith('page '))).toEqual([`page 1 of 2, trial 1 of 1: ${RELEASE}`, `page 2 of 2, trial 1 of 1: ${ARTICLE}`]);
  });
});

describe('main: tune, what it refuses', () => {
  it('refuses the api client when there is no key in the environment, with exit code 2, before it fetches anything, and writes nothing', async () => {
    const { call, err, out, sent, cwd } = tuning([RELEASE]);
    expect(await call()).toBe(2);
    expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
    expect(out).toEqual([]);
    expect(sent).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('uses the api client when it has a key, never prints the key, and never reaches a network: with none to reach, the trial fails and says so', async () => {
    const key = 'a-key-for-the-test-only';
    const { call, out, err, record } = tuning([RELEASE], { deps: { env: { ANTHROPIC_API_KEY: key }, retry: { retries: 0 } } });
    expect(await call()).toBe(0);
    expect(record().client).toBe('api');
    expect(record().rows[0]).toMatchObject({ status: 'failed', usage: { calls: 1, inputTokens: 0, outputTokens: 0 } });
    expect([...out, ...err].join('\n')).not.toContain(key);
    expect(out[0]).toBe('tune: 1 address, 1 trial each, at most 40 model calls, client api');
  });

  it('refuses a user agent that links to a placeholder address, as a live run does, because it asks sites who it is', async () => {
    const { call, err, sent, cwd } = tuning([RELEASE], { deps: { config: undefined, env: { ANTHROPIC_API_KEY: 'k' } } });
    expect(await call()).toBe(2);
    expect(err[0]).toContain('is a placeholder address: a tuning run, which fetches live pages, needs a user agent that links to the real /method page of the Desk');
    expect(sent).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('says what is wrong with the list of addresses and with the file of settings, with exit code 2 and nothing written', async () => {
    const missing = tuning([RELEASE]);
    expect(await main(['tune', '--urls', 'nope.txt'], missing.deps)).toBe(2);
    expect(missing.err).toEqual(['desk: cannot read the list of addresses nope.txt (ENOENT)']);
    const bad = tuning([], { list: '# pages\nhttps://a.example/one\nnot an address\n' });
    expect(await bad.call()).toBe(2);
    expect(bad.err).toEqual(['desk: the list of addresses urls.txt: line 3 is not the address of a web page (an http or https address): "not an address"']);
    const empty = tuning([], { list: '# nothing\n' });
    expect(await empty.call()).toBe(2);
    expect(empty.err).toEqual(['desk: the list of addresses urls.txt: it lists no address']);
    const settings = tuning([RELEASE]);
    expect(await settings.call('--config', 'nope.yml')).toBe(2);
    expect(settings.err.join('\n')).toContain('cannot read the file');
    for (const made of [missing, bad, empty, settings]) {
      expect(made.out).toEqual([]);
      expect(existsSync(path.join(made.cwd, 'runs'))).toBe(false);
    }
  });

  it('says that the registry cannot be read when it cannot, with exit code 1', async () => {
    const made = tuning([RELEASE]);
    writeFileSync(path.join(made.cwd, 'sources.yml'), 'not: [a registry');
    expect(await made.call('--client', 'fake')).toBe(1);
    expect(made.err[0]).toContain('the sources cannot be read');
  });

  it('does not write over an invocation that is there: two with the same name are one too many, and the first is as it was', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story(2), now: () => START } });
    expect(await made.call('--client', 'fake')).toBe(0);
    const before = filesBelow(made.cwd);
    const text = readFileSync(path.join(made.dir, 'tune.json'), 'utf8');
    expect(await made.call('--client', 'fake')).toBe(1);
    expect(made.err.at(-1)).toContain('the tuning could not be done');
    expect(made.err.at(-1)).toContain('EEXIST');
    expect(filesBelow(made.cwd)).toEqual(before);
    expect(readFileSync(path.join(made.dir, 'tune.json'), 'utf8')).toBe(text);
  });
});

describe('main: tune, what it writes', () => {
  it('writes only below runs/tune/<stamp>/: not the site, not the desk state, not the folder of the evidence of the settings, and asks git for nothing', async () => {
    const { call, cwd, git, dir } = tuning([RELEASE], { deps: { tuneClient: story() } });
    const before = filesBelow(cwd);
    expect(await call('--client', 'fake')).toBe(0);
    const added = filesBelow(cwd).filter((file) => !before.includes(file));
    expect(added.length).toBeGreaterThan(5);
    for (const file of added) expect(file, file).toMatch(/^runs\/tune\/20261005-043100\//);
    expect(filesBelow(cwd).filter((file) => before.includes(file))).toEqual(before);
    expect(readFileSync(path.join(cwd, 'site/src/data/desk-state.json'), 'utf8')).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
    expect(existsSync(path.join(cwd, 'evidence'))).toBe(false);
    expect(path.relative(cwd, dir)).toBe('runs/tune/20261005-043100');
  });

  it('leaves the record of the invocation, the artifacts of each trial, and the page, which is kept here and in no other store', async () => {
    const { call, cwd, dir, record } = tuning([RELEASE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake')).toBe(0);
    const files = filesBelow(dir);
    expect(files.filter((file) => !file.startsWith('evidence/'))).toEqual(['01/trial-1/04-extract.json', '01/trial-1/05-compose.json', '01/trial-1/06-verify.json', 'tune.json']);
    expect(files.filter((file) => file.startsWith('evidence/')).map((file) => file.slice(-4)).sort()).toEqual(['.txt', 'json']);
    const page = readFileSync(path.join(dir, files.find((file) => file.endsWith('.txt'))!), 'utf8');
    expect(page).toContain('Fixture Robotics has begun shipping FX-1 warehouse arms');
    expect(record()).toMatchObject({ stamp: '20261005-043100', date: '2026-10-05', client: 'fake', trials: 1, maxCalls: 40, stopped: null, dollars: null });
    expect(record().models).toEqual(defaultConfig().models);
    expect(record().total).toEqual({ pages: 1, trials: 1, calls: 3, inputTokens: 6270, outputTokens: 2891 });
    expect(existsSync(path.join(cwd, 'runs', '2026-10-05'))).toBe(false);
  });

  it('never uses the evidence store of the settings, even when they say that it is the bucket and the environment has no bucket', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story() } });
    made.deps.config = { ...made.deps.config!, evidence: { kind: 'r2' } };
    expect(await made.call('--client', 'fake')).toBe(0);
    expect(made.err).toEqual([]);
    expect(filesBelow(made.dir).some((file) => file.startsWith('evidence/'))).toBe(true);
  });

  it('is in the folder that the daily workflow does not upload, whatever it holds', () => {
    const upload = stepNamed(loadWorkflow('desk.yml'), 'Keep the artifacts of the run for 14 days').with!.path as string;
    expect(upload.split('\n')).toContain(`!runs/${TUNE_FOLDER}/**`);
    expect(TUNE_FOLDER).toBe('tune');
  });
});

describe('runTune: the same rule about money as a run', () => {
  /** What `runTune` is given for the made-up world, which has no network: its pages are the fixture files. */
  function options(overrides: Partial<TuneOptions> = {}): { given: TuneOptions; lines: string[]; root: string } {
    const root = scratch();
    const config = { ...defaultConfig(), runDir: path.join(root, 'runs') };
    const lines: string[] = [];
    const given: TuneOptions = {
      urls: [RELEASE],
      trials: 1,
      maxCalls: 10,
      clientKind: 'fake',
      sourcesKind: 'fixtures',
      config,
      sources: demoRegistry(),
      fetcher: demoFetcher(() => START),
      buildClient: (wrap) => clientFromConfig(config, { kind: 'fake', fake: story() }, {}, {}, undefined, wrap),
      date: '2026-10-05',
      stamp: 'made-up',
      out: (line) => void lines.push(line),
      ...overrides,
    };
    return { given, lines, root };
  }

  it('refuses the api client on the made-up world, with the reason that a run gives, before anything is fetched, asked or written', async () => {
    const { given, lines, root } = options({ clientKind: 'api' });
    await expect(runTune(given)).rejects.toThrow(TuneRefused);
    await expect(runTune(given)).rejects.toThrow(refuseApiOnFixtures('api', 'fixtures')!);
    expect(lines).toEqual([]);
    expect(existsSync(path.join(root, 'runs'))).toBe(false);
  });

  it('refuses a client that is neither the api nor the scripted one, because the recorded replies are not for tuning', async () => {
    const { given, root } = options({ clientKind: 'recorded' });
    await expect(runTune(given)).rejects.toThrow('tune takes the api client or the scripted one, not recorded');
    expect(existsSync(path.join(root, 'runs'))).toBe(false);
  });

  it('runs the scripted client on the made-up world, which costs nothing: the same table, from fixture pages', async () => {
    const { given, lines, root } = options();
    const { record, dir } = await runTune(given);
    expect(record.rows.map((row) => row.status)).toEqual(['judged']);
    expect(lines).toContain('  claims proposed: 7');
    expect(path.relative(root, dir)).toBe('runs/tune/made-up');
  });
});
```

**In `desk/test/fetch/exports.test.ts`, replace:**
```ts
    const publication = ['runPublish', 'runHold', 'holdReasonsOf', 'renderHeldPiece', 'heldPieceFiles', 'holdPrTitle', 'holdPrBody', 'sendToOwner'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...program, ...demo]) {
```

**with:**
```ts
    const publication = ['runPublish', 'runHold', 'holdReasonsOf', 'renderHeldPiece', 'heldPieceFiles', 'holdPrTitle', 'holdPrBody', 'sendToOwner'];
    const orchestration = ['runDesk', 'DEFAULT_STAGES', 'replayRun', 'REPLAYED'];
    const program = ['parseArgs', 'main', 'USAGE', 'runTune', 'parseUrlList', 'priceOf', 'dollarsOf', 'rowLines', 'totalLines', 'TuneRow', 'TuneRecord', 'TUNE_DEFAULT_CALLS', 'TUNE_MAX_CALLS', 'TUNE_MAX_TRIALS', 'TUNE_FOLDER', 'TuneRefused'];
    const demo = ['DEMO_DATE', 'DEMO_URLS', 'DEMO_FIXTURE_DIR', 'demoWorldMap', 'demoFetcher', 'DEMO_REGISTRY_YAML', 'demoRegistry', 'DEMO_CLAIMS', 'DEMO_REPLY', 'DEMO_SELECT_REASON', 'clearingVerifier', 'demoClient'];
    for (const name of [...stages, ...extraction, ...assembly, ...composition, ...verification, ...revision, ...publication, ...orchestration, ...program, ...demo]) {
```

Run: `npm test --workspace @robywire/desk -- test/tune.test.ts`
Expected: FAIL — `unknown command "tune"`

- [ ] **Step 8: Write the command**

**In `desk/src/cli.ts`, replace:**
```ts
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { CORRECTION_KINDS, loadSources } from '@robywire/gate';
```

**with:**
```ts
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { CORRECTION_KINDS, loadSources } from '@robywire/gate';
```

**In `desk/src/cli.ts`, replace:**
```ts
  sitePaths,
  DryTarget,
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, EvidenceStore, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoreTransport, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
```

**with:**
```ts
  sitePaths,
  DryTarget,
  FakeClient,
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, EvidenceStore, Fetcher, ForgeTarget, GitTarget, Lookup, ModelClient, RetryOptions, SourcesKind, StoreTransport, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
```

**In `desk/src/cli.ts`, replace:**
```ts
import type { RunResult, Stages } from './run/orchestrate';
import { replayRun } from './run/replay';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>`, `desk status` and `desk retract <slug>`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
```

**with:**
```ts
import type { RunResult, Stages } from './run/orchestrate';
import { replayRun } from './run/replay';
import { TUNE_DEFAULT_CALLS, TUNE_MAX_CALLS, TUNE_MAX_TRIALS, TuneRefused, parseUrlList, runTune } from './run/tune';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>`, `desk status`, `desk retract <slug>` and `desk tune`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
```

**In `desk/src/cli.ts`, replace:**
```ts
  | { command: 'status'; config: string | undefined }
  | { command: 'retract'; slug: string; reason: string; kind: CorrectionKind; dry: boolean }
  | { command: 'help' };

```

**with:**
```ts
  | { command: 'status'; config: string | undefined }
  | { command: 'retract'; slug: string; reason: string; kind: CorrectionKind; dry: boolean }
  | { command: 'tune'; urls: string; trials: number; maxCalls: number; client: 'api' | 'fake'; config: string | undefined }
  | { command: 'help' };

```

**In `desk/src/cli.ts`, replace:**
```ts
  '  desk status [--config <path>]',
  '  desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
```

**with:**
```ts
  '  desk status [--config <path>]',
  '  desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]',
  '  desk tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
```

**In `desk/src/cli.ts`, replace:**
```ts
  '        (UTC), and the two are committed in one commit. The reason is one line of at most 500 characters. Nothing is deleted: the page stays up with its notice. A piece',
  '        that was held is on its pull request until the owner merges it, and cannot be corrected before. --dry says what would be done and writes nothing.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'retract', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new', '--skip-if-done'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
  retract: { flags: ['--dry'], valued: ['--reason', '--kind'] },
};

```

**with:**
```ts
  '        (UTC), and the two are committed in one commit. The reason is one line of at most 500 characters. Nothing is deleted: the page stays up with its notice. A piece',
  '        that was held is on its pull request until the owner merges it, and cannot be corrected before. --dry says what would be done and writes nothing.',
  'tune    try the pipeline on real pages and say what each step found. --urls is a file of addresses, one to a line (a # starts a comment). Each page is fetched as the Desk fetches',
  '        (robots.txt honoured, at the pace of the settings) and sent through Extract, Compose and Verify with --client api (the default; it needs ANTHROPIC_API_KEY) or --client fake (a model',
  '        that proposes no claims: it tries the fetching and the sorting of the pages and costs nothing). --trials N runs the model steps N times on each page (1 to 10, 1 unless told otherwise),',
  '        and --max-calls M stops the whole invocation, with exit code 1, when it has made M model calls (1 to 200, 40 unless told otherwise); each trial is also held to the budget of the settings.',
  '        For each page and trial it prints the claims proposed, dropped (with the rule that dropped them) and kept, what the gate said of the draft, what the model check said of its sentences,',
  '        and the tokens (dollars too when the settings have prices). Nothing is published or committed: it writes only below runs/tune/<stamp>/, and keeps the pages there, never in the bucket.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'retract' | 'tune', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new', '--skip-if-done'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
  retract: { flags: ['--dry'], valued: ['--reason', '--kind'] },
  tune: { flags: [], valued: ['--urls', '--trials', '--max-calls', '--client', '--config'] },
};

```

**In `desk/src/cli.ts`, replace:**
```ts
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status' && command !== 'retract') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
```

**with:**
```ts
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status' && command !== 'retract' && command !== 'tune') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
```

**In `desk/src/cli.ts`, replace:**
```ts
    return { ok: true, args: { command: 'retract', slug, reason, kind: kind as CorrectionKind, dry: given.has('--dry') } };
  }
  const sourcesGiven = value('--sources');
  if (sourcesGiven !== undefined && !SOURCES.includes(sourcesGiven)) return fail(`--sources is fixtures or live, not "${sourcesGiven}"`);
```

**with:**
```ts
    return { ok: true, args: { command: 'retract', slug, reason, kind: kind as CorrectionKind, dry: given.has('--dry') } };
  }
  if (command === 'tune') {
    if (positional.length > 0) return fail(`tune takes no arguments, but was given "${positional[0]}"`);
    const urls = value('--urls');
    if (urls === undefined) return fail('tune needs --urls <file>: the file that lists the addresses of the pages to try, one to a line');
    const whole = (given: string | undefined, fallback: number, most: number): number | undefined => (given === undefined ? fallback : /^[1-9]\d{0,5}$/.test(given) && Number(given) <= most ? Number(given) : undefined);
    const trials = whole(value('--trials'), 1, TUNE_MAX_TRIALS);
    if (trials === undefined) return fail(`--trials is a whole number from 1 to ${TUNE_MAX_TRIALS}, not "${value('--trials')}"`);
    const maxCalls = whole(value('--max-calls'), TUNE_DEFAULT_CALLS, TUNE_MAX_CALLS);
    if (maxCalls === undefined) return fail(`--max-calls is a whole number from 1 to ${TUNE_MAX_CALLS}, not "${value('--max-calls')}"`);
    const client = value('--client') ?? 'api';
    if (client !== 'api' && client !== 'fake') return fail(`--client is api or fake for tune, not "${client}"`);
    return { ok: true, args: { command: 'tune', urls, trials, maxCalls, client, config: value('--config') } };
  }
  const sourcesGiven = value('--sources');
  if (sourcesGiven !== undefined && !SOURCES.includes(sourcesGiven)) return fail(`--sources is fixtures or live, not "${sourcesGiven}"`);
```

**In `desk/src/cli.ts`, replace:**
```ts
  /** How the api client waits between tries. */
  retry?: RetryOptions;
}

```

**with:**
```ts
  /** How the api client waits between tries. */
  retry?: RetryOptions;
  /** The scripted model that `desk tune --client fake` uses, which a test gives a story to tell. By default it is one that proposes no claims on any page. */
  tuneClient?: FakeClient;
}

```

**In `desk/src/cli.ts`, replace:**
```ts
}

/** A path as it is shown to a person: relative to the folder the command was started in, with forward slashes. */
const shownPath = (cwd: string, file: string): string => path.relative(cwd, file).split(path.sep).join('/');
```

**with:**
```ts
}

/** Why a user agent that links to a placeholder address is refused for `what` (a live run, a tuning run): the site that is asked cannot find out who is asking. */
const placeholderRefusal = (userAgent: string, host: string, what: string): string =>
  `desk: the user agent "${userAgent}" links to ${host}, which is a placeholder address: ${what} needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`;

/** A path as it is shown to a person: relative to the folder the command was started in, with forward slashes. */
const shownPath = (cwd: string, file: string): string => path.relative(cwd, file).split(path.sep).join('/');
```

**In `desk/src/cli.ts`, replace:**
```ts
  const placeholder = args.sources === 'live' ? placeholderHost(config.userAgent) : undefined;
  if (placeholder !== undefined) {
    deps.err(
      `desk: the user agent "${config.userAgent}" links to ${placeholder}, which is a placeholder address: a live run needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`,
    );
    return 2;
  }
```

**with:**
```ts
  const placeholder = args.sources === 'live' ? placeholderHost(config.userAgent) : undefined;
  if (placeholder !== undefined) {
    deps.err(placeholderRefusal(config.userAgent, placeholder, 'a live run'));
    return 2;
  }
```

**In `desk/src/cli.ts`, replace:**
```ts
}

async function retractCommand(args: Extract<Parsed, { command: 'retract' }>, deps: CliDeps): Promise<number> {
  try {
```

**with:**
```ts
}

/**
 * `desk tune`: the table of what each step found on each real page of a list. The settings are read first, then the list, then the registry, then the client (so that the api without a
 * key is refused before anything is fetched), and only then does the first page get fetched. A mistake in any of them is exit code 2 and nothing is written (the registry that cannot be read
 * is 1, as for `run`); an invocation that is stopped by the budget of calls is 1, with the reason on the error output; every other ending is 0, the pages that could not be tried included,
 * because what happened to them is in the table.
 */
async function tuneCommand(args: Extract<Parsed, { command: 'tune' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const placeholder = placeholderHost(config.userAgent);
  if (placeholder !== undefined) {
    deps.err(placeholderRefusal(config.userAgent, placeholder, 'a tuning run, which fetches live pages,'));
    return 2;
  }
  let text: string;
  try {
    text = await readFile(path.resolve(deps.cwd, args.urls), 'utf8');
  } catch (error) {
    deps.err(`desk: cannot read the list of addresses ${args.urls} (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})`);
    return 2;
  }
  const listed = parseUrlList(text);
  if ('problem' in listed) {
    deps.err(`desk: the list of addresses ${args.urls}: ${listed.problem}`);
    return 2;
  }
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf('live', deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }
  const choice: ClientChoice =
    args.client === 'fake'
      ? { kind: 'fake', fake: deps.tuneClient ?? new FakeClient().script('extract', ...Array.from({ length: listed.urls.length * args.trials }, () => ({ claims: [] }))) }
      : { kind: 'api' };
  const buildClient = (wrap: (client: ModelClient) => ModelClient): BuiltClient => clientFromConfig(config, choice, deps.env, deps.retry ?? {}, undefined, wrap);
  try {
    buildClient((client) => client);
  } catch (error) {
    deps.err(describeError(error));
    return 2;
  }
  const now = deps.now();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  deps.out(`tune: ${listed.urls.length} ${listed.urls.length === 1 ? 'address' : 'addresses'}, ${args.trials} ${args.trials === 1 ? 'trial' : 'trials'} each, at most ${args.maxCalls} model calls, client ${args.client}`);
  deps.out(`folder: ${shownPath(deps.cwd, path.join(config.runDir, 'tune', stamp))}`);
  try {
    const { record } = await runTune({
      urls: listed.urls,
      trials: args.trials,
      maxCalls: args.maxCalls,
      clientKind: args.client,
      sourcesKind: 'live',
      config,
      sources: world.sources,
      fetcher: world.fetcher,
      buildClient,
      date: now.toISOString().slice(0, 10),
      stamp,
      out: (line) => deps.out(line),
    });
    if (record.stopped === null) return 0;
    deps.err(`desk: the tuning stopped before it was done: ${record.stopped}`);
    return 1;
  } catch (error) {
    deps.err(error instanceof TuneRefused ? `desk: ${error.message}` : `the tuning could not be done: ${describeError(error)}`);
    return error instanceof TuneRefused ? 2 : 1;
  }
}

async function retractCommand(args: Extract<Parsed, { command: 'retract' }>, deps: CliDeps): Promise<number> {
  try {
```

**In `desk/src/cli.ts`, replace:**
```ts
    case 'retract':
      return retractCommand(parsed.args, deps);
  }
}
```

**with:**
```ts
    case 'retract':
      return retractCommand(parsed.args, deps);
    case 'tune':
      return tuneCommand(parsed.args, deps);
  }
}
```

Run: `npm test --workspace @robywire/desk -- test/tune.test.ts test/fetch/exports.test.ts`
Expected: PASS — `Test Files  2 passed (2)`

- [ ] **Step 9: Say it in the README, and keep it true**

The tests first.

**In `desk/test/readme.test.ts`, replace:**
```ts
    expect(section('The desk workspace')).not.toContain('the Cloudflare deploy');
  });
});

```

**with:**
```ts
    expect(section('The desk workspace')).not.toContain('the Cloudflare deploy');
  });
});

describe('the README: the tuning harness', () => {
  const tune = (): string => section('The tuning harness');

  it('is one of the commands, with its options, and says that it publishes and commits nothing', () => {
    expect(section('The desk command')).toContain('`npm run desk -- tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]`');
    expect(section('The desk command')).toContain('It publishes and commits nothing');
  });

  it('says what the list is, what is fetched and how, what a page of no known kind and a redirect do, and what --client fake is', () => {
    expect(tune()).toContain('lists addresses, one to a line (`#` starts a comment)');
    expect(tune()).toContain('`robots.txt` honoured, at the pace of the settings');
    expect(tune()).toContain('an address on a host that the registry does not list is not fetched at all');
    expect(tune()).toContain('`--client fake` (a scripted model that proposes no claims: it tries the fetching and the sorting and costs nothing)');
  });

  it('says what the table has, and that a page that cannot be tried or a trial that fails does not make the exit code 1', () => {
    expect(tune()).toContain('the claims dropped (counted under each rule that dropped them)');
    expect(tune()).toContain('what the gate said of the first draft (its failure codes)');
    expect(tune()).toContain('what the model check said of the first draft that the gate cleared');
    expect(tune()).toContain('neither makes the exit code 1');
  });

  it('says that dollars come only from prices that the owner wrote, and when there are none', () => {
    expect(tune()).toContain('The Desk does not know what a model costs and never guesses.');
    expect(tune()).toContain('`inputPerMillion` and `outputPerMillion`');
    expect(tune()).toContain('it shows no dollars when extract, compose and verify are not one model');
  });

  it('says what the budget of calls is, how it is counted, what happens when it is spent, and that each trial also has the budget of the settings', () => {
    expect(tune()).toContain('`--max-calls M` (1 to 200, 40 by default) is the most model calls that the whole invocation may make, counted where a call reaches the model, each retry included');
    expect(tune()).toContain('with the reason in the table and on the error output and exit code 1, and what was done is kept');
    expect(tune()).toContain('Each trial is also held to the budget of the settings');
  });

  it('says where it writes and what it never touches, that the pages are not in the bucket, and that the workflow does not upload them', () => {
    expect(tune()).toContain('Only below `runs/tune/<stamp>/`');
    expect(tune()).toContain('It never touches `site/`, the desk state or git, and it never uses the evidence store of the settings');
    expect(tune()).toContain('the daily workflow does not upload it');
  });

  it('says that it has only been run on scripted models and made-up pages, and that prices are a setting', () => {
    expect(tune()).toContain('It has been run only against scripted models and made-up pages.');
    expect(section('The desk command')).toContain('and `prices` (what a million tokens cost, which only `desk tune` reads)');
    expect(section('The desk workspace')).toContain('`desk tune`, the command that measures them, is built and tested with scripted models and has never been run against a real one');
  });
});

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: FAIL — `The tuning harness`

Then the README: the command in the list, the new section, and the sentences that said that tuning is not built.

**In `README.md`, replace:**
```markdown
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**with:**
```markdown
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: a command that keeps the snapshots of a piece that the owner released by merging a pull request, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (the prompts are written, and `desk tune`, the command that measures them, is built and tested with scripted models and has never been run against a real one), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command
```

**In `README.md`, replace:**
```markdown

- `npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]` records a correction (the default) or a retraction of a piece that is on the site, and commits it (see Holds and corrections).

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store (see The evidence store); the address, the name and the keys of a bucket are not settings, and a file that carries one is refused like any other setting that does not exist. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

`desk.config.yml` at the root of the repository is the file of settings of the daily run: the real user agent (it links to the /method page of the live site), `evidence: { kind: r2 }`, the folder of the runs, `maxAttemptsPerDay` and the budget of a run. It is committed, so it holds no secret, and it names no model (the models are the defaults of `desk/src/config.ts`). The key of the model and the four variables of the bucket come from the environment, never from this file. `desk/test/production-config.test.ts` loads it and checks all of this.
```

**with:**
```markdown

- `npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]` records a correction (the default) or a retraction of a piece that is on the site, and commits it (see Holds and corrections).
- `npm run desk -- tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]` is the harness for the first trials with a real model, and for tuning what the model is told. It publishes and commits nothing (see The tuning harness).

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, how many runs one day may have (`maxAttemptsPerDay`), the user agent, the budget, the models, the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative, and `prices` (what a million tokens cost, which only `desk tune` reads). The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store (see The evidence store); the address, the name and the keys of a bucket are not settings, and a file that carries one is refused like any other setting that does not exist. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

`desk.config.yml` at the root of the repository is the file of settings of the daily run: the real user agent (it links to the /method page of the live site), `evidence: { kind: r2 }`, the folder of the runs, `maxAttemptsPerDay` and the budget of a run. It is committed, so it holds no secret, and it names no model (the models are the defaults of `desk/src/config.ts`). The key of the model and the four variables of the bucket come from the environment, never from this file. `desk/test/production-config.test.ts` loads it and checks all of this.
```

**In `README.md`, replace:**
```markdown
- **What is not proved.** A workflow cannot be run anywhere but on GitHub, and no deploy has been made by this workflow: the one deploy that exists was made by hand. `desk/test/workflows/` reads the three workflows and `package.json` and fails when they disagree (every `npm run` has its script, one major version for each action, Node from `.nvmrc`, secrets only in an `env`).

## The verifier evals

```

**with:**
```markdown
- **What is not proved.** A workflow cannot be run anywhere but on GitHub, and no deploy has been made by this workflow: the one deploy that exists was made by hand. `desk/test/workflows/` reads the three workflows and `package.json` and fails when they disagree (every `npm run` has its script, one major version for each action, Node from `.nvmrc`, secrets only in an `env`).

## The tuning harness

`npm run desk -- tune --urls <file>` tries the pipeline on real pages and says what each step found, so that what the models are told can be tuned from evidence. `<file>` lists addresses, one to a line (`#` starts a comment); it needs `--config desk.config.yml` for the real user agent, as a live run does (a user agent that links to an `.example` address is refused with exit code 2). Each page is fetched as the Desk fetches (`robots.txt` honoured, at the pace of the settings), sorted by `sources.yml` (an address on a host that the registry does not list is not fetched at all, and a page that was redirected to another kind of source is not read), and sent through Extract, Compose and Verify with `--client api` (the default, which needs `ANTHROPIC_API_KEY`) or `--client fake` (a scripted model that proposes no claims: it tries the fetching and the sorting and costs nothing).

- **What it prints.** For each page and each trial (`--trials N`, 1 to 10, 1 by default, runs the model steps N times on a page that is fetched once): the kind of source, the claims proposed, the claims dropped (counted under each rule that dropped them), the claims that survived, what the gate said of the first draft (its failure codes), what the model check said of the first draft that the gate cleared (how many sentences and headings were entailed, not entailed, ambiguous or without a verdict, and how many claims had a basis or status that was not supported), how the verification ended, and the tokens. Then the total. A page that cannot be tried (robots.txt forbids it, it is not found, it is of no known kind) says why, and a trial that fails says why and the next page is tried; neither makes the exit code 1.
- **Dollars.** The Desk does not know what a model costs and never guesses. The settings may have a `prices` block (`inputPerMillion` and `outputPerMillion`, in dollars, which the owner reads from the price list), and then each trial and the total show dollars. Without it the table shows tokens only, and it shows no dollars when extract, compose and verify are not one model, because the block holds one price.
- **The budget.** `--max-calls M` (1 to 200, 40 by default) is the most model calls that the whole invocation may make, counted where a call reaches the model, each retry included. When they are spent the invocation stops where it is, with the reason in the table and on the error output and exit code 1, and what was done is kept. Each trial is also held to the budget of the settings, as a run is (calls, tokens in, tokens out): a trial that spends more fails, and the next has the whole budget again.
- **What it writes.** Only below `runs/tune/<stamp>/`: `tune.json` (the table as data, checked against a schema and rewritten after every trial, so that a program that stops leaves what was done), the artifacts of each trial in `<page number>/trial-<n>/` (`04-extract.json`, `05-compose.json`, `06-verify.json`), and the text of the pages in `evidence/`. It never touches `site/`, the desk state or git, and it never uses the evidence store of the settings, so a page that is only being tried does not reach the bucket. The pages are third parties' text: the folder is not committed (git ignores `runs/`) and the daily workflow does not upload it.
- **What is not proved.** It has been run only against scripted models and made-up pages. How it behaves on real pages and a real model is what the first trials show (docs/runbook.md, when it is written).

## The verifier evals

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' desk/src/run/tune.ts desk/src/cli.ts desk/src/config.ts desk/src/model/factory.ts desk/test/tune.test.ts desk/test/run/tune.test.ts README.md`
Expected: PASS — prints nothing

- [ ] **Step 10: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 11: Commit**

```bash
git add README.md desk/src/cli.ts desk/src/config.ts desk/src/model/factory.ts desk/src/run/tune.ts desk/test/config.test.ts desk/test/fetch/exports.test.ts desk/test/model/factory.test.ts desk/test/readme.test.ts desk/test/run/tune.test.ts desk/test/tune.test.ts
git commit -m "feat(desk): desk tune, which fetches each page of a list of real addresses as the Desk fetches, sorts it by the registry, sends it through Extract, Compose and Verify with the api or a scripted client, and prints for each page and trial the claims proposed, dropped by rule and kept, the gate on the draft, the model check on its sentences and the tokens (dollars when the settings hold prices), stopped by a budget of calls for the whole invocation and by the budget of the settings for each trial, and writing only below runs/tune" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 12: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing

---

### Task 27: The runbook

**Files:**
- Create: `docs/runbook.md`
- Create: `desk/test/runbook.test.ts`
- Modify: `README.md` (the section "The runbook", and the places that said that it is yet to be written), `desk/test/readme.test.ts`

Everything in Tasks 1 to 26 can be proved on one machine with no network. What is left cannot: a GitHub repository, a Cloudflare bucket and site, secrets, a real model, a week of real runs. Those are **operations**, and they are the part of this plan that is carried out by the owner, or by an agent with the owner's go-ahead at each outward step. The runbook is the list of them, in order, each with the exact commands and what to expect, so that nobody has to work out a command while holding a key.

The runbook has seven parts and thirty-four numbered steps:

1. *Before anything goes outward*: check the repository (`npm run verify`, and a search of what git tracks for anything shaped like a key); rewrite the author and the committer of every commit to the no-reply address that GitHub keeps for the account, so that the owner's own address is not published with the history.
2. *GitHub and Cloudflare, before the first push*: create the empty public repository; let the workflows push and open pull requests (a setting of the repository); log in to Cloudflare with `wrangler`; create the private bucket and the rule that deletes `pending/` after 90 days; make the access key of the bucket and the token that deploys (in the dashboard, because nothing else can); keep every secret in a file that only its owner can read; set the seven secrets of the repository from those files; check the versions of the actions, which this plan could not check.
3. *The first push*: push, and watch CI and the deploy; pause the daily workflow until go-live; look at the site; how to redo the first deploy by hand (it was made by hand, from a folder outside the workspace, and the workflow has taken over).
4. *The first contact with a real model*: choose the pages; run `desk tune` on one page with a small budget and then on all of them; read the table and judge the pages; measure the verifier on the real model; change the prompts if the trials say so (never the rules).
5. *The shadow week*: a dry run each day for five days, what to record, replaying a day.
6. *Going live*: freeze the floor of the verifier; turn on the flags of `site/src/lib/live.ts` in changes of their own, after the sentences that change have been read again; enable the schedule and make the first real run; check what it left; turn on the last two flags.
7. *Later, and when something is wrong*: a domain of one's own; take a piece down; stop the daily run; put the previous site back; rotate every key.

**The rules that run through it.** A step is marked *outward* when it changes something outside the machine, and an agent does not run one without the owner's go-ahead for that step. **No secret is ever on a command line**: the files that hold them are under `~/.config/agentic-media-house/` (mode 600) and a command reads a file (`gh secret set NAME < file`, `gh secret set --env-file file`, `NAME="$(cat file)" command`).

**What the test holds.** It cannot run a step, because every step meets GitHub, Cloudflare or a model. It can keep the runbook from lying about the repository, and from teaching anyone to leak a key: every `npm` script and every `desk` command and option that it names exists; every file and every workflow that it names is there, and the ones it starts can be started by hand; the secrets that it lists are exactly those that the workflows read; the times of the schedule are those of `desk.yml`; the names of the Worker, the site, the bucket and the repository agree with the files that fix them; nothing in it is shaped like a key, and no line of a command names a secret except in one of the few forms that read it from a file; every step has commands and what to expect, and a step that sends something outward says so. And it does one thing that no other test of the plan does: it **runs step 2**, the rewrite of the history, on a made-up repository of three commits with a tag, because that step cannot be undone once it is pushed.

- [ ] **Step 1: Write the test**

**Create `desk/test/runbook.test.ts`:**
```ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs, USAGE } from '../src/cli';
import { useScratch } from './support/context';
import { ISOLATED, git } from './support/repo';
import { secretsIn } from './support/secrets';
import { ROOT, loadWorkflow, stringsWith } from './support/workflow';

// docs/runbook.md is the list of operations that put the publication on the air: the commands to type and what to expect. Nothing in it can be run by a test, because every
// operation of it meets GitHub, Cloudflare or a real model. What a test can do is keep it from lying about the repository, and from teaching anyone to leak a secret: every
// command of the repository that it names exists and takes the options it is given, every workflow and file it names is there, the names agree with the files that fix them
// (the secrets with the workflows, the times with the schedule, the Worker with wrangler.jsonc), no secret is ever on a command line, and every step says what to expect.

const scratch = useScratch();
const TEXT = readFileSync(`${ROOT}docs/runbook.md`, 'utf8');
const LINES = TEXT.split('\n');
const PKG = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { scripts: Record<string, string> };
const VERIFIER_USAGE = readFileSync(`${ROOT}desk/evals/run-verifier.ts`, 'utf8');

interface Step {
  number: number;
  title: string;
  /** The text of the step, from its heading to the next heading. */
  text: string;
  /** The lines of its fenced blocks, and the language of each block. */
  blocks: { lang: string; lines: string[] }[];
}

/** The steps of the runbook, as the `### N. Title` headings split it, with the fenced blocks of each. */
function stepsOf(lines: readonly string[]): Step[] {
  const steps: Step[] = [];
  let current: Step | undefined;
  let block: { lang: string; lines: string[] } | undefined;
  for (const line of lines) {
    const fence = /^```(\S*)\s*$/.exec(line);
    if (block !== undefined) {
      if (fence !== null && fence[1] === '') {
        current?.blocks.push(block);
        block = undefined;
      } else {
        block.lines.push(line);
      }
      if (current !== undefined) current.text += `${line}\n`;
      continue;
    }
    const heading = /^### (\d+)\. (.+)$/.exec(line);
    if (heading !== null) {
      current = { number: Number(heading[1]), title: heading[2]!, text: '', blocks: [] };
      steps.push(current);
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      current = undefined;
      continue;
    }
    if (current !== undefined) current.text += `${line}\n`;
    if (fence !== null && current !== undefined) block = { lang: fence[1]!, lines: [] };
  }
  return steps;
}

const STEPS = stepsOf(LINES);
/** Every line of every fenced block of the runbook that holds a command (not the text of a file that the reader makes). */
const COMMANDS = STEPS.flatMap((step) => step.blocks.filter((block) => block.lang === 'bash').flatMap((block) => block.lines)).filter((line) => line.trim() !== '');

describe('docs/runbook.md: its shape', () => {
  it('has its parts numbered from 1 and its steps numbered from 1, in order, with no step missing', () => {
    const parts = LINES.flatMap((line) => /^## Part (\d+)\. /.exec(line)?.[1] ?? []).map(Number);
    expect(parts).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(STEPS.map((step) => step.number)).toEqual(STEPS.map((_, at) => at + 1));
    expect(STEPS.length).toBeGreaterThanOrEqual(30);
  });

  it('gives every step the exact commands, in a block of its own, and what to expect', () => {
    for (const step of STEPS) {
      // A step that is done in the dashboard of Cloudflare has no command to give, and says so in its title.
      if (!step.title.endsWith('(in the dashboard)')) expect(step.blocks.length, `step ${step.number}: ${step.title}`).toBeGreaterThan(0);
      expect(step.text, `step ${step.number}: ${step.title}`).toMatch(/^\*\*Expect:\*\*/m);
    }
  });

  it('marks as outward every step that sends something to GitHub, Cloudflare or the model, or that spends money, and no step that only reads or changes this checkout', () => {
    const OUTWARD = [/\bgh (?:secret set|repo create|workflow (?:run|enable|disable)|variable set|api -X)/, /\bgit push\b/, /\bwrangler"? (?:login|r2 bucket (?:create|lifecycle add|dev-url disable)|deploy|rollback)\b/, /ANTHROPIC_API_KEY="\$\(cat /];
    const outward = (step: Step): boolean => step.blocks.some((block) => block.lines.some((line) => OUTWARD.some((pattern) => pattern.test(line))));
    const wrong = STEPS.filter((step) => /\(outward/.test(step.title) !== outward(step)).map((step) => `step ${step.number}: ${step.title}`);
    expect(wrong).toEqual([]);
  });

  it('refers only to steps that there are, and never to a step that comes later than the one that refers to it, unless it says what to do then', () => {
    for (const step of STEPS) {
      for (const match of step.text.matchAll(/\bsteps? (\d+)(?: and (\d+))?/g)) {
        for (const number of [match[1], match[2]].flatMap((value) => (value === undefined ? [] : [Number(value)]))) {
          expect(number, `step ${step.number} refers to step ${number}`).toBeGreaterThanOrEqual(1);
          expect(number, `step ${step.number} refers to step ${number}`).toBeLessThanOrEqual(STEPS.length);
        }
      }
    }
    const introduction = LINES.slice(0, LINES.indexOf('## Part 1. Before anything goes outward')).join('\n');
    for (const match of introduction.matchAll(/\bsteps? (\d+)/g)) expect(Number(match[1])).toBeLessThanOrEqual(STEPS.length);
  });

  it('is plain ASCII, like the rest of the source', () => {
    expect([...TEXT].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('docs/runbook.md: the commands of the repository that it names', () => {
  const npmLines = COMMANDS.flatMap((line) => [...line.matchAll(/\bnpm (?:run )?([\w:.-]+)/g)].map((match) => ({ line, script: match[1]!, command: /\bnpm run /.test(match[0]) || match[1] === 'test' ? 'script' : 'other' })));

  it('runs only scripts that package.json has, and only the npm commands that install or run', () => {
    expect(npmLines.length).toBeGreaterThan(8);
    for (const { line, script, command } of npmLines) {
      if (script === 'ci') continue;
      expect(command, line).toBe('script');
      expect(PKG.scripts, line).toHaveProperty(script);
    }
  });

  it('names a workspace only when there is one', () => {
    const names = ['@robywire/desk', '@robywire/site', '@robywire/gate', '@robywire/evals'];
    for (const line of COMMANDS) for (const match of line.matchAll(/--workspace (\S+)/g)) expect(names, line).toContain(match[1]);
  });

  /** The words of `npm run desk -- ...` commands of the runbook, with the command and options of each. */
  const deskCommands = COMMANDS.flatMap((line) => [...line.matchAll(/npm run desk -- ([^)|;]+)/g)].map((match) => match[1]!.trim())).filter((text) => text !== '');

  it('gives every desk command a command that the usage lists, and only options that the usage lists for it', () => {
    expect(deskCommands.length).toBeGreaterThan(6);
    for (const text of deskCommands) {
      const [command, ...rest] = text.split(/\s+/);
      expect(USAGE, text).toContain(`desk ${command}`);
      const usageLine = USAGE.split('\n').find((line) => line.startsWith(`  desk ${command}`))!;
      for (const option of rest.filter((word) => word.startsWith('--'))) expect(usageLine, `${text}: ${option}`).toContain(option);
    }
  });

  it('gives every desk command that has no placeholder in it arguments that the command line accepts, as it will be typed', () => {
    const typed = deskCommands.filter((text) => !text.includes('<'));
    expect(typed.length).toBeGreaterThan(4);
    for (const text of typed) {
      const words = text.match(/"[^"]*"|\S+/g)!.map((word) => word.replace(/^"|"$/g, ''));
      const result = parseArgs(words);
      expect(result.ok, `${text}: ${result.ok ? '' : result.message}`).toBe(true);
    }
  });

  it('gives the verifier evals only options that they have', () => {
    const lines = COMMANDS.filter((line) => line.includes('npm run evals:verifier'));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) for (const option of line.match(/--[a-z-]+/g) ?? []) if (option !== '--client' || true) expect(VERIFIER_USAGE, `${line}: ${option}`).toContain(`'${option}'`);
  });
});

describe('docs/runbook.md: the files and the workflows that it names', () => {
  it('names only files of the repository that are there', () => {
    const named = [...TEXT.matchAll(/`((?:\.github|desk|site|docs)\/[\w./-]+|desk\.config\.yml|wrangler\.jsonc|sources\.yml|package\.json)`/g)].map((match) => match[1]!);
    expect(named.length).toBeGreaterThan(8);
    for (const file of named) expect(existsSync(path.join(ROOT, file)), file).toBe(true);
  });

  it('starts, enables and disables only workflows that exist, and starts only those that can be started by hand', () => {
    const named = COMMANDS.flatMap((line) => [...line.matchAll(/gh workflow (run|enable|disable) (\S+\.yml)/g)].map((match) => ({ action: match[1]!, file: match[2]! })));
    expect(named.length).toBeGreaterThan(4);
    for (const { action, file } of named) {
      expect(existsSync(path.join(ROOT, '.github/workflows', file)), file).toBe(true);
      if (action === 'run') expect(loadWorkflow(file).on, file).toHaveProperty('workflow_dispatch');
    }
  });

  it('says the times of the schedule that the daily workflow has, as the times of the day', () => {
    const crons = (loadWorkflow('desk.yml').on.schedule as { cron: string }[]).map(({ cron }) => /^(\d+) (\d+) /.exec(cron)!).map((match) => `${match[2]!.padStart(2, '0')}:${match[1]!.padStart(2, '0')}`);
    expect(crons).toEqual(['04:30', '06:30', '08:30']);
    for (const time of crons) expect(TEXT, time).toContain(time);
  });

  it('lists as the secrets of the repository exactly the ones that the workflows read', () => {
    const used = new Set<string>();
    for (const file of ['desk.yml', 'deploy.yml']) for (const { value } of stringsWith(loadWorkflow(file), 'secrets.')) used.add(/secrets\.([A-Z0-9_]+)/.exec(value)![1]!);
    const step10 = STEPS.find((step) => step.number === 10)!;
    const listed = [...step10.text.matchAll(/`([A-Z][A-Z0-9_]{5,})`/g)].map((match) => match[1]!).filter((name) => used.has(name) || /^(?:ANTHROPIC|CLOUDFLARE|R2)_/.test(name));
    expect([...new Set(listed)].sort()).toEqual([...used].sort());
    expect([...used].sort()).toHaveLength(7);
  });

  it('uses the names that wrangler.jsonc and the workflows fix: the Worker, the address of the site, and one name for the bucket and the repository', () => {
    const wrangler = JSON.parse(readFileSync(`${ROOT}wrangler.jsonc`, 'utf8')) as { name: string };
    const deploy = readFileSync(`${ROOT}.github/workflows/deploy.yml`, 'utf8');
    const site = /'(https:\/\/[^']+\.workers\.dev)'/.exec(deploy)![1]!;
    expect(site).toBe(`https://${wrangler.name}.joshi-alok.workers.dev`);
    expect(TEXT).toContain(site);
    expect(TEXT).toContain(`a Worker named \`${wrangler.name}\``);
    const buckets = new Set([...TEXT.matchAll(/agentic-media-house-[a-z]+/g)].map((match) => match[0]));
    expect([...buckets]).toEqual(['agentic-media-house-evidence']);
    const repositories = new Set([...TEXT.matchAll(/joshi-alok\/[a-z-]+/g)].map((match) => match[0]));
    expect([...repositories]).toEqual(['joshi-alok/agentic-media-house']);
  });
});

describe('docs/runbook.md: the secrets', () => {
  it('has nothing in it shaped like a key, a token or an account id', () => {
    expect(secretsIn(TEXT)).toEqual([]);
  });

  it('puts no secret on a command line: a line that names one is one of the few forms that read it from a file, or the line of a file that the reader makes, with a placeholder for the value', () => {
    const NAMES = /ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|R2_ENDPOINT|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/;
    const ALLOWED = [
      /^gh secret set ANTHROPIC_API_KEY --repo joshi-alok\/agentic-media-house < ~\/\.config\/agentic-media-house\/anthropic\.key$/,
      /^(?:\( set -a; \. ~\/\.config\/agentic-media-house\/r2\.env; set \+a; )?ANTHROPIC_API_KEY="\$\(cat ~\/\.config\/agentic-media-house\/anthropic\.key\)" npm run (?:desk -- |evals:verifier -- )[^|;]*?\)?$/,
      /^R2_ENDPOINT=https:\/\/<account id>\.r2\.cloudflarestorage\.com$/,
      /^R2_BUCKET=agentic-media-house-evidence$/,
      /^R2_ACCESS_KEY_ID=<[^>]+>$/,
      /^R2_SECRET_ACCESS_KEY=<[^>]+>$/,
      /^CLOUDFLARE_API_TOKEN=<[^>]+>$/,
      /^CLOUDFLARE_ACCOUNT_ID=<[^>]+>$/,
    ];
    const blocks = STEPS.flatMap((step) => step.blocks.flatMap((block) => block.lines));
    const named = blocks.filter((line) => NAMES.test(line));
    expect(named.length).toBeGreaterThan(8);
    for (const line of named) expect(ALLOWED.some((pattern) => pattern.test(line.trim())), line).toBe(true);
  });

  it('never sets a secret with a value on the command line: no --body, no -b, no pipe from echo or printf', () => {
    for (const line of COMMANDS.filter((candidate) => candidate.includes('gh secret set'))) {
      expect(line, line).not.toMatch(/\s(?:--body|-b)\b/);
      expect(line, line).not.toMatch(/(?:echo|printf|cat <<)/);
      expect(line, line).toMatch(/<\s*~\/\.config\/agentic-media-house\/[a-z.-]+|--env-file ~\/\.config\/agentic-media-house\/[a-z0-9.-]+\.env$/);
    }
  });

  it('keeps the files of secrets out of the repository: they are under ~/.config, and the mode of the folder and of the files is said', () => {
    expect(TEXT).toContain('chmod 700 ~/.config/agentic-media-house');
    expect(TEXT).toContain('chmod 600 ~/.config/agentic-media-house/*');
    for (const line of COMMANDS.filter((candidate) => /\.(?:env|key)\b/.test(candidate))) expect(line, line).toContain('~/.config/agentic-media-house/');
  });
});

describe('docs/runbook.md: step 2, the rewrite of the history, as it is written', () => {
  const blocks = STEPS.find((step) => step.number === 2)!.blocks.filter((block) => block.lang === 'bash');
  const rewrite = blocks[0]!;
  const clean = blocks[1]!;
  const NEW = '185603530+joshi-alok@users.noreply.github.com';

  /** Run the commands of a block the way that a person types them into bash, in `cwd`, and give what they print. */
  const run = (block: { lines: string[] }, cwd: string): string => execFileSync('bash', ['--noprofile', '--norc', '-e', '-c', block.lines.join('\n')], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ISOLATED } });

  /** A repository of three commits by someone else, a tag on the second, and nothing that a push could carry that is not in them. */
  function history(): string {
    const dir = scratch();
    git(dir, 'init', '--quiet', '-b', 'main');
    git(dir, 'config', 'user.name', 'Someone Else');
    git(dir, 'config', 'user.email', 'someone.else@example.com');
    for (const name of ['one', 'two', 'three']) {
      writeFileSync(path.join(dir, `${name}.txt`), `${name}\n`);
      git(dir, 'add', '.');
      git(dir, 'commit', '--quiet', '-m', name);
      if (name === 'two') git(dir, 'tag', 'before-plan');
    }
    return dir;
  }

  it('gives every commit the address of GitHub for the author and for the committer, moves the tag to the commit that was tagged, and changes no file', () => {
    const dir = history();
    const before = git(dir, 'rev-parse', 'HEAD~1');
    const said = run(rewrite, dir).trim().split('\n');
    expect(said.filter((line) => line.startsWith('Rewrite ')).length).toBeGreaterThan(0);
    expect(said.slice(-2)).toEqual([`Joshi-Alok <${NEW}> Joshi-Alok <${NEW}>`, 'before-plan']);
    expect(git(dir, 'log', '--format=%s', 'main')).toBe('three\ntwo\none');
    expect(git(dir, 'log', '-1', '--format=%s', 'before-plan')).toBe('two');
    expect(git(dir, 'rev-parse', 'before-plan')).not.toBe(before);
    expect(git(dir, 'diff', 'backup-before-rewrite', '--stat')).toBe('');
    expect(git(dir, 'log', '--all', '--format=%ae')).toContain('someone.else@example.com');
  });

  it('then removes the old history, so that no object that a push could carry has the old address, and says so with one line', () => {
    const dir = history();
    run(rewrite, dir);
    const said = run(clean, dir).trim().split('\n');
    expect(said[0]).toMatch(/^Deleted branch backup-before-rewrite/);
    expect(said.at(-1)).toBe(`${NEW} ${NEW}`);
    expect(git(dir, 'for-each-ref', '--format=%(refname)', 'refs/original')).toBe('');
    expect(git(dir, 'branch', '--list', 'backup-before-rewrite')).toBe('');
    expect(git(dir, 'log', '--all', '--format=%ae')).not.toContain('someone.else');
    expect(git(dir, 'count-objects', '-v')).toContain('garbage: 0');
  });

  it('runs where it is told and nowhere else: it never names a path, a remote or a push', () => {
    for (const line of [...rewrite.lines, ...clean.lines]) {
      expect(line).not.toMatch(/\bgit (?:push|remote|clone|fetch)\b/);
      expect(line).not.toMatch(/(?:^|\s)\/|\.\.\//);
    }
  });
});

```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts`
Expected: FAIL — `no such file or directory` and `runbook.md`

- [ ] **Step 3: Write the runbook**

**Create `docs/runbook.md`:**
````markdown
# Runbook: putting Agentic Media House on the air

This is the list of operations that turn the repository into a running publication: a GitHub repository, a Cloudflare bucket and site, secrets, the first trials with a real model, a week of dry runs, and the day the Desk is let go. It is for the owner, or for an agent that works with the owner's go-ahead. Each step has the exact commands and what you should see. If you do not see it, stop: the step says what it means, or nothing does and you should find out before you go on.

## How to read it

- **Run every command from the root of the repository**, in `bash` or `zsh`.
- A step marked **outward** changes something outside this machine: GitHub, Cloudflare, the Anthropic API, or money. An agent does not run an outward step without the owner's go-ahead for that step, and says what it is about to do first. A step with no mark only reads or changes this checkout.
- **A secret is never typed on a command line**, never written in a file of the repository, and never printed. Command lines are kept in shell histories and in process lists. Secrets live in files under `~/.config/agentic-media-house/` that only you can read (mode 600), and a command reads them from the file: `gh secret set NAME < file`, or `NAME="$(cat file)" command`. Step 9 makes the files.
- **The names used here.** The repository is `joshi-alok/agentic-media-house` (public). The site is `https://agentic-media-house.joshi-alok.workers.dev`, a Worker named `agentic-media-house`. The bucket is `agentic-media-house-evidence`. Change them in this file and in the files that name them if you choose others.
- **Money.** The live model budget for the trials is US$10 in total. Every command that calls the model says how many calls it may make, and every run reports its tokens: write down what each one cost. Set a monthly spending limit on the key in the Anthropic Console before step 17, and rotate the key when the trials are over (step 33): it was pasted into a conversation.
- **Nothing here is proved by the tests.** The tests of the repository read the workflows and the settings as data and run the Desk against made-up pages and a made-up bucket. The first time that any of it meets GitHub, Cloudflare or a real model is in this runbook, so the results of the steps are what the project learns, and they are recorded (see the go-live checklist at the end of the plan).

## Part 1. Before anything goes outward

### 1. Check the repository

Everything must pass on this machine before it is pushed anywhere. The last command looks for anything shaped like a key in what git tracks; the patterns are written with brackets so that this file does not match them.

```bash
npm ci
npm run verify
git status --porcelain
git grep -nI -E 'sk-a[n]t-|A[K]IA[0-9A-Z]{16}|gh[p]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY'
```

**Expect:** `npm run verify` ends with the lines `desk demo: ok: completed as published (dry run, scripted model and verifier)`, `Passed: 18 checks.`, `Passed: 17 checks.`, and `All scores are 95 or more.` after the Lighthouse table. `git status --porcelain` prints nothing. `git grep` prints nothing (and exits 1, which here means that it found nothing).

### 2. Rewrite the author and committer of every commit (once)

Every commit is by the address that `git config user.email` prints, and a public repository would show it. Before the first push the author and the committer of every commit are changed to the address that GitHub keeps for the account, `185603530+joshi-alok@users.noreply.github.com`. The content and the order of the history do not change, only the hashes; the tags are moved to the new commits. This cannot be undone once the history is pushed, so look at the result first, and keep the old history until you have.

```bash
git branch backup-before-rewrite
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
export GIT_AUTHOR_NAME="Joshi-Alok"
export GIT_AUTHOR_EMAIL="185603530+joshi-alok@users.noreply.github.com"
export GIT_COMMITTER_NAME="Joshi-Alok"
export GIT_COMMITTER_EMAIL="185603530+joshi-alok@users.noreply.github.com"
' --tag-name-filter cat -- --branches --tags
git log --format='%an <%ae> %cn <%ce>' | sort -u
git tag
git diff backup-before-rewrite --stat | tail -1
```

**Expect:** `git filter-branch` prints a `Rewrite` line for each commit, and `Ref '...' was rewritten` for each branch and each tag. Then `git log` prints one line, `Joshi-Alok <185603530+joshi-alok@users.noreply.github.com> Joshi-Alok <185603530+joshi-alok@users.noreply.github.com>`. `git tag` still lists `before-plan1-build` and `before-plan2-build`. `git diff backup-before-rewrite --stat` prints nothing: the files are exactly what they were.

When you are satisfied, remove the backups, so that the old address is in no object that a push could carry:

```bash
git branch -D backup-before-rewrite
git for-each-ref --format='%(refname)' refs/original | xargs -r -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --quiet
git log --all --format='%ae %ce' | sort -u
```

**Expect:** the first command says `Deleted branch backup-before-rewrite`, and the last prints one line, `185603530+joshi-alok@users.noreply.github.com 185603530+joshi-alok@users.noreply.github.com`.

## Part 2. GitHub and Cloudflare, before the first push

The first push starts two workflows (CI and the deploy). The deploy needs its secrets, so the repository, the bucket, the tokens and the secrets are made first, and the push comes in Part 3.

### 3. Create the empty repository on GitHub (outward)

The checkout may already have a remote called `origin` that points at the address of the repository that does not exist yet. Look, and remove it, so that nothing is pushed by mistake.

```bash
gh auth status
git remote -v
git remote remove origin
gh repo create joshi-alok/agentic-media-house --public --description "A robotics news site whose every factual sentence traces to a primary source. The pipeline that writes it is in this repository."
gh repo view joshi-alok/agentic-media-house --json visibility,isEmpty --jq '.visibility + " " + (.isEmpty | tostring)'
git remote add origin https://github.com/joshi-alok/agentic-media-house.git
```

**Expect:** `gh auth status` says that you are logged in to github.com. The `git remote remove` may say that there is no such remote, and that is fine. `gh repo create` prints the address of the new repository. `gh repo view` prints `PUBLIC true`: public, and empty.

### 4. Let the workflows push and open pull requests (outward)

The daily workflow pushes to `main` and opens the draft pull request of a held piece with the token that GitHub gives each run. A new repository gives that token read access only, and does not let it open pull requests. This sets what the workflows need, and nothing more. (Do not add a branch protection rule to `main` that forbids the pushes of a workflow: the Desk's commits would be refused.)

```bash
gh api -X PUT repos/joshi-alok/agentic-media-house/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true
gh api repos/joshi-alok/agentic-media-house/actions/permissions/workflow
```

**Expect:** the first command prints nothing. The second prints `{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}`.

### 5. Log in to Cloudflare with wrangler (outward)

`wrangler` is in `node_modules`, at the version that the repository pins. Its login opens a browser window, asks you to allow it, and keeps a token for your own use on this machine (not in the repository). It is used for the bucket in the next steps; the workflow uses a token of its own (step 8).

```bash
npx wrangler login
npx wrangler whoami
```

**Expect:** `wrangler whoami` says that you are logged in with your personal account, and prints the name and the **account id** of the account (32 hexadecimal digits). Write the account id down; it goes in a file in step 9, and in no file of the repository. If it lists more than one account, use the personal one, not the company one.

### 6. Create the private bucket (outward)

A bucket of Cloudflare R2 is private unless you add public access, and nothing here does: no `r2.dev` address, no custom domain. The bucket keeps the pages that the Desk quotes from, under their hash. The objects under `pending/` (every page that a run fetches) are deleted 90 days after they were written; the objects under `published/` (the pages that a published piece cites) are kept for good, so there is no rule for them.

```bash
npx wrangler r2 bucket create agentic-media-house-evidence
npx wrangler r2 bucket lifecycle add agentic-media-house-evidence pending-90-days pending/ --expire-days 90
npx wrangler r2 bucket lifecycle list agentic-media-house-evidence
npx wrangler r2 bucket dev-url get agentic-media-house-evidence
npx wrangler r2 bucket domain list agentic-media-house-evidence
```

**Expect:** the first command says that the bucket was created. `lifecycle list` shows one rule, `pending-90-days`, for the prefix `pending/`, that expires objects after 90 days, and no rule for any other prefix. `dev-url get` says that public access through `r2.dev` is disabled. `domain list` shows no custom domain. If either of the last two says otherwise, the bucket is public: turn it off (`npx wrangler r2 bucket dev-url disable agentic-media-house-evidence`) before anything is put in it.

### 7. Make the access key of the bucket (in the dashboard)

This is done in the dashboard, because the S3 keys of R2 are made there. Go to `dash.cloudflare.com`, then R2, then **Manage R2 API Tokens**, then **Create API token**. Give it the permission **Object Read & Write**, and limit it to **the bucket `agentic-media-house-evidence`** only (not all buckets); it needs no more, because the Desk only reads, writes and checks for objects, and never lists or deletes. When the token is made the page shows three values once: the **Access Key ID**, the **Secret Access Key** and the endpoint, `https://<account id>.r2.cloudflarestorage.com`. Keep the page open until step 9 is done.

**Expect:** the page shows the three values. The Secret Access Key is shown only once; if it is lost, make another token and delete the first.

### 8. Make the token that deploys (in the dashboard)

Also in the dashboard: **My Profile**, then **API Tokens**, then **Create Token**, then the template **Edit Cloudflare Workers**. Limit it to your account (**Account Resources: Include, your account**). It deploys a Worker, and it cannot touch the bucket. When it is made the page shows the token once.

**Expect:** the page shows the token. Step 9 checks it, without printing it.

### 9. Keep the secrets in files that only you can read

Make the folder, and open each file in an editor, so that no value is typed on a command line or kept in the history of the shell. The first file already exists if the Anthropic key was saved (see the Anthropic Console: **API keys**, then create a key; save it as `anthropic.key`, with the key and nothing else on its line). The values in angle brackets are the ones that the dashboard showed.

```bash
mkdir -p ~/.config/agentic-media-house
chmod 700 ~/.config/agentic-media-house
touch ~/.config/agentic-media-house/r2.env ~/.config/agentic-media-house/cloudflare.env
chmod 600 ~/.config/agentic-media-house/*
${EDITOR:-nano} ~/.config/agentic-media-house/r2.env
${EDITOR:-nano} ~/.config/agentic-media-house/cloudflare.env
ls -l ~/.config/agentic-media-house
```

The file `r2.env` has four lines, with no quotes and no spaces round the equals signs:

```text
R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
R2_BUCKET=agentic-media-house-evidence
R2_ACCESS_KEY_ID=<the Access Key ID of step 7>
R2_SECRET_ACCESS_KEY=<the Secret Access Key of step 7>
```

The file `cloudflare.env` has two:

```text
CLOUDFLARE_API_TOKEN=<the token of step 8>
CLOUDFLARE_ACCOUNT_ID=<the account id of step 5>
```

**Expect:** `ls -l` shows `anthropic.key`, `cloudflare.env` and `r2.env`, each with the permissions `-rw-------`, and the folder itself `drwx------`. Then check the token of step 8 without printing it; the program reads it from the file and prints only what Cloudflare says about it:

```bash
( set -a; . ~/.config/agentic-media-house/cloudflare.env; set +a; npx wrangler whoami )
```

**Expect:** it says that you are logged in with an API token, and names the account.

### 10. Set the secrets of the repository (outward)

`gh secret set` reads the value from the file and sends it to GitHub encrypted. `--env-file` sets every name in a file, so no value is on the command line. The Anthropic key is set only when the owner says so: it is what lets the workflow spend money.

```bash
gh secret set ANTHROPIC_API_KEY --repo joshi-alok/agentic-media-house < ~/.config/agentic-media-house/anthropic.key
gh secret set --repo joshi-alok/agentic-media-house --env-file ~/.config/agentic-media-house/r2.env
gh secret set --repo joshi-alok/agentic-media-house --env-file ~/.config/agentic-media-house/cloudflare.env
gh secret list --repo joshi-alok/agentic-media-house
```

**Expect:** each `gh secret set` prints a line that says that the secret was set (`Set Actions secret ... for joshi-alok/agentic-media-house`). `gh secret list` lists exactly seven names, and no values: `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_BUCKET`, `R2_ENDPOINT` and `R2_SECRET_ACCESS_KEY`.

### 11. Check the versions of the actions

The three workflows use `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` by their major version, and the plan could not check that these are the current ones (it had no network). Check.

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
gh api repos/actions/setup-node/releases/latest --jq .tag_name
gh api repos/actions/upload-artifact/releases/latest --jq .tag_name
grep -rhn 'uses: actions/' .github/workflows | sort -u
```

**Expect:** each of the first three prints a tag such as `v7.0.1`, whose major (`v7`) is the one that the workflows use (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`). If a major is higher, change it in all the workflow files that use that action, and in the tests that name it (`desk/test/workflows/desk-workflow.test.ts` and `desk/test/workflows/workflows.test.ts`), run `npm test --workspace @robywire/desk`, and commit the change as `chore: use the current major version of <action>` before step 12.

## Part 3. The first push

### 12. Push, and watch CI and the deploy (outward)

Push at a time that is not 04:30, 06:30 or 08:30 UTC, so that the daily workflow, which is on the schedule from the moment its file is on `main`, is paused (step 13) before it can start.

```bash
git push -u origin main
git push origin --tags
gh run list --repo joshi-alok/agentic-media-house --limit 5
gh run watch --repo joshi-alok/agentic-media-house --exit-status
```

**Expect:** `gh run list` shows two runs of the push, **CI** and **Deploy**. `gh run watch` asks which to watch; watch both, one after the other. Both end with a green check. CI runs every step of `npm run verify`, with Lighthouse; Deploy builds with `SITE_URL` (the address of the Worker, since no repository variable is set), audits the build and runs `wrangler deploy`. If Deploy fails at its last step, read the error: `Authentication error` means the token of step 8 is wrong or is not limited to this account; a missing `CLOUDFLARE_ACCOUNT_ID` means step 10 did not set it. After fixing, start it again with `gh workflow run deploy.yml --ref main`. If CI fails in Lighthouse only, a score is a point or two lower on the runner; read the log with `gh run view --log-failed`.

### 13. Pause the daily workflow (outward)

The Desk must not run on its own until the shadow week is over and the owner has gone live (Part 6).

```bash
gh workflow disable desk.yml --repo joshi-alok/agentic-media-house
gh workflow list --all --repo joshi-alok/agentic-media-house
```

**Expect:** the first command says that it disabled `Desk`. `gh workflow list --all` shows `Desk` as `disabled_manually`, and `CI` and `Deploy` as `active`.

### 14. Look at the site

```bash
curl -sI https://agentic-media-house.joshi-alok.workers.dev/ | head -n 1
curl -s https://agentic-media-house.joshi-alok.workers.dev/robots.txt
curl -sI https://agentic-media-house.joshi-alok.workers.dev/no-such-page/ | head -n 1
curl -s https://agentic-media-house.joshi-alok.workers.dev/method/ | grep -c 'Agentic Media House'
```

**Expect:** the first prints a status line with `200`. The second prints the `robots.txt` of the site, with the address of its sitemap on the host above. The third prints a status line with `404`: the site answers an address that is not there with its own 404 page. The last prints a number above 0. Open the site in a browser and read the home page and the method page: **the copy still says that the pipeline is not running**, because the `LIVE` flags are all false until Part 6, and that is correct.

### 15. Redo the first deploy by hand (outward)

The first deploy was made by hand, before there was a workflow, from a folder outside the workspace: `wrangler deploy --assets site/dist --name agentic-media-house`. The workflow of step 12 replaced that; this is how to do it by hand again (a deploy while GitHub is down, or from a branch). It needs the token of step 8 in the environment, and the production build.

```bash
SITE_URL=https://agentic-media-house.joshi-alok.workers.dev npm run build
npm run audit:prod
REPO="$(pwd)"
( set -a; . ~/.config/agentic-media-house/cloudflare.env; set +a; cd "$(mktemp -d)" && "$REPO/node_modules/.bin/wrangler" deploy --assets "$REPO/site/dist" --name agentic-media-house )
```

**Expect:** `npm run build` ends with `14 page(s) built`, the audit with `Passed: 18 checks.`, and `wrangler deploy` with the address of the Worker and a version id. The last command is run from an empty folder because `wrangler deploy` refuses to run at the root of an npm workspace **with no settings file**; with the committed `wrangler.jsonc` it runs at the root, and that is what the workflow does (`npx wrangler deploy`). The same command with `--dry-run` shows what would be uploaded without uploading it.

## Part 4. The first contact with a real model

### 16. Choose the pages

`desk tune` takes a list of addresses of real pages and tells what each step of the pipeline found. Choose **three to five** pages of hosts that `sources.yml` lists (a company's own announcement is the best, because it is a primary source; one article of an outlet that the registry lists as a feed, to see a tier-2 page). Use pages that are public and that `robots.txt` allows: the command says if one is not allowed, and does not fetch it. A line that is not an address is refused with its number. The file is in `runs/`, which git ignores.

```bash
mkdir -p runs
${EDITOR:-nano} runs/tune-urls.txt
grep -c '^https' runs/tune-urls.txt
```

The file has one address to a line, and a `#` starts a comment (a note about why the page was chosen is welcome):

```text
# a company's announcement of a product
https://<host in sources.yml>/<path of one page>
```

**Expect:** `grep -c` prints the number of addresses, from 3 to 5.

### 17. Run the first trial (outward: it spends money)

Start with **one page, one trial, at most 10 calls**. A page goes through Extract (1 call), Compose (1 call) and Verify (1 call for the model check, and 2 more for each round of revision), so one trial is 3 to 7 calls. `--config desk.config.yml` gives the real user agent; the bucket is not used. The key is read from its file for this one command.

```bash
grep -m 1 '^https' runs/tune-urls.txt > runs/tune-first.txt
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run desk -- tune --urls runs/tune-first.txt --config desk.config.yml --max-calls 10
```

**Expect:** a line `tune: 1 address, 1 trial each, at most 10 model calls, client api`, the folder `runs/tune/<stamp>`, then the block of the page: its kind, the claims proposed, dropped (and by which rule), and kept, what the gate said of the draft, what the model check said, how Verify ended, and the tokens; then the total. Exit code 0, unless the 10 calls ran out, which exits 1 and says so. Write down the tokens: they tell what a page costs. Add the prices of the model to a settings file of your own (not the committed one) if you want dollars: `prices:` with `inputPerMillion` and `outputPerMillion`, read from the Anthropic price list.

### 18. Read the table, and judge the pages (outward: it spends money)

The command measures; **you judge**. For each page, open `runs/tune/<stamp>/evidence/` (the text of the page as the Desk read it) and `runs/tune/<stamp>/01/trial-1/04-extract.json`, `05-compose.json` and `06-verify.json`, and ask:

- **Claims proposed and dropped.** Were the claims that survived really in the page, and were the ones that were dropped dropped for a good reason? Many `quote-not-found` means that the model is paraphrasing instead of quoting; `value-normalised-mismatch` or `value-not-in-quote` means that it is getting numbers wrong; `label-too-long` or `label-not-in-quote` means that it is not following the shape of a label. Each is a thing to fix in the prompt. **The rules are never loosened to make more claims survive.**
- **The gate on the draft.** Which codes, and in which sentences? Codes of the check G4 (a claim that does not support a sentence) and G5 (analysis that goes beyond its claims) say what the composer needs to be told.
- **The model check.** Does the verifier clear the sentences that are really supported, and flag the ones that are not? Read three of each. A verifier that clears everything is as bad as one that flags everything.
- **The piece.** Would you publish it? Could a reader check every sentence against its quotation?

Then widen: all the pages, one trial (`--max-calls 40`), and last `--trials 3` on the two most interesting pages, to see how much the answers differ from one try to the next. Stay inside the US$10 of the plan, and write down the cost of every invocation. A page that says `too few claims` is a result, not a failure: a day with no story is a valid day.

```bash
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run desk -- tune --urls runs/tune-urls.txt --config desk.config.yml --max-calls 40
```

**Expect:** a block for each page, and the total; `total: N pages, N trials, M of 40 model calls, ...` with M not above 40. Report what you found to the owner: the table, your judgement of each page, and the cost.

### 19. Measure the verifier on the real model (outward: it spends money)

The labelled set of 60 sentences (20 supported, 20 unsupported, 20 distorted) goes to the real model in 6 calls, through the same prompt and the same reading of the reply that the pipeline uses.

```bash
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run evals:verifier -- --client api
```

**Expect:** `verifier evaluation: 60 sentences in 6 calls, model ...`, a table of the recall for each label, the precision and recall of what it cleared and of what it flagged, the accuracy and the tokens. Exit code 0 (no floor was asked for). Write the numbers down. What a floor should be is a decision, made in step 24 from these numbers and not before.

### 20. Change the prompts, if the trials say so

What the models are told is in `desk/src/prompts/`. A change to it is an ordinary task of the plan: a test first (`desk/test/prompts/`), the change, the whole check, a commit that says what the trial showed. The trials of step 18 are run again after it, with the same list, and the numbers are compared. The extract rules (`desk/src/stages/claim-grounding.ts`) and the checks of the gate are **not** changed to make a model look better.

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
```

**Expect:** `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

## Part 5. The shadow week

### 21. Run the Desk every day for five days, without publishing (outward: it spends money)

A dry run does everything that a real run does, with the real sources, the real model and the real bucket, and writes nothing to `site/` and nothing to git. With the bucket as the evidence store it **does put its pages in `pending/` of the bucket** (so that it can be replayed; the 90-day rule deletes them). Run it once a day, at about the time the schedule will use (04:30 UTC), for five days. The bucket variables come from the file, for this one command; the key too. A second run on the same day is refused, because the first left its record (add `--force-new` to run the day again, which keeps the first run beside the second).

```bash
( set -a; . ~/.config/agentic-media-house/r2.env; set +a; ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run desk -- run --dry --client api --sources live --config desk.config.yml )
```

**Expect:** the lines of the stages, then `outcome: published`, `outcome: held` or `outcome: no-story` (or `outcome: failed`, with `stage:` and `reason:`), the run id, the folder `runs/<date>`, the piece, and `dry run: nothing was written to the site or to git`. A day with no story is a good outcome. The first day is also the first time that the Desk meets the bucket: a failure of the store ends the run as `failed` at the stage `fetch`, `evidence` or `publish` with the answer of the bucket in the reason:

| What the reason says | What it means |
|---|---|
| `the evidence store answered PUT pending/... with 403` | the access key is wrong, or is limited to another bucket: make the token of step 7 again |
| `the evidence store answered ... with 404` | the bucket name or the endpoint is wrong: check `r2.env` against step 6 |
| `the evidence store could not be reached` | the endpoint cannot be reached, or does not answer in 20 seconds: check the account id in the endpoint |
| `the evidence ... is not the text that was fetched` | the bucket gave back another text than the one put in it: stop, and do not go on; it is the one failure that should never happen |
| `the setting evidence.kind is r2, which needs R2_...` | the file `r2.env` was not read, or lacks a name: the message names the missing ones |

If R2 refuses what the Desk sends (it has only been tried against a stand-in that checks every signature), the Desk fails closed: the run is `failed`, and nothing is published. Report the exact message to the owner; do not change the signing code to match a guess.

### 22. Record each day

Copy this table into a file that is not in the repository (`runs/shadow-week.md`), and fill a row each day. All the numbers are in the folder of the run: `runs/<date>/run.json` (the outcome, the stage, the reason, `budget.spent`), `runs/<date>/06-verify.json` (the gate and the model check of each round) and `runs/<date>/05-compose.json` (every draft).

```text
| Day | Outcome | Stage | Reason (if not published) | Claims kept | Rounds | Gate codes | Model check failures | Tokens in / out | Cost | Would you publish it? Why not? |
|---|---|---|---|---|---|---|---|---|---|---|
```

**Expect:** five rows at the end of the week. Look for patterns: what fails most, which sources give no claims, which claims the verifier doubts. A piece that was `published` in a dry run and that you would not publish is the most important row: say why, and fix what let it through (a test first, and never a loosened rule).

### 23. Replay a day

A run can be run again from what it kept, with no model and no network for the model's part: the replies are recorded in `runs/<date>/cassettes/` and the pages are read from the bucket. The result says whether each artifact is the same.

```bash
( set -a; . ~/.config/agentic-media-house/r2.env; set +a; npm run desk -- replay runs/<date> --config desk.config.yml )
```

**Expect:** `replay: equal`, and a line for each artifact. If the pages were put more than 90 days ago, the replay stops with a `missing` snapshot: that is the rule, not a fault.

## Part 6. Going live

Go live only when: the first trials were read and judged (steps 17 and 18), the verifier was measured (step 19), the five days of the shadow week are recorded (step 22) and the owner is content with what they show, and a real run has written to the bucket and been replayed (steps 21 and 23).

### 24. Freeze the floor of the verifier (outward: it spends money)

Put the numbers of step 19 in a decision: the lowest precision and recall that the verifier may have. A floor is a flag of the command, and a script in `package.json` that holds it (a test of the repository then fails if a later change to the prompt makes the verifier worse). The floors are the owner's choice, written as a commit that says the numbers they come from.

```bash
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run evals:verifier -- --client api --min-precision 0.9 --min-recall 0.8
```

**Expect:** exit code 0 and no line that begins `below the floor:` for the floors that the owner chose (0.9 and 0.8 are an example, not the decision). A line `below the floor:` says which score is under; the floors are then too high, or the verifier is not good enough to go live.

### 25. Turn on the flags of what has been run and measured (a change of its own)

`site/src/lib/live.ts` says which parts of the Desk really run, and every sentence of the site whose tense depends on it is written from it. The flags are turned on one by one, **each when the thing is really running**, in a change of its own, after the sentences that change have been read again. Two are true by now: `evidenceStore` (the bucket has been written to and read back by real runs and a replay: steps 21 and 23) and `verifier` (the model check has been measured on a real model: step 19). The other two, `publishing` and `scheduler`, wait for step 28.

```bash
${EDITOR:-nano} site/src/lib/live.ts
npm test --workspace @robywire/site
```

**Expect:** the tests of the site fail, and each failure names a function of `site/src/lib/copy.ts` and the sentence that it now writes. Read every sentence as a reader would, and as the owner would sign it. Change the tests that name them (`site/test/copy.test.ts`, and `site/test/method.test.ts` for the tense of the pipeline stages) so that they say what the copy should say, run `npm run verify`, and commit as `feat(site): the site says that <the part> runs`. When it is pushed the Deploy workflow puts it on the air (step 12 shows how to watch).

### 26. Enable the schedule, and make the first real run (outward: it publishes)

```bash
gh workflow enable desk.yml --repo joshi-alok/agentic-media-house
gh workflow run desk.yml --repo joshi-alok/agentic-media-house --ref main
gh run list --workflow desk.yml --repo joshi-alok/agentic-media-house --limit 1
gh run watch --repo joshi-alok/agentic-media-house --exit-status
```

**Expect:** the run ends green, and its log says `outcome: published`, `outcome: held` or `outcome: no-story` (a day that is already done says `outcome: refused-already-done`). If it published, `git pull` brings the commit of the Desk (the piece, its ledger, the desk state), and the Deploy workflow, which the Desk started, builds and deploys it. If it held, there is a draft pull request from the branch `hold/<day>-<slug>`: read it, and mark it ready and merge it to publish, or close it to discard. The snapshots that the piece cites are in `published/` of the bucket.

### 27. Check what the first run left

```bash
git pull
npm run desk -- status
gh run list --workflow deploy.yml --repo joshi-alok/agentic-media-house --limit 3
RUN="$(gh run list --workflow desk.yml --repo joshi-alok/agentic-media-house --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run download "$RUN" --repo joshi-alok/agentic-media-house --name desk-runs --dir runs-from-github
find runs-from-github -type f | sort
```

**Expect:** `status` names the last run, its day and its try. The deploy list shows a run that began after the Desk's push. The artifact has the files of the run (`run.json`, the numbered artifacts, `cassettes/`) and nothing of `evidence/` or `tune/`; open one and check by eye that it holds quotations and not whole pages. Delete the folder `runs-from-github` afterwards. From now on the schedule runs by itself at 04:30, 06:30 and 08:30 UTC, and a failed day makes the job red, so that GitHub tells the owner.

## Part 7. Later, and when something is wrong

### 28. Turn on the last two flags (a change of its own)

The same as step 25, for the two parts that a reader can see only after they have happened: `publishing` (after a run has really published a piece, or a held piece has been released: a day with no story is not enough, so start the run again by hand on another day with `gh workflow run desk.yml --repo joshi-alok/agentic-media-house --ref main` until there is a piece) and `scheduler` (once the schedule of step 26 has started a run by itself, which `gh run list --workflow desk.yml --repo joshi-alok/agentic-media-house --limit 5` shows as an event of `schedule`).

```bash
${EDITOR:-nano} site/src/lib/live.ts
npm test --workspace @robywire/site
npm run verify
```

**Expect:** as in step 25, the tests of the site name every sentence that changes, you read each one and change the tests that name it, and `npm run verify` passes before you commit as `feat(site): the site says that the Desk publishes every day`. Now the home page, the footer and the method page say, in the present tense, what is true.

### 29. Add a domain of your own (outward, optional, later)

When the owner has a domain in Cloudflare, the Worker can serve it: in the dashboard, **Workers & Pages**, the Worker `agentic-media-house`, **Settings**, **Domains & Routes**, **Add**, **Custom domain**. Two things in the repository then change, in one commit: the default of `SITE_URL` in `.github/workflows/deploy.yml` (the repository variable below is read first, so the default only matters when the variable is not set), and the address in the `userAgent` of `desk.config.yml` (the /method page of the new site, which the Desk tells every site that it fetches from). `desk/test/workflows/deploy-workflow.test.ts` fails if the host of the user agent and the host of the default `SITE_URL` differ, and tells you which to change.

```bash
gh variable set SITE_URL --repo joshi-alok/agentic-media-house --body "https://<the domain>"
gh workflow run deploy.yml --repo joshi-alok/agentic-media-house --ref main
```

**Expect:** the Deploy run is green, and `curl -s https://<the domain>/robots.txt` names the new address in its `Sitemap:` line.

### 30. Take a piece down, or correct it (outward)

A piece is never deleted: it is corrected or retracted, in public, and its receipts stay. This writes the entry in the desk state, sets `updatedAt` of the piece to today, and commits both.

```bash
npm run desk -- retract <slug> --reason "<one line, at most 500 characters, that says what was wrong>" --kind retraction
git push
```

**Expect:** the command prints `kind: retraction`, `recorded: <time>` and `commit: <hash>`, and exits 0. The push starts the Deploy workflow; the page then shows its notice (see `/corrections/`). Use `--kind correction`, the default, for a mistake that does not undo the piece. `--dry` shows what would be done.

### 31. Stop the daily run (outward)

```bash
gh workflow disable desk.yml --repo joshi-alok/agentic-media-house
gh run list --workflow desk.yml --repo joshi-alok/agentic-media-house --limit 3
```

**Expect:** `Desk` is disabled, and no new run starts at the next hour of the schedule. A run that has already started is not cancelled by this: let it end, or cancel it (`gh run cancel <id>`), and look at what it left. `gh workflow enable desk.yml` starts the schedule again.

### 32. Put the previous site back (outward)

If a deploy put a bad site on the air, the quickest remedy is to go back to the version before it, and then to fix the cause in the repository.

```bash
npx wrangler versions list
npx wrangler rollback <version id>
```

**Expect:** `versions list` shows the ten latest versions of the Worker with their ids and dates; `rollback` asks for a message and says that the Worker is back at that version. These need the login of step 5 (or the token of `cloudflare.env`, read into the environment as in step 9). Then revert the change in git (`git revert <commit>` and push): the next deploy otherwise puts the bad version back.

### 33. Rotate the key of the model (outward: it spends money)

Do this when the trials are over (the key was pasted into a conversation), whenever it may have been seen, and from time to time. Make the new key in the Anthropic Console, save it in `~/.config/agentic-media-house/anthropic.key` (the new key and nothing else), set it, check it, and only then revoke the old one in the Console.

```bash
gh secret set ANTHROPIC_API_KEY --repo joshi-alok/agentic-media-house < ~/.config/agentic-media-house/anthropic.key
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run desk -- tune --urls runs/tune-first.txt --config desk.config.yml --max-calls 3
```

**Expect:** the secret is set, and the tuning run (at most 3 calls) gets an answer from the model, with the new key. Then revoke the old key in the Console. A run of the workflow before then would still work, and after it would fail with an error of authentication.

### 34. Rotate the token that deploys and the key of the bucket (outward)

For the token of Cloudflare: in the dashboard, **My Profile**, **API Tokens**, the token, **Roll**; put the new value in `cloudflare.env`, set it, and start a deploy. For the key of the bucket: make a **new** R2 API token as in step 7, put its two values in `r2.env`, set them, run a dry run of the Desk (step 21) to see that it works, and only then delete the old token in the dashboard.

```bash
gh secret set --repo joshi-alok/agentic-media-house --env-file ~/.config/agentic-media-house/cloudflare.env
gh secret set --repo joshi-alok/agentic-media-house --env-file ~/.config/agentic-media-house/r2.env
gh workflow run deploy.yml --repo joshi-alok/agentic-media-house --ref main
```

**Expect:** both secret commands say that the secrets were set, and the Deploy run is green. Do not delete the old R2 token before a dry run has put and read a page with the new one.

## What lives where

| What | Where | Who can read it |
|---|---|---|
| The key of the model | the secret `ANTHROPIC_API_KEY` of the repository, and `~/.config/agentic-media-house/anthropic.key` | GitHub's runs (the one step that runs the Desk), and you |
| The address, the name and the keys of the bucket | the four secrets `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, and `~/.config/agentic-media-house/r2.env` | GitHub's runs (the one step that runs the Desk), and you |
| The token and the account of Cloudflare | the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and `~/.config/agentic-media-house/cloudflare.env` | GitHub's runs (the one step that deploys), and you |
| The settings of the daily run | `desk.config.yml` (committed, public, no secret) | everyone |
| The settings of the Worker | `wrangler.jsonc` (committed, public, no account and no token) | everyone |
| The address of the site for the build | the repository variable `SITE_URL`, or its default in `.github/workflows/deploy.yml` | everyone |
| What a run leaves | `runs/<date>/` on the machine, and the artifact `desk-runs` of the run for 14 days (hashes, quotations, drafts, the record; never the text of a page) | the machine; for the artifact, anyone, because the repository is public |
| The pages that the Desk read | the bucket: `pending/<hash>` for 90 days, `published/<hash>` for good | the holders of the bucket key, and you |
| The trials | `runs/tune/<stamp>/` on the machine, never committed, never uploaded | you |
````

- [ ] **Step 4: Run the test and confirm that it passes**

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' docs/runbook.md desk/test/runbook.test.ts`
Expected: PASS — prints nothing

- [ ] **Step 5: Show that the test can fail**

The runbook is the one file of the repository whose job is to hold commands that handle secrets, so the test of it must be seen to refuse the two mistakes that matter: a key in the text, and a secret on a command line. The first edit adds a line that is shaped like an Anthropic key (made from pieces, so that this plan does not hold one).

Run: `node -e "const fs=require('fs');const f='docs/runbook.md';fs.writeFileSync(f,fs.readFileSync(f,'utf8')+'\nkey: '+['sk','-ant-','api03-x'].join('')+'\n')"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts`
Expected: FAIL — `has nothing in it shaped like a key`

The second edit puts a value on the command line of `gh secret set`.

Run: `node -e "const fs=require('fs');const f='docs/runbook.md';const t=fs.readFileSync(f,'utf8');const line='gh secret set --repo joshi-alok/agentic-media-house --env-file ~/.config/agentic-media-house/r2.env\n';if(!t.includes(line))throw new Error('not found');fs.writeFileSync(f,t.replace(line,'gh secret set R2_BUCKET --body some-value --repo joshi-alok/agentic-media-house\n'))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts`
Expected: FAIL — `puts no secret on a command line`

Put both back.

Run: `node -e "const fs=require('fs');const f='docs/runbook.md';const t=fs.readFileSync(f,'utf8');const bad='gh secret set R2_BUCKET --body some-value --repo joshi-alok/agentic-media-house\n';if(!t.includes(bad))throw new Error('not found');const good=t.replace(bad,'gh secret set --repo joshi-alok/agentic-media-house --env-file ~/.config/agentic-media-house/r2.env\n');fs.writeFileSync(f,good.slice(0,good.lastIndexOf('\nkey: ')))"`
Expected: PASS — prints nothing

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

- [ ] **Step 6: Check that the programs that the runbook calls have the commands and the options that it uses**

The test cannot call `wrangler` or `gh`, and a runbook that says a command that does not exist is worse than none. Both programs print their own help with no network and no login. The first block asks the installed `wrangler` (the version that the repository pins) for the help of each of its commands that the runbook uses, and the second asks `gh` for the options. If `gh` is not installed, install it before the runbook: it is what the runbook uses for everything on GitHub.

Run:
```bash
export WRANGLER_SEND_METRICS=false CI=true
status=0
for command in "login" "whoami" "deploy" "rollback" "versions list" "r2 bucket create" "r2 bucket lifecycle add" "r2 bucket lifecycle list" "r2 bucket dev-url get" "r2 bucket dev-url disable" "r2 bucket domain list"; do
  if npx wrangler $command --help > /dev/null 2>&1; then echo "ok: wrangler $command"; else echo "MISSING: wrangler $command"; status=1; fi
done
for option in --expire-days; do
  if npx wrangler r2 bucket lifecycle add --help 2>&1 | grep -q -- "$option"; then echo "ok: wrangler r2 bucket lifecycle add $option"; else echo "MISSING: $option"; status=1; fi
done
for option in --assets --name --dry-run; do
  if npx wrangler deploy --help 2>&1 | grep -q -- "$option"; then echo "ok: wrangler deploy $option"; else echo "MISSING: $option"; status=1; fi
done
exit $status
```
Expected: PASS — `ok: wrangler r2 bucket lifecycle add` and `ok: wrangler rollback` and `ok: wrangler deploy --assets` and `ok: wrangler deploy --dry-run`

Run:
```bash
command -v gh > /dev/null || { echo 'gh is not installed'; exit 1; }
status=0
check() {
  local command="$1"
  shift
  for option in "$@"; do
    if gh $command --help 2>&1 | grep -qE -- "(^|[ ,])$option( |,|$)"; then echo "ok: gh $command $option"; else echo "MISSING: gh $command $option"; status=1; fi
  done
}
check "repo create" --public --description
check "repo view" --json
check "secret set" --repo --env-file
check "secret list" --repo
check "workflow run" --ref --repo
check "workflow enable" --repo
check "workflow disable" --repo
check "workflow list" --all
check "run list" --workflow --limit --json
check "run watch" --exit-status --repo
check "run download" --name --dir
check "variable set" --body --repo
check "api" -X -f -F
exit $status
```
Expected: PASS — `ok: gh repo create --public` and `ok: gh secret set --env-file` and `ok: gh workflow list --all` and `ok: gh run download --dir`

- [ ] **Step 7: Say it in the README, and keep it true**

The tests first.

**In `desk/test/readme.test.ts`, replace:**
```ts
    expect(section('The desk workspace')).toContain('`desk tune`, the command that measures them, is built and tested with scripted models and has never been run against a real one');
  });
});

```

**with:**
```ts
    expect(section('The desk workspace')).toContain('`desk tune`, the command that measures them, is built and tested with scripted models and has never been run against a real one');
  });
});

describe('the README: the runbook', () => {
  const runbook = (): string => section('The runbook');

  it('is in the layout, and says what it is and its seven parts', () => {
    expect(section('Repository layout')).toContain('the runbook (`docs/runbook.md`): the operations that put the publication on the air');
    expect(runbook()).toContain('`docs/runbook.md` is the list of operations that put the publication on the air, in seven parts');
    expect(runbook()).toContain('rewrite the author and committer of every commit to the no-reply address of GitHub');
    expect(runbook()).toContain('going live (freezing the floor of the verifier, turning on the flags of `site/src/lib/live.ts` in a change of its own, enabling the schedule)');
  });

  it('says that an outward step is not run without the go-ahead of the owner, and that no secret is on a command line', () => {
    expect(runbook()).toContain('A step marked *outward* changes something outside the machine');
    expect(runbook()).toContain('is not run without the owner\'s go-ahead for that step');
    expect(runbook()).toContain('**No secret is on a command line.**');
    expect(runbook()).toContain('`gh secret set NAME < file`, `gh secret set --env-file file`, or `NAME="$(cat file)" command`');
  });

  it('says what the tests check of it, and what they cannot', () => {
    expect(runbook()).toContain('`desk/test/runbook.test.ts` fails when a step has no command or no expected result');
    expect(runbook()).toContain('so none can be run by a test');
  });

  it('no longer says that the runbook is yet to be written, where it is named', () => {
    expect(README).not.toContain('when it is written');
    expect(section('The daily workflow')).toContain('the first real run (docs/runbook.md) is the proof');
    expect(section('The tuning harness')).toContain('(docs/runbook.md, steps 16 to 20)');
  });
});

```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: FAIL — `the runbook`

Then the README: the new section, the row of `docs/` in the layout, and the two places that said that the runbook is yet to be written.

**In `README.md`, replace:**
```markdown
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
| `docs/` | Specs and plans. |

The workspace packages export their TypeScript source directly, so there is no build step for them.
```

**with:**
```markdown
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
| `docs/` | Specs and plans, and the runbook (`docs/runbook.md`): the operations that put the publication on the air, each with its commands and what to expect. |

The workspace packages export their TypeScript source directly, so there is no build step for them.
```

**In `README.md`, replace:**
```markdown
- **What is kept.** The files of `runs/` are kept as an artifact for 14 days, even when the run failed, except `runs/tune/`. Artifacts of a public repository can be read by anyone, so no page text goes there: the snapshots are in the bucket and `runs/` has none, `desk/test/workflows/uploaded-runs.test.ts` lists every kind of file that a run writes and fails for a new kind, and no string in any of them shares more than the length of a quotation (300 characters) with a page.
- **Failure.** The job fails when the run fails (exit code 1), so GitHub tells the owner.
- **What is not proved.** A workflow cannot be run anywhere but on GitHub. The tests read the file with a YAML parser and run its two small scripts in a made-up repository; the first real run (docs/runbook.md, when it is written) is the proof, and the versions of the actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) were not checked against GitHub, because nothing in the plan may use the network: the runbook says how to check them. The workflow assumes a repository where the token of a workflow may push to `main` (no branch protection that forbids it) and may open pull requests (a setting of the repository), which only the first real run can show.

## The deploy workflow
```

**with:**
```markdown
- **What is kept.** The files of `runs/` are kept as an artifact for 14 days, even when the run failed, except `runs/tune/`. Artifacts of a public repository can be read by anyone, so no page text goes there: the snapshots are in the bucket and `runs/` has none, `desk/test/workflows/uploaded-runs.test.ts` lists every kind of file that a run writes and fails for a new kind, and no string in any of them shares more than the length of a quotation (300 characters) with a page.
- **Failure.** The job fails when the run fails (exit code 1), so GitHub tells the owner.
- **What is not proved.** A workflow cannot be run anywhere but on GitHub. The tests read the file with a YAML parser and run its two small scripts in a made-up repository; the first real run (docs/runbook.md) is the proof, and the versions of the actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) were not checked against GitHub, because nothing in the plan may use the network: the runbook says how to check them. The workflow assumes a repository where the token of a workflow may push to `main` (no branch protection that forbids it) and may open pull requests (a setting of the repository), which only the first real run can show.

## The deploy workflow
```

**In `README.md`, replace:**
```markdown
- **The budget.** `--max-calls M` (1 to 200, 40 by default) is the most model calls that the whole invocation may make, counted where a call reaches the model, each retry included. When they are spent the invocation stops where it is, with the reason in the table and on the error output and exit code 1, and what was done is kept. Each trial is also held to the budget of the settings, as a run is (calls, tokens in, tokens out): a trial that spends more fails, and the next has the whole budget again.
- **What it writes.** Only below `runs/tune/<stamp>/`: `tune.json` (the table as data, checked against a schema and rewritten after every trial, so that a program that stops leaves what was done), the artifacts of each trial in `<page number>/trial-<n>/` (`04-extract.json`, `05-compose.json`, `06-verify.json`), and the text of the pages in `evidence/`. It never touches `site/`, the desk state or git, and it never uses the evidence store of the settings, so a page that is only being tried does not reach the bucket. The pages are third parties' text: the folder is not committed (git ignores `runs/`) and the daily workflow does not upload it.
- **What is not proved.** It has been run only against scripted models and made-up pages. How it behaves on real pages and a real model is what the first trials show (docs/runbook.md, when it is written).

## The verifier evals
```

**with:**
```markdown
- **The budget.** `--max-calls M` (1 to 200, 40 by default) is the most model calls that the whole invocation may make, counted where a call reaches the model, each retry included. When they are spent the invocation stops where it is, with the reason in the table and on the error output and exit code 1, and what was done is kept. Each trial is also held to the budget of the settings, as a run is (calls, tokens in, tokens out): a trial that spends more fails, and the next has the whole budget again.
- **What it writes.** Only below `runs/tune/<stamp>/`: `tune.json` (the table as data, checked against a schema and rewritten after every trial, so that a program that stops leaves what was done), the artifacts of each trial in `<page number>/trial-<n>/` (`04-extract.json`, `05-compose.json`, `06-verify.json`), and the text of the pages in `evidence/`. It never touches `site/`, the desk state or git, and it never uses the evidence store of the settings, so a page that is only being tried does not reach the bucket. The pages are third parties' text: the folder is not committed (git ignores `runs/`) and the daily workflow does not upload it.
- **What is not proved.** It has been run only against scripted models and made-up pages. How it behaves on real pages and a real model is what the first trials show (docs/runbook.md, steps 16 to 20).

## The runbook

`docs/runbook.md` is the list of operations that put the publication on the air, in seven parts: before anything goes outward (check the repository, rewrite the author and committer of every commit to the no-reply address of GitHub), GitHub and Cloudflare before the first push (the empty public repository, the permissions that the workflows need, the private bucket with its rule that deletes `pending/` after 90 days, the access key of the bucket, the token that deploys, the secrets), the first push (CI, the first deploy by the workflow, pausing the daily workflow, how to redo the first deploy by hand), the first contact with a real model (`desk tune`, the verifier evals, changing the prompts), the shadow week (a dry run each day, what to record, replaying a day), going live (freezing the floor of the verifier, turning on the flags of `site/src/lib/live.ts` in a change of its own, enabling the schedule), and later (a domain of one's own, taking a piece down, stopping the run, putting the previous site back, rotating the keys).

- **Each step has its commands and what to expect.** A step marked *outward* changes something outside the machine (GitHub, Cloudflare, the model, money) and is not run without the owner's go-ahead for that step.
- **No secret is on a command line.** Secrets are kept in files under `~/.config/agentic-media-house/` that only their owner can read, and a command reads them from the file (`gh secret set NAME < file`, `gh secret set --env-file file`, or `NAME="$(cat file)" command`).
- **What the tests check of it.** `desk/test/runbook.test.ts` fails when a step has no command or no expected result, when an outward step is not marked, when a command names an `npm` script or a `desk` option that does not exist, when it names a file or a workflow that is not in the repository, when the secrets that it lists are not the ones that the workflows read, when the times of the schedule differ from `desk.yml`, and when anything in it is shaped like a key or a secret is on a command line.
- **What is not proved.** Every operation of it meets GitHub, Cloudflare or a real model, so none can be run by a test. The first time that any of it is run is what shows whether it is right, and what it shows is recorded.

## The verifier evals
```

Run: `npm test --workspace @robywire/desk -- test/readme.test.ts`
Expected: PASS — `Test Files  1 passed (1)`

Run: `! LC_ALL=C grep -n '[^[:print:][:space:]]' README.md`
Expected: PASS — prints nothing

- [ ] **Step 8: Run the whole check**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 9: Commit**

```bash
git add README.md desk/test/readme.test.ts desk/test/runbook.test.ts docs/runbook.md
git commit -m "docs: the runbook, docs/runbook.md, thirty-four numbered operations with their commands and what to expect, from the check of the repository and the rewrite of the author of every commit, through the empty repository, the private bucket and its rule for pending/, the secrets kept in files and set from them, the first push, the first trials with a real model and the dry week, to the flags, the schedule, a domain, a retraction, a rollback and the rotation of every key, and desk/test/runbook.test.ts, which holds it to the commands, the files, the workflows and the secrets that the repository has, and runs its rewrite of the history on a made-up repository" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing

---

### Task 28: The whole check from a clean install, and the go-live checklist

**Files:** none. This task changes nothing and makes no commit.

Six tasks added a settings file, two workflows, a command and a runbook, and a development dependency (`wrangler`). Each of them was checked when it was made. This task checks the repository as a whole, from nothing: every `node_modules` is removed, `npm ci` installs exactly what the lock file says, and `npm run verify` runs every check of the repository, the one command that says whether it is in order. Then it writes down what is left, and who does it.

- [ ] **Step 1: Remove every `node_modules` and install from the lock file**

This is what the first step of every workflow does on GitHub (`npm ci`), so it is also a check that the lock file, including the lines that `wrangler` added, is enough.

Run: `find . -name node_modules -type d -prune -exec rm -rf {} +`
Expected: PASS — prints nothing

Run: `npm ci`
Expected: PASS — `added`

- [ ] **Step 2: Run everything that the repository checks**

Run: `npm run verify`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `desk demo: ok: completed as published (dry run, scripted model and verifier)`, `Passed: 18 checks.`, `Passed: 17 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a few minutes. The lines of the output that matter, in the order they appear, as they were when this part was verified (on another machine a Lighthouse score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the repository after this part and change when a test is added:

```text
Result (101 files):
- 0 errors

Test Files  35 passed (35)
Tests  2221 passed (2221)
Test Files  6 passed (6)
Tests  253 passed (253)
Test Files  38 passed (38)
Tests  1271 passed (1271)
Test Files  82 passed (82)
Tests  3517 passed (3517)

61 of 61 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

extract: 7 claims proposed, 7 kept, 0 dropped
compose: the gate says publish (0 failures, 0 hold reasons)
verify: the model check passed
verify: round 0: the gate says publish, the model check passed
outcome: published
dry run: nothing was written to the site or to git (3 files would have been)
04-extract: equal
05-compose: equal
06-verify: equal
replay: equal
desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality

Passed: 18 checks.   (audit:prod)
Passed: 17 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

- [ ] **Step 3: Check that nothing was left behind**

Neither `npm ci` nor the checks change a file of the repository, and the folders that they make (`site/dist`, `runs/`) are ignored by git.

Run: `git status --porcelain`
Expected: PASS — prints nothing

Run: `git log --format='%h %s' -3`
Expected: PASS — `docs: the runbook` and `feat(desk): desk tune` and `feat: the deploy workflow`

#### The go-live checklist

Plan 2b ends here. The pipeline, the workflows, the harness and the runbook are built, and every line of them has been run against made-up pages, a made-up bucket and scripted models, and nothing against GitHub, Cloudflare R2 or a real model. What remains is the second half of the design: milestone 5 (the first real runs and the shadow week) and milestone 6 (the Desk running by itself, and the fourteen days). **Nothing below is done by writing code first**; each item is an operation of `docs/runbook.md` (the step is named), carried out by the person in the second column, and what it produced is **recorded**, in a note kept with the repository's other notes and reported to the owner. A step marked *owner* cannot be done by an agent at all (a dashboard, a login, a decision); a step marked *agent* is done by an agent only with the owner's go-ahead for that step.

**1. Before anything goes outward**

| # | What | Who | Runbook | What to record |
|---|---|---|---|---|
| 1 | The repository passes every check on the machine that will push it, and nothing in what git tracks is shaped like a key | agent | step 1 | the last lines of `npm run verify` |
| 2 | The author and committer of every commit are the no-reply address of GitHub, the tags are moved, the backups are gone | owner says yes, agent does | step 2 | the output of `git log --all --format='%ae %ce' \| sort -u` |

**2. GitHub and Cloudflare**

| # | What | Who | Runbook | What to record |
|---|---|---|---|---|
| 3 | The public repository `joshi-alok/agentic-media-house` exists, and the workflows may push and open pull requests | agent | steps 3 and 4 | the address, and the answer of the permissions call |
| 4 | The private bucket, its rule for `pending/`, no public address | owner (login), agent | steps 5 and 6 | the output of `lifecycle list`, `dev-url get` and `domain list` |
| 5 | The access key of the bucket (limited to it, object read and write) and the token that deploys | **owner only** | steps 7 and 8 | that they exist, and their names in the dashboard; never their values |
| 6 | The secrets are in files that only the owner can read, and set on the repository | owner (the values), agent (the commands) | steps 9 and 10 | the output of `gh secret list`: seven names |
| 7 | The versions of the three actions are the current majors | agent | step 11 | the three tags; a commit if a major changed |
| 8 | First push; CI and Deploy are green; the daily workflow is paused | agent | steps 12 and 13 | the two run addresses; the site answers 200, and 404 for a page that is not there (step 14) |

**3. The first real model (milestone 5, first part)**

| # | What | Who | Runbook | What to record |
|---|---|---|---|---|
| 9 | `desk tune` on one page, then on three to five, within the budget of calls and of the US$10 | agent, owner's go-ahead for the money | steps 16 and 17 | every table, the tokens and the dollars of every invocation, the running total |
| 10 | The pages are judged: why claims were dropped, what the gate and the model check said, whether the piece could be published | agent, reported to the owner | step 18 | a paragraph for each page; the patterns |
| 11 | The prompts are changed where the trials say so, one change to a task, and the trials are run again with the same list | agent | step 20 | each change with the before and the after of the table; **no rule loosened** |
| 12 | The verifier is measured on the real model (60 sentences, 6 calls) | agent, owner's go-ahead | step 19 | precision and recall of what it cleared and of what it flagged, by label |
| 13 | The floor of the verifier is frozen, as a committed script with the numbers it comes from | owner decides the numbers, agent commits | step 24 | the commit |

**4. The shadow week (milestone 5, second part)**

| # | What | Who | Runbook | What to record |
|---|---|---|---|---|
| 14 | R2 accepts what the Desk sends: the first dry run puts its pages in `pending/` and reads them back (region `auto`, path-style addresses, `PUT` with metadata headers, `HEAD` with no body, `404` for a missing key); if R2 answers differently the run fails closed, and the exact message is reported | agent | step 21, day 1 | the log of the first run; the message if it failed |
| 15 | Five dry runs, one a day, with the real sources, model and bucket | agent, owner's go-ahead for the money | steps 21 and 22 | the table of the week: outcome, stage, reason, claims, rounds, gate codes, model-check failures, tokens, cost, and whether the owner would publish it |
| 16 | At least one run is replayed and comes out equal | agent | step 23 | `replay: equal`, the run id |
| 17 | The owner reads the pieces of the week and says whether the Desk may publish | **owner** | step 22 | the decision, written down; any piece that would not have been published, and what let it through (fixed by a test first) |

**5. Going live (milestone 6)**

| # | What | Who | Runbook | What to record |
|---|---|---|---|---|
| 18 | The flags `evidenceStore` and `verifier` of `site/src/lib/live.ts` are on, in a change of their own, after every sentence that changed was read again | agent, owner reads the copy | step 25 | the commit; the sentences that changed |
| 19 | The schedule is enabled and the first real run is made by hand; if it holds a piece, the draft pull request opens and merging it publishes | agent, owner merges | steps 26 and 27 | the run; the artifact (open one, check that no page text is in it); the deploy that the Desk started; for a hold, the pull request |
| 20 | The flags `publishing` and `scheduler` are on, after a real piece and a run that the schedule itself started | agent, owner reads the copy | step 28 | the commit |
| 21 | Fourteen days of runs, with an owner who reads every piece in the first week and every hold; a correction is made with `desk retract` when one is needed | agent for the commands, **owner** for the reading | steps 27 and 30 | a line for each day: outcome, cost, anything wrong; the count of corrections |

**6. What the owner still has to decide or give**

- **The wording of the byline** (`DESK_BYLINE_LABEL`, "automated, with sources linked") and what the method page says in the present tense once the flags are on. The copy was written for a pipeline that is not running; the owner signs the version that is.
- **The domain.** Until the owner has one, the site is at `agentic-media-house.joshi-alok.workers.dev` and the user agent of the Desk links to its /method page. A custom domain changes `desk.config.yml` and the default of `SITE_URL` together (a test makes sure of it), and is step 29.
- **A monthly spending limit on the key in the Anthropic Console**, before the first paid call, and **the rotation of the key once the trials are over** (it was pasted into a conversation): step 33.
- **The decision of the floors** of the verifier, from the numbers of item 12.

**7. The limits that remain**

These are known, written in the README, and not fixed by this plan; each is a decision for later, or a thing that the first real runs may show to matter.

- **Nothing has been run on GitHub, on Cloudflare or against R2.** The workflows are checked as data; the signing and the store are checked against Amazon's published examples and a bucket made of memory that verifies every signature. The first real run is the proof, and a store that R2 does not accept fails closed (the run is `failed`).
- **The versions of the actions** (`checkout`, `setup-node`, `upload-artifact`, all at `v7`) were not checked against GitHub: step 11.
- **A push by the token of a workflow starts no workflow.** The daily workflow starts the deploy by hand after it pushes; CI does not run on the Desk's commits, nor on the pull request of a hold. A piece that the owner merges is a push by the owner, so both start.
- **A job that starts from a fresh checkout has no folder of runs**, so `maxAttemptsPerDay` is enforced by the three starts a day and not by a count; a day is "done" because the desk state says so (`--skip-if-done`).
- **The snapshots of a held piece that the owner releases by merging its pull request are not kept** (nothing keeps them, and `pending/` is emptied after 90 days). A small command that keeps the snapshots of the pieces that are on the site would close it; it is not built.
- **The store does not retry:** one failed request fails the run, and a bucket that is down for hours fails every try of the day. A short backoff could be added if the first real runs show transient errors.
- **A dry run with the bucket as its store still puts its pages in `pending/`** of the real bucket (so that it can be replayed); the 90-day rule removes them.
- **The extract rules are strict.** A real page may keep few claims, and `no-story` is a valid day. They are never loosened to compensate; the prompts are tuned instead.
- **`desk tune` reads "also bounded by the budget of the settings" as: each trial is held to the budget of a run**, and the whole invocation to `--max-calls`.
- **Dollars come only from prices the owner writes**; the Desk never knows a price. The block holds one price, so it is not applied when extract, compose and verify are not one model.
- **`npm audit` reports three high findings** in the tree of `wrangler` (`sharp`, inside `miniflare`). They are in a development tool that is used here only to deploy static files, and they do not reach the site; they are reported, not fixed.
- **No Claude-Max client**, no per-site newsroom adapters, and the 14-day run itself are milestone 6, and are not built here.
