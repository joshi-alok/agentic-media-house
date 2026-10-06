# The Desk automation — Plan 2b design (milestone 4)

**Date:** 2026-10-06
**Status:** Draft for owner review
**Extends:** [the Desk design](./2026-10-04-the-desk-design.md) (§9 runtime, §12 errors, §14 build plan) and [the pipeline design](./2026-10-05-the-desk-pipeline-design.md); starts from Plan 2's entry checklist (Task 50)
**Publication name:** Agentic Media House (given by the owner on 2026-10-06; the codebase's internal scope `@robywire/*` and the variable `ROBYWIRE_FIXTURES` keep their names for now)

---

## 1. Scope

Plan 2b is **milestone 4**: everything that lets the Desk run unattended once a day and publish a static site, plus the first contact with a real model. The pipeline itself (Plan 2) does not change except where a checklist item says so.

**Build tasks (deterministic, replay-verified like Plans 1 and 2)** go in the plan: the rename, run mechanics (retry, run record, refusals), the hold pull-request flow and the release marker, the retract command, the private evidence store, the daily workflow and the deploy workflow, and a tuning harness.

**Operations (live, paid or outward-facing, not replayable)** go in a runbook that I carry out step by step with your go-ahead at each outward step: creating the GitHub repository and pushing, setting secrets, creating the Cloudflare project and first deploy, the first real-model trials, and the shadow week.

Out of scope: milestones 5 and 6 (shadow week, the 14-day run), the Claude-Max client, per-site newsroom adapters, a custom domain until you have chosen one.

## 2. The rename (part 01, already running)

Everything a reader sees says Agentic Media House: the wordmark, titles, the byline author `Agentic Media House Desk`, JSON-LD, the feed, the fact card, the user agent (`AgenticMediaHouseDesk/0.1`). One set of constants in the gate package; a new audit check (A18) fails any build that still contains the old name. Internal identifiers keep their names; renaming them later is a separate, optional decision.

## 3. Run mechanics (checklist items 12, 14, 16, 17)

- **Retry policy.** A run that ends `failed` no longer blocks its date: the next run for that date proceeds without `--force-new` (a `published`, `held` or `no-story` run still blocks it). The workflow runs at 04:30, 06:30 and 08:30 UTC; the later runs do nothing if the day already has a non-failed run.
- **`run.json` records** which client and which sources the run used; `desk replay` reads them, so it no longer needs the same flags.
- **`--client api` with `--sources fixtures` is refused** (it would spend money on fictional pages).
- **Extract compares each value's `normalised` text with its `raw` text** (a claim with raw `twelve` and normalised `15` is dropped).

## 4. Hold pull requests, release and retraction (items 6 and 7)

- A held piece becomes a **draft pull request** from branch `hold/<date>-<slug>`: the piece rendered exactly as it would have published, with `release: 'owner'` in its ledger, plus the gate and verifier report as the PR text. The owner publishes it by marking it ready and merging; closing it discards it. The hold is recorded in the desk state with the PR address. The GitHub work goes through the `gh` CLI behind a `ForgeTarget` interface, so tests use a fake and no test reaches GitHub.
- **`desk retract <slug> --reason <text> [--kind correction|retraction]`** adds the entry to the desk state, sets `updatedAt` in the piece's frontmatter, and commits both; the page stays up with its notice and the receipts remain. It never deletes anything.

## 5. The private evidence store (item 8)

Snapshots of source pages go to a private Cloudflare R2 bucket through R2's S3-compatible endpoint, signed with AWS Signature Version 4 written in code with `node:crypto` and tested against AWS's published test vectors (no new dependency). Published pieces' snapshots are kept indefinitely; held drafts' for 90 days (a lifecycle rule on a prefix). If the store cannot be reached the run fails closed. Credentials come from the environment (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`) and are never logged.

## 6. Workflows

- **`desk.yml`**: cron 04:30, 06:30 and 08:30 UTC plus manual dispatch; a concurrency group so runs cannot overlap; checkout, Node 22, `npm ci`; `npm run desk -- run --config desk.config.yml` with `ANTHROPIC_API_KEY` and the R2 variables from secrets; a bot git identity; after the run, push the commit the run made to `main` (published pieces and the desk state), or open the hold PR; upload `runs/` as a workflow artifact for 14 days **without page text** (artifacts are readable by anyone on a public repo, so snapshots never go there); the job fails on outcome `failed` so GitHub notifies the owner.
- **`deploy.yml`**: on every push to `main`: `npm ci`, `npm run build`, `npm run audit:prod`, then `wrangler deploy` with `CLOUDFLARE_API_TOKEN` and the account id from secrets. The site is a **Worker with static assets** (a committed `wrangler.jsonc` names the build folder), not a Pages project: Cloudflare's CLI recommends Workers for every new project and will not create a new Pages project without an undocumented flag. It is already live, deployed once by hand, at `https://agentic-media-house.joshi-alok.workers.dev`. A failing build or audit stops the deploy.
- Both are validated by tests that parse the YAML and check the steps, and then proven by a real run (runbook).

## 7. The tuning harness and the first real-model trials

`desk tune --trials N --urls <file>` runs the first stages (select skipped) over a list of real page URLs with the real client, and prints, per page: claims proposed, claims surviving each extract rule, the composed draft's gate result, verifier verdicts, tokens and dollars spent (from reported usage), without writing anything to `site/` or git. A **hard call budget** (default 40 calls per invocation) stops it. The trials themselves run in the runbook: a handful of public robotics press pages that `robots.txt` allows, fetched at the Desk's polite rate, judged by me and reported to you; prompt changes that follow are ordinary committed tasks (the extract rules are never loosened to compensate). The cassettes and snapshots of these trials stay out of git.

## 8. Live flags

`LIVE.evidenceStore`, `LIVE.verifier`, `LIVE.scheduler` and `LIVE.publishing` flip when the thing is actually running (after the first successful real run and the shadow week), as a small separate task with the present-tense copy re-read. They are **not** flipped by the build tasks.

## 9. Decisions made here, for you to veto

- Repository `github.com/joshi-alok/agentic-media-house`, **public** (your earlier choice). A repository called `robywire` already exists in your account (the earlier Astro site) and is untouched.
- Before the first push, the author and committer of all 138 existing commits are rewritten to GitHub's no-reply address (`185603530+joshi-alok@users.noreply.github.com`), so your Gmail address does not become public. The tags are moved to the rewritten commits. Content and history order are unchanged; only commit hashes change.
- Cloudflare account: your **personal** account, not `denoise`. The site lives at `agentic-media-house.joshi-alok.workers.dev` (a Worker with static assets, deployed on 2026-10-06) until you choose a domain.
- The Desk's byline author is `Agentic Media House Desk`.
- Live-model budget for the tuning trials: **US$10 in total**, reported after every run. Please set a monthly spend cap on the key in the Anthropic Console, and rotate the key once the trials are done (it was pasted into this conversation).
- Secrets: I will set `ANTHROPIC_API_KEY` as a repository secret from the private key file (never on a command line) **only when you say so**. You create the `CLOUDFLARE_API_TOKEN` (permissions: Pages Edit, R2 Edit) and the R2 access keys in the Cloudflare dashboard; I cannot.
- Nothing is pushed, deployed or paid for until you give the go-ahead for that step.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The extract rules are strict and may keep few claims on real pages | Measure it first (the harness); tune prompts, never rules; `no-story` is a valid day |
| A leaked or over-used key | Private file, environment only, a call budget, a Console spend cap, rotation after the trials |
| A bad piece published by the workflow | The gate and verifier are code and a second model; held pieces need an owner merge; `desk retract` is public and never silent |
| Third-party text exposed | Snapshots in a private bucket, only hashes and short quotations in the repository, artifacts without page text |
| Workflow cost and runaway | A concurrency group, per-run budgets, three scheduled tries at most per day |
