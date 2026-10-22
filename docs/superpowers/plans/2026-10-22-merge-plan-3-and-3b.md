# Merge plan: Plan 3 and Plan 3b into `main`, and the first push of them

> This is a plan for the owner to read and decide on. Nothing in it has been done: no merge, no push, no tag. Every step marked **(outward)** needs the owner's yes, in chat, when it is about to be done.

**Goal:** bring the work of Plans 3 and 3b (the blog-first gate, the crypto explainers, the extraction in parts, the retry, the lowering of a rejected status) from two local branches onto `main`, push it to GitHub, and see the site redeployed with the new words, without the Desk being able to run or to spend anything.

## 1. What is true now (checked 2026-10-22)

| Fact | Value |
|---|---|
| Branches | `main` (`b561de6`), `plan-3-blog-first` (`23dce70`), `plan-3b-crypto-explainers` (`737d09c`, the tip) |
| Shape | One straight line: `main` → 34 commits of Plan 3 → 81 commits of Plan 3b. `main` is an ancestor of the tip, so the merge is a fast-forward and needs no merge commit |
| What GitHub has | `origin/main` is `268cfa1`. Local `main` is 7 commits ahead of it (documents of Plan 3), so a push is **122 commits**, 223 files changed, about 18,500 lines added and 3,400 removed (the whole repository's pack is about 7 MiB) |
| Authors and committers | every commit of the branches, and the 7 on `main`, uses `Joshi-Alok <185603530+joshi-alok@users.noreply.github.com>`; no commit message mentions a personal address |
| Secrets in the diff | a scan of `git diff main plan-3b-crypto-explainers` for key shapes (`sk-ant-`, private keys, access key ids, Cloudflare tokens) finds 0; `.env*`, `/runs/` and `/evidence/` are ignored by git; no key file is tracked |
| Dependencies | `package-lock.json` is unchanged; `yaml` (which the site now imports) is declared in `site/package.json`; the workflows are unchanged; the root `package.json` changed one line (its description) |
| Tests | `npm run verify` is green at `737d09c`: gate 2352, evals 319, site 1430, desk 4531 tests, 62 of 62 seeded defects caught, Lighthouse 100 on five pages |
| Repository | public: https://github.com/joshi-alok/agentic-media-house; default workflow permission is write |
| Secrets on GitHub | six: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_SECRET_ACCESS_KEY`. **No `ANTHROPIC_API_KEY`**, no repository variable (so `DESK_SCHEDULE` is not `on`) |
| The Desk workflow | starts on the schedule three times a day and ends at once with "skipped" (the last six runs did): its job runs on the schedule only when `DESK_SCHEDULE` is `on` |
| The live site | https://agentic-media-house.joshi-alok.workers.dev says "Robotics news with a receipt for every claim. No pieces yet." and lists the robotics beats; it has no articles (the robotics articles in the repository are test fixtures and are not built into the site) |
| An orphan commit | the branch `claude/loving-aryabhata-7f9582` (a worktree in `.claude/worktrees/`) has one commit that is on neither branch, `6f6c004`: a response that was paid for and could not be written as a cassette (disk full) is now counted in the budget and not retried. It touches `desk/src/model/recorded.ts`, `types.ts` and two tests. `git merge-tree` says it applies on top of the tip without a conflict. Its two older commits are already on `main` under other ids |

## 2. What a push does, and what it cannot do

A push of `main` starts two workflows: **CI** (every step of `npm run verify`, on GitHub's machines) and **Deploy** (builds the site with the address of the Worker, audits the build, `wrangler deploy`). So:

- **Public at once:** the 122 commits and their history (the code, the plans and the specs under `docs/`), and a **new site** at the address above: the beats and the method page in the words of the crypto publication (the sentences in the tense of what is not yet live), the footer, the hold and status pages. It still has no pieces.
- **Not possible:** the Desk cannot run on the schedule (`DESK_SCHEDULE` is not `on`), it cannot call a model (no key on GitHub), nothing is published, nothing is spent. A run started by hand (`workflow_dispatch`) would stop at the missing key. The bucket and the Worker are touched only by the Deploy step, as at the last push.

## 3. Decisions for the owner before anything is pushed

**D1. Read the public words (the one that matters).** The new site says things in your name. Before the push, read these pages in a local build (step 3 below): the home page, the method page, the footer on any page, the status page, the holds page, the about text. The wording of the footer ("Every factual sentence is traced to a passage of a source ... Nothing here is financial advice."), of the limitation notes, of the policy phrases and of the method page is yours to change; a change is a small commit before the push.

**D2. The orphan commit `6f6c004`.** Recommended: cherry-pick it onto the tip now and run the tests (step 1). It is a correctness fix of the budget accounting for a case that costs money (a paid response that could not be recorded was counted as 0 tokens), and it applies cleanly. If you prefer to leave it, nothing else depends on it.

**D3. How it gets to `main`.**
- *Path A, recommended: through a pull request.* Push the branch, open a pull request into `main`, and let CI run on GitHub's machines before anything deploys (CI runs on pull requests; Deploy runs only on a push to `main`). Merge with **"Create a merge commit"** (not squash, not rebase: both rewrite the 122 commits and their authors). This costs one extra push of the same commits and gives a green CI before the live site changes.
- *Path B, as the runbook's step 13: fast-forward and push `main`.* Faster, and CI and Deploy start together; if CI fails, the Deploy still runs only if its own steps pass (it builds and audits the site, it does not wait for CI).

**D4. Tags.** Create `before-plan3-build` at the present `main` (`b561de6`), in the way of `before-plan1-build` and `before-plan2-build`, so that the state before the work can always be found. It is local until pushed with `git push origin --tags`.

## 4. Steps

Run from the repository root; the working tree must be clean (`git status --short` prints nothing).

### Step 1. Take in the orphan commit (if D2 is yes) — local

```bash
git switch plan-3b-crypto-explainers
git cherry-pick 6f6c004
npm run verify
```

**Expect:** the cherry-pick ends without a conflict, and `verify` ends green (gate 2352, evals 319, site 1430, desk 4531 plus the tests of the commit). If a test fails, undo the cherry-pick with `git reset --hard HEAD~1` (it removes only the commit you just made) and leave the commit out.

### Step 2. Mark the state before — local

```bash
git tag before-plan3-build b561de6
git tag --list 'before-*'
```

**Expect:** three tags: `before-plan1-build`, `before-plan2-build`, `before-plan3-build`.

### Step 3. Read the site as the public will — local, no outward effect

```bash
SITE_URL=https://agentic-media-house.joshi-alok.workers.dev npm run build
npm run audit:prod
npm run preview --workspace @robywire/site
```

**Expect:** the build reports its pages, the audit ends with `Passed: 18 checks.`, and the preview serves `site/dist` (the address is printed). Read the pages of D1. Anything to change is a commit on the branch (then repeat from Step 1's `verify`).

### Step 4A. Path A: pull request — **(outward)**

```bash
git push -u origin plan-3b-crypto-explainers
gh pr create --base main --head plan-3b-crypto-explainers \
  --title "Plans 3 and 3b: a publication about AI agents in crypto, explainers from one primary page" \
  --body "The blog-first gate (blockers and notes), the crypto vocabulary and sources, the explainer path, reading a page in parts, the retry, the lowering of a rejected status. npm run verify is green. Nothing here can start the Desk: DESK_SCHEDULE is not on and the repository has no model key."
gh pr checks --watch
```

**Expect:** the branch appears on GitHub with 122 more commits than `main`; the pull request shows the **CI** check, which ends green (the same steps as `npm run verify`, with Lighthouse). If CI fails, read the step that failed (`gh run view --log-failed`), fix on the branch, push again; nothing has been deployed. When it is green, merge:

```bash
gh pr merge --merge
git switch main
git pull --ff-only
git push origin --tags
gh run list --limit 4
```

**Expect:** `gh pr merge --merge` creates one merge commit on `main`; the push to `main` starts **CI** and **Deploy**; both end green. `git push origin --tags` sends `before-plan3-build`.

### Step 4B. Path B: fast-forward and push — **(outward)**

```bash
git switch main
git merge --ff-only plan-3b-crypto-explainers
npm run verify
git push origin main
git push origin --tags
gh run watch --exit-status
```

**Expect:** `merge --ff-only` moves `main` to the tip with no merge commit; `verify` is green; the push starts **CI** and **Deploy** (watch both, as in the runbook's step 13); both end green.

### Step 5. Look at what is on the air — read only

```bash
curl -sI https://agentic-media-house.joshi-alok.workers.dev/ | head -n 1
curl -s  https://agentic-media-house.joshi-alok.workers.dev/robots.txt
curl -sI https://agentic-media-house.joshi-alok.workers.dev/no-such-page/ | head -n 1
curl -s  https://agentic-media-house.joshi-alok.workers.dev/method/ | grep -c 'Agentic Media House'
gh run list --workflow Desk --limit 3
gh variable list
```

**Expect:** `200`, the `robots.txt` of the site, `404`, a number above 0; open the site in a browser and read it once more (it should say it is a publication about AI agents in crypto, with no pieces yet). The Desk runs are still `skipped`, and `gh variable list` prints nothing.

### Step 6. Clean up — local

After the merge is on `origin/main`:

```bash
git branch -d plan-3-blog-first plan-3b-crypto-explainers
git worktree remove .claude/worktrees/loving-aryabhata-7f9582
git branch -D claude/loving-aryabhata-7f9582    # only if Step 1 took 6f6c004 in, or you chose to drop it
git worktree prune
```

`-d` refuses to delete a branch that is not merged, which is the check. The branch `claude/loving-aryabhata-7f9582` is not merged by id (its commit was cherry-picked), so it needs `-D`; do that only after Step 1 and a look at `git log --oneline main | grep -c 'could not be written as a cassette'` (it prints 1).

### If something is wrong — **(outward)**

- A bad site on the air: runbook step 36 (`npx wrangler versions list`, `npx wrangler rollback <version id>`); then undo the change in git so that the next deploy does not put it back: Path A: `git revert -m 1 <merge commit>`; Path B: `git revert <first>..<last>` of the range, or `git revert` the commits one by one; then push. Never force-push `main`.
- A secret that got pushed (none is expected: the scan found none): rotate it first (runbook steps 37 and 38), then think about the history.

## 5. What this merge does not do

It does not run the Desk, publish a piece, spend money, set a key or a variable, or turn on any flag. After it, the road to the first real piece is the runbook, in its order, which this work has already brought to the explainer path:

1. **Before any key goes on GitHub:** a spend cap on the key in the Anthropic Console, and a new key (the present one was pasted into a chat once) kept in `~/.config/agentic-media-house/anthropic.key` (steps 37 and 22).
2. **Part 4** is done in part: the six real pages of Plan 3b were run (`docs/superpowers/plans/2026-10-20-the-desk-plan-3b-crypto-explainers.md`, "Results"); the floors of the model check (0.95 proposed) are yours to confirm (step 27).
3. **Part 5, the shadow week** (steps 22 to 26): a rehearsal on GitHub with `dry`, a held piece in a private repository, five days of runs that publish nothing.
4. **Part 6** (steps 27 to 31): the floors, the open questions (step 28), the flags of what has been measured (`site/src/lib/live.ts`, step 29, with the public copy that changes with them), and last `DESK_SCHEDULE=on` (step 30).

## 6. Risks

| Risk | What stops it, or what it costs |
|---|---|
| CI on GitHub's machines differs from this one (Linux, slower, no cache) | Path A shows it before anything deploys; the tests that measured time were given 5 seconds, and `evals` a 30-second timeout, because they failed on a loaded machine |
| The new public words are not the words you want | D1 and Step 3: read them first; a change is a commit |
| Deploy fails at its last step | the site stays as it was (the Worker is replaced only by a successful `wrangler deploy`); read the error, fix, push again |
| The whole history becomes public, including the plan and spec documents under `docs/` (38 files) | they contain no key (scan: 0) and no personal address (no-reply on every commit); they describe the design and the trials, including the cost of the real runs (about US$5.75 of the US$10 budget on 2026-10-21 and 2026-10-22); say if you want any document left out, which would mean rewriting history and is better decided before the first push of them |
| A model key is pushed by mistake later | `.env*` is ignored; `desk/test/secret-shapes.test.ts` and the pre-push habit of Step 4 keep a scan in the loop; rotate with runbook step 37 |
