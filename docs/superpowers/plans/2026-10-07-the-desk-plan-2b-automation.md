# The Desk — Plan 2b: Automation, Deployment and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Desk able to run unattended once a day and publish a static site, without yet running it: the publication's new name, run mechanics that survive a bad day, hold pull requests with a release marker, `desk retract`, a private evidence store on Cloudflare R2, the daily and deploy workflows, a tuning harness for the first real-model trials, and a runbook that carries out every live step in a safe order. This is milestone 4 of the [design spec](../specs/2026-10-04-the-desk-design.md), as detailed in the [automation design](../specs/2026-10-06-the-desk-automation-design.md).

**Architecture:** Everything deterministic is built and verified offline, as in Plans 1 and 2. Everything outward-facing (GitHub, Cloudflare, R2, a real model, a paid call) sits behind an interface with a fake (`ForgeTarget`, `EvidenceStore`, `ModelClient`, an injected `exec`), and the live steps are a numbered runbook, `docs/runbook.md`, that the owner or an agent carries out one step at a time. The workflows are proven as data: their YAML is parsed and their steps are run in order over local bare git repositories.

**Tech Stack:** Plan 1 and 2's stack plus `wrangler` (exact version, a development tool for the deploy). AWS Signature Version 4 for R2 is written in code on `node:crypto` and checked against AWS's published worked examples. No test touches the network, GitHub, Cloudflare or a real credential.

---

## Before you start

Plans 1 and 2 are built in the repository and `npm ci` has been run. Plan 2b changes some of their code first (the rename, then run mechanics, then hold flow), then adds the workflows and the tools around them.

## How to read this plan

Six part files in [`2026-10-07-the-desk-plan-2b-automation/`](./2026-10-07-the-desk-plan-2b-automation/), executed **strictly in order**. Tasks are numbered 1–38. Conventions are those of [Plan 1's index](./2026-10-04-the-desk-plan-1-foundations-gate-site.md): run from the repo root, the two-`-m` trailer commits, test first, mechanically replayable directives, fictional fixtures.

| Part | Tasks | What it builds |
|---|---|---|
| [01](./2026-10-07-the-desk-plan-2b-automation/01-rename.md) | 1–4 | One place for the name Agentic Media House; the site, the fact card, the user agent and the byline say it; audit check A18 refuses a build that still contains the old name |
| [02](./2026-10-07-the-desk-plan-2b-automation/02-run-mechanics.md) | 5–10 | The run record says how a run was made; a failed day can be tried again (up to three times); the paid client is refused on fictional pages; Extract compares a value's `normalised` text with its `raw` text; a richer `desk status` |
| [03](./2026-10-07-the-desk-plan-2b-automation/03-forge-and-retract.md) | 11–16 | `ForgeTarget` and `GhForge`; a held piece rendered for the owner with `release: 'owner'`; the hold flow opens a draft pull request; `desk retract` |
| [04](./2026-10-07-the-desk-plan-2b-automation/04-evidence-r2.md) | 17–22 | SigV4 signing; `R2EvidenceStore` with `pending/` and `published/` and `keep`; the factory and the environment-only credentials |
| [05](./2026-10-07-the-desk-plan-2b-automation/05-workflows-and-tune.md) | 23–28 | `desk.config.yml`, `desk.yml`, `deploy.yml` with `wrangler.jsonc`, `desk tune`, the 34-step runbook |
| [06](./2026-10-07-the-desk-plan-2b-automation/06-hardening.md) | 29–38 | `desk push` that cannot fail open or lose a run (rescue branch), build and audit before anything reaches `main`, open holds remembered for 14 days, hold retry names, redaction of the endpoint and account id, least privilege, a public artifact packed from an allow-list, a `dry` rehearsal, a corrected 38-step runbook, the final check and the go-live checklist |

**Tasks that make no commit:** 4, 28 and 38. Task 38 supersedes the totals of Task 28 and holds the final go-live checklist.

## What exists after Plan 2b

New or changed, on top of Plan 2: `desk push`, `desk pack-artifact`, `desk retract`, `desk tune`; `desk/src/run/{forge,push,branches,build-failed,environment,pack,sigv4,r2-evidence,retract,spending}.ts`; `.github/workflows/{desk,deploy}.yml` and `.github/scripts/github-auth.sh`; `wrangler.jsonc`, `desk.config.yml`; `docs/runbook.md`. Root `verify` is unchanged in shape.

## What is NOT done, and who does it

Nothing has been run on GitHub Actions' schedule, on R2 or against a real model, and **no secret is set**. Everything below is in the runbook and the go-live checklist (Task 38), in order, each marked outward or not:

1. **Before anything goes outward (done):** the repository passes every check; a secret and an e-mail search of what git tracks find nothing; the history carries the GitHub no-reply address.
2. **GitHub and Cloudflare, before the first push of the workflows:** the private R2 bucket and its 90-day rule on `pending/`, no public address; the bucket-scoped access key and the deploy token (**owner only**, in the Cloudflare dashboard); secrets in files only the owner can read; an anonymous request to the bucket must be refused; action versions checked.
3. **The first push of the workflows, with the schedule off** (`DESK_SCHEDULE` unset), CI and Deploy green.
4. **The first real model (milestone 5, first part):** a US$10 spend limit on the Anthropic key in the Console (what enforces the budget), then `desk tune` on one page, then three to five; the pages are judged; the verifier is measured on the 60-sentence set; prompts change where the trials say so, never the rules.
5. **The shadow week:** a `dry` rehearsal on GitHub, a held piece rehearsed in a private repository, five dry runs on real sources, the owner reads them and decides whether the Desk may publish; the verifier's floors are frozen.
6. **Going live (milestone 6):** the `LIVE` flags in two commits after the copy is re-read; `DESK_SCHEDULE` set to `on`; 14 days with the owner reading every piece and every hold.

**Owner-only items:** the Cloudflare login, access key and deploy token; the notification settings; the byline wording; the domain; the verifier floors; four open questions (should G10 judge analysis sentences, a recompose round, the status of unreachable sources, keeping a released hold's snapshots); the key's rotation after the trials.

## Verification record

- **Each part was replayed mechanically** from the previous part's end state while it was written, with 0 problems and an identical tree (part 01: 61 commands, 57 expectations; part 02: 34 and 28; part 03: 55 and 49; part 04: 39 and 33; part 05: 76 and 71; part 06: 142 and 133). Each task was also replayed alone from its parent.
- **Full cold replay:** all 38 tasks, applied by script to a fresh clone of the repository with Plans 1 and 2 built — 407 commands were run and 371 expectations checked, and the result is the same tree, file for file, as the repository in which the plan was written, with 35 commits that all carry the trailer of the model that built them and none with an e-mail address in its message or its changes. The replay had two problems, both at one expectation of Task 33, which had gone stale when an address was taken out of Task 27's text and so could no longer fail; the step was corrected to what is true, and Task 33 was replayed alone from its parent commit with 0 problems (12 commands, 11 expectations) and the same tree. Tasks 1 to 3 had been built in the repository before, by the same plan, and are the first three commits of Plan 2b there.
- **Clean-install check (Task 38):** after deleting every `node_modules` and running `npm ci`, `npm run verify` passes: gate 2,223 tests, evals 253, site 1,272, desk 3,870; 61 of 61 seeded defects caught; the desk demo completes; the audits pass (18 checks on the production build, 17 on the fixtures build); Lighthouse 100 in every category on all five measured pages.
- **A closure review** over the whole of Plan 2b closed 21 of 34 requirements, deferred 3 to the runbook by design, and found 19 new problems; part 06 closes the real ones (a push that could fail open, nothing built before the push, a forgotten hold, hold retry collisions, an account id in an error message, a public artifact that could carry page text, and a first draft of the runbook that named an e-mail address).
- **Mutation testing** over every part's code, with a test added for each non-equivalent survivor.
- **Proved outside the plan, by hand:** the first CI run of Plan 1 and 2's code on GitHub passed on 2026-10-06; the site was deployed once as a Cloudflare Worker with static assets and scores 100 in every Lighthouse category at its live address.

## Known limits

Nothing has run against the real services yet (the classifiers of `git` and `gh` messages were written from captured messages and need the first real rehearsal). A push by the workflow token starts no workflow, so the Desk builds and audits the site itself and starts the deploy by hand. While the build stays broken there can be one build-failed pull request per start. A hold covers its story for 14 days by the address the Desk chose. The evidence store does not retry. `npm audit` reports three high findings inside wrangler's dependency tree (a development tool, not reaching the site).
