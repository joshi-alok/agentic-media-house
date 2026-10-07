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
