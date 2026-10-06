# The Desk — Plan 2: The Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Desk itself, milestone 3 of the [design spec](../specs/2026-10-04-the-desk-design.md) as detailed in the [pipeline design](../specs/2026-10-05-the-desk-pipeline-design.md): the `desk` package with all seven stages (discover, select, fetch, extract, compose, verify, publish or hold), the model verifier (G10) and its revision loop, the CLI (`run`, `replay`, `status`), the verifier evals harness, and a scripted demo. Everything is built and verified **offline**, behind one model interface, because no API key exists yet.

**Architecture:** A new workspace `desk` beside `gate`, `evals` and `site`. Stages hand each other typed, Zod-validated artifacts written to `runs/<date>/`. Every model call goes through one `ModelClient` interface that cannot express a tool; untrusted text reaches a model only inside delimited blocks. Code, not the model, decides what survives extraction (every claim's quotation must be found on the page; labels, values and text are checked against it), writes the fields a model must not write (slug, date, author, limitation sentences), and runs the gate; a second model check (G10) reads every fact sentence and heading against its cited quotations. Anything either check doubts is held, never published.

**Tech Stack:** Plan 1's stack plus `@anthropic-ai/sdk` (exact version, only inside `AnthropicClient`, tested with an injected stub transport). Fetching, robots.txt, rate limiting, feed and page parsing are written in code on `parse5` and `fast-xml-parser`. No test touches the network or reads an API key.

---

## Before you start

Plan 1 is built in the repository (all 88 of its tasks, `npm run verify` green) and `npm ci` has been run. This plan changes some of Plan 1's code first (part 01 and part 06 patch the gate, the fixtures and the site), then adds `desk/`.

## How to read this plan

Six part files in the folder [`2026-10-05-the-desk-plan-2-pipeline/`](./2026-10-05-the-desk-plan-2-pipeline/), executed **strictly in order**. Tasks are numbered 1–50 and are never split between files. The conventions are those of [Plan 1's index](./2026-10-04-the-desk-plan-1-foundations-gate-site.md): run from the repo root, commits use the two-`-m` trailer form, test first, directives are mechanically replayable, and fixtures are fictional (`*.example`, "Fixture Robotics").

| Part | Tasks | What it builds |
|---|---|---|
| [01](./2026-10-05-the-desk-plan-2-pipeline/01-patches-and-scaffold.md) | 1–3 | The `reported` basis for claims that rest only on another outlet; limitation groups capped at four claims; the `desk` workspace and its config |
| [02](./2026-10-05-the-desk-plan-2-pipeline/02-model-layer.md) | 4–11 | `ModelClient`, `FakeClient`, cassettes, budget and retry wrappers, `wrapSource`, `AnthropicClient`, the no-tools guard, `clientFromConfig` |
| [03](./2026-10-05-the-desk-plan-2-pipeline/03-fetch-discover-select.md) | 12–22 | Run artifacts, robots.txt, rate limiter, fetcher, page text extraction, feeds, evidence store, source registry helpers, and the Discover, Select and Fetch stages |
| [04](./2026-10-05-the-desk-plan-2-pipeline/04-extract-compose-verify.md) | 23–28 | Claim grounding, Extract, draft assembly, Compose, the G10 verifier, Verify and the revision loop |
| [05](./2026-10-05-the-desk-plan-2-pipeline/05-publish-run-cli-evals.md) | 29–40 | Desk state, git adapter, Publish, Hold, the orchestrator and run lock, replay, the CLI, the adversarial matrix, the verifier evals harness, the demo, a first clean-install check |
| [06](./2026-10-05-the-desk-plan-2-pipeline/06-hardening.md) | 41–50 | Whole-token values, first words grounded in the quotation only, label and receipts rules, hidden text, undated pages, the non-public address guard, reserved headings, wiring and wording, a larger adversarial matrix, the final check and the Plan 2b entry checklist |

**Tasks that make no commit:** 40 and 50 are verification tasks. **Task 50 supersedes the totals and the checklist of Task 40**, and Task 48 replaces the demo's last line and a README sentence that parts 05's text still shows at their earlier step.

## Prerequisites

- Everything in Plan 1's prerequisites (Node 22.19 or newer, Chrome for Lighthouse, network access for `npm ci`).
- No API key, no GitHub repository and no Cloudflare account are needed for Plan 2.

## What exists after Plan 2

```
desk/                          @robywire/desk — 137 files
  src/model/                   ModelClient and its clients: Fake, Recorded (cassettes), Budgeted, Retry, Anthropic, factory
  src/prompts/                 select, extract, compose (and revise), verify, and the untrusted-text wrapper
  src/stages/                  discover select fetch extract compose verify publish hold, claim grounding, draft assembly
  src/fetch/                   robots, rate limit, HttpFetcher, address guard, page text, feeds
  src/run/                     artifacts, evidence store, desk state, git adapter, orchestrator, replay
  src/demo/                    the scripted demo behind `npm run desk:demo`
  src/cli.ts                   desk run | replay | status
  evals/                       the 60-item verifier set and its harness (`npm run evals:verifier`)
  test/                        fixtures on *.example, support code, a no-network guard, the adversarial matrix
```

New root scripts: `desk` (the CLI), `desk:demo` and `evals:verifier`; `verify` now ends with the demo.

## How to execute

As for Plan 1: a verified replay (a script applies every task, commit by commit), subagent-driven, or inline. The same caveat applies to the lock file: top-level versions are pinned exactly, transitive patch versions resolve when `npm install` runs.

## Verification record

- **Each part was replayed mechanically** from the previous part's end state while it was written; every part's replay reported 0 problems (part 06: 116 commands, 107 expectations), with trees identical to the working copy. Each task was also replayed alone from its parent.
- **Full cold replay:** all 50 tasks, applied by script to a fresh clone of the repository with Plan 1 built — 419 commands run and 371 expectations checked, 0 problems, 48 commits, every one carrying the Sonnet 5.5 trailer, and a final tree identical to the working copy (the lock file included). Task 50's clean-install `verify` ran inside it with the same results as above (2,217, 253, 1,231 and 2,423 tests; 61 of 61 seeded defects; Lighthouse 100 on all five pages).
- **Clean-install check (Task 50):** after deleting every `node_modules` and running `npm ci`, `npm run verify` passes: gate 2,217 tests, evals 253, site 1,231, desk 2,423; 61 of 61 seeded defects caught; the desk demo completes as published in a dry run; the audits pass (17 checks on the production build, 16 on the fixtures build); Lighthouse scores 100 in every category on all five measured pages.
- **A closure review** (a read-only critic over the whole plan) closed 34 of 47 requirements, deferred 3 to Plan 2b by design, and found 10 partly closed and 15 new problems; two were real holes (a value accepted as a substring of a longer number, and model-written claim text licensing a sentence's first word). Part 06 closes them and the others it could; the rest is on the checklist below.
- **Mutation testing:** operator mutants of the code written in every part were run against its tests; each non-equivalent survivor got a test in place.
- **Not proved, and said so:** no real model has been used (the prompts were checked against scripted models only, and the verifier harness against scripted verifiers whose scores are exact); the fetcher has never touched a real site; GitHub Actions has never run.

## Plan 2b entry checklist

Task 50 states every item in full (19 items). The main ones:

1. Push the repository to GitHub, **public** (your choice), and get the first green CI run, including Lighthouse on `ubuntu-latest`.
2. Create an API key with a spend cap; record real replies with the recording client; tune the prompts and loosen nothing in the extract rules; run `npm run evals:verifier` on a real model and freeze the floors at milestone 5.
3. The Claude Max client, if wanted, after you run one test command in a terminal and share its output.
4. The daily GitHub Actions workflow, the Cloudflare deploy, the hold pull-request flow with `release: 'owner'`, the retract command with `updatedAt`, the private R2 evidence store.
5. Turn the `LIVE` flags on and rewrite the present-tense copy that goes with them.
6. Decide a retry policy for a transient failure (a failed run currently ends the day), where held drafts persist, whether G10 should judge analysis sentences, and a "recompose" round for length or structure failures.
7. Smaller: compare a value's `normalised` text with its `raw` text; record `--sources` in `run.json`; refuse `--client api` with fixtures; DNS rebinding and unread style sheets; the owner's placeholders (byline wording, publication name, domain).

## Known limits

Newsroom scraping is generic and will give nothing for sites whose stories are not under the newsroom's own path. The extract rules are strict on purpose (a claim whose label or text uses a word the quotation lacks is dropped), so expect low recall on a real model until the prompt is tuned. A page's own date is its own word. Analysis sentences are checked by code only. The scoreboard and the verifier harness measure the checks against known defects and scripted verifiers; they are floors, not proof of accuracy on real input.
