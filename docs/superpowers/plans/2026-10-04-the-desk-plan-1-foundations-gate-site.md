# The Desk — Plan 1: Foundations, Gate and Site Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic core of the Desk, the daily robotics news pipeline of the Robywire site: the repository and its schemas, the nine code checks (G1–G9) that decide whether a piece may publish, proved against 54 seeded defects, and a static site that renders fictional fixture pieces with their receipts, held to an audit and a Lighthouse floor. This is milestones 0–2 of the [design spec](../specs/2026-10-04-the-desk-design.md), plus the hardening pass that review added.

**Architecture:** Three npm workspaces. `gate` holds pure functions only (no network, no model calls): the Zod schemas, the nine checks, the readers for numbers, dates and names, the limitation templates, and the deterministic renderer that turns a checked draft into MDX plus a public ledger. `evals` runs the seeded defects through the gate and writes a committed scoreboard. `site` is an Astro static site that reads the ledger and the MDX, refuses to build a piece whose article, title or description differs from its ledger, and is audited and Lighthouse-tested. All demo content is fictional and is read only when `ROBYWIRE_FIXTURES=1`.

**Tech Stack:** Node 22 and npm workspaces; TypeScript 6.0.3 at the root and in `site` (needed by `astro check`) and 7.0.2 in `gate` and `evals`; Zod 4.6.5; Vitest 5.0.3; tsx; Astro 7.3.5 with `@astrojs/mdx`, `@astrojs/markdown-satteri`, `@astrojs/rss`, `@astrojs/sitemap` and sharp; parse5, fast-xml-validator, Lighthouse 13.5.0 and chrome-launcher for the audit. Every version is pinned exactly and installed from `package-lock.json`.

---

## How to read this plan

The plan is nine part files in the folder [`2026-10-04-the-desk-plan-1-foundations-gate-site/`](./2026-10-04-the-desk-plan-1-foundations-gate-site/), executed **strictly in order**. Tasks are numbered 1–88 across the parts; a task is never split between files.

| Part | Milestone | Tasks | What it builds |
|---|---|---|---|
| [01](./2026-10-04-the-desk-plan-1-foundations-gate-site/01-m0-foundations.md) | 0 Foundations | 1–3 | Repo scaffold and tooling, constants and schemas, the `sources.yml` registry |
| [02](./2026-10-04-the-desk-plan-1-foundations-gate-site/02-m1a-gate-core.md) | 1 Gate (A) | 4–18 | Text, number, date and name readers; limitation templates; the fictional golden piece; checks G1–G5 |
| [03](./2026-10-04-the-desk-plan-1-foundations-gate-site/03-m1b-gate-checks-evals.md) | 1 Gate (B) | 19–30 | Checks G6–G9, the whole gate on the golden piece, the seeded-defect evals and scoreboard |
| [04](./2026-10-04-the-desk-plan-1-foundations-gate-site/04-m2a-site-core.md) | 2 Site (A) | 31–48 | Renderer, fixture generator, Astro site, design system, article, receipts, home and topic pages |
| [05](./2026-10-04-the-desk-plan-1-foundations-gate-site/05-m2b-site-pages-audit.md) | 2 Site (B) | 49–70 | Status, holds, corrections and method pages; feeds; fact card; the audit; Lighthouse; CI; `npm run verify` |
| [06](./2026-10-04-the-desk-plan-1-foundations-gate-site/06-m3a-gate-hardening.md) | Hardening (A) | 71–76 | First word of a sentence, headings, number words, G1 and the byline, the 14-day window, grouped limitation sentences |
| [07](./2026-10-04-the-desk-plan-1-foundations-gate-site/07-m3b-publishing-integrity.md) | Hardening (B) | 77–80 | `Unconfirmed.` label, `updatedAt` on corrections, article body written from the ledger, owner-released pieces |
| [08](./2026-10-04-the-desk-plan-1-foundations-gate-site/08-m3c-honest-copy-and-final.md) | Hardening (C) | 81–83 | The fact card on the page, honest copy with a `LIVE` switchboard, a first clean-install check |
| [09](./2026-10-04-the-desk-plan-1-foundations-gate-site/09-m3d-final-hardening.md) | Hardening (D) | 84–88 | Sentence start, title and description tied to the ledger, honest card figures, copy fixes, the final check and the Plan 2 entry checklist |

**Naming note.** Inside the plan the four hardening parts are headed "Milestone 3". That is not the spec's milestone 3 (the pipeline stages), which belongs to Plan 2. The spec's §14 lists the hardening pass as milestone "2+".

**Tasks that make no commit:** 70, 83 and 88 are verification tasks. Task 88 supersedes the totals of Tasks 70 and 83.

## Conventions every task relies on

- **Run everything from the repository root** (`/Users/alok/Documents/Claude/Projects/rnd`). Paths in the plan are repo-relative.
- **Commits** use the two-`-m` form, so the second paragraph is a real git trailer: `git commit -m "<message>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`. The trailers are the project's proof of which model wrote what; do not drop them.
- **The plan is mechanically replayable.** Directives are `**Create `path`:**` + a fenced block, `**Replace `path` with:**` + a fenced block, and `**In `path`, replace:**` + a fenced block + `**with:**` + a fenced block. `Run:` lines and ```` ```bash ```` blocks are commands; an `Expected:` line gives either `PASS` (exit 0) or `FAIL` (non-zero) plus backticked fragments that must appear in the output. Follow the text literally; if a step does not behave as written, stop and report it rather than improvising.
- **Test first.** Each task shows its test failing for the stated reason before the implementation, and passing after.
- **Fixtures never ship.** Demo content is fictional ("Fixture Robotics", `*.example` hosts), is read only when `ROBYWIRE_FIXTURES=1`, and the production audit (`A13`) fails if any of it leaks into a production build.
- **Seeded defects.** Any change to gate behaviour requires re-running `npm run evals:seeded` and committing `evals/scoreboard/seeded.json`; a test fails otherwise.

## Prerequisites on the machine

- Node 22.19 or newer, npm 10, git, and a POSIX shell (`build:fixtures` uses `ROBYWIRE_FIXTURES=1 …`).
- Google Chrome at `/Applications/Google Chrome.app` (or `CHROME_PATH` set) for the Lighthouse step.
- Network access for `npm ci`.
- Task 3 copies `sources.yml` from `/Users/alok/Desktop/robywire-astro/docs/sources.yml` and refuses to continue unless its SHA-256 matches the one recorded in the task. That file must exist on the machine.
- macOS Finder creates `.DS_Store` files, which would break the plan's "`git status` is empty" checks. Ignore them locally with `echo .DS_Store >> .git/info/exclude` (this is not tracked and is not a plan step).

## What exists after Plan 1

```
package.json  package-lock.json  tsconfig.base.json  .nvmrc  .editorconfig  .gitignore  README.md
sources.yml                     tiered source registry (tier 1 = write from, tier 2 = discover from)
.github/workflows/ci.yml        runs exactly the steps of `npm run verify`

gate/                           @robywire/gate — pure functions; 73 files
  src/constants.ts schemas.ts   vocabularies; Zod schemas for claims, drafts, ledger entries, desk state, sources
  src/text.ts normalise.ts number-words.ts tokens.ts grounding.ts    the readers: words, numbers (digits and words), dates, names, sentence openings
  src/limitations.ts slug.ts sentences.ts sources.ts config.ts gate.ts
  src/checks/g1-frontmatter.ts … g9-hygiene.ts, index.ts            the nine checks
  src/render/body.ts head.ts escape.ts frontmatter.ts render.ts       the deterministic renderer (draft -> MDX + ledger)
  src/fixtures/golden.ts variant.ts tier2.ts index.ts                 the fictional golden piece, exported as @robywire/gate/fixtures

evals/                          @robywire/evals — 54 seeded defects; scoreboard in evals/scoreboard/seeded.json

site/                           @robywire/site — Astro static site
  src/pages/                    home, news/[slug] (+ receipts, card.svg, card.png), topics/[beat], status, holds, corrections, method, feed, robots, 404
  src/lib/                      content matching, receipts, stats, fact card, JSON-LD, feed, copy and the LIVE switchboard, method text
  src/components/ layouts/ styles/                       layout and the design tokens (light and dark, system fonts only)
  src/content-fixtures/         five fictional pieces and a desk state (generated from the golden piece; `npm run fixtures:check` fails on drift)
  src/content/                  empty in Plan 1; real pieces arrive with the Desk
  scripts/audit/ audit.mjs      17 checks on the built site (A13, fixture leakage, runs on the production build only); serve-dist.mjs and lighthouse*.mjs
```

Root scripts: `typecheck`, `test`, `evals:seeded`, `fixtures:check`, `build`, `build:fixtures`, `audit`, `audit:prod`, `lighthouse` and `verify` (all of them, in CI order).

## How to execute

1. **Verified replay.** Every task has been replayed by a script, so the whole plan can be applied to the repo mechanically, with each task committed under the Sonnet 5.5 trailer. It takes minutes and no model tokens.
2. **Subagent-driven (recommended by the skill).** A fresh agent builds each task from the plan with review between tasks. Slower and more expensive; it exercises the claim that someone with no context can follow the plan.
3. **Inline.** One session executes the tasks in batches with checkpoints.

## Verification record

- **Each part was replayed mechanically** from the previous part's end state while it was written; parts 05 to 09 recorded 0 problems and an identical tree to the working copy each time.
- **Full cold replay:** all 88 tasks, applied by script to a fresh clone of the repo at the spec commit — 757 commands run and 659 expectations checked, 0 problems, 86 commits, every one carrying the Sonnet 5.5 trailer. The sources are byte-identical to the working copy in every commit; the only file that differs is `package-lock.json`, because `npm install` resolved newer patch versions of eight transitive packages on the day of the replay (`@napi-rs/wasm-runtime`, a nested copy of it under `@astrojs/astro2tsx`, `cjs-module-lexer`, `es-module-lexer`, `magic-string`, `nanoid`, `package-manager-detector` and `postcss`). Task 88's `verify` passed on that newer set with the same results (2,065, 213 and 1,212 tests; 54 of 54 seeded defects; Lighthouse 100 in every category on all five pages). So the lock file is the one thing the plan does not fix in advance: top-level versions are pinned exactly, but transitive patch versions are resolved when `npm install` runs, and a later run can write a different lock file for identical sources.
- **Clean-install check (Task 88):** after deleting every `node_modules` and running `npm ci`, `npm run verify` passes: 2,065 gate tests, 213 evals tests and 1,212 site tests; 54 of 54 seeded defects caught; fixtures up to date; the production audit passes 17 checks and the fixture audit 16; Lighthouse scores 100 in all four categories for all five measured pages (home, the golden article and its receipts, the held-then-released article and its receipts).
- **Guards proved to fail:** the seeded evals exit non-zero when a check is disabled; the audit, the fixtures check and the Lighthouse floor each have a recorded failing run in their tasks.
- **Mutation testing:** operator mutants of the code written in parts 05–09 were run against its tests; every non-equivalent survivor got a test in place. The remaining survivors are equivalent (type annotations, unreachable fallbacks) and are listed in the parts.
- **Not verified here:** GitHub Actions has never run (the repo is not on GitHub); Lighthouse was measured on one machine with simulated throttling.

## Plan 2 entry checklist

Task 88 states each item in full. In short:

1. The first push to GitHub shows every `verify` step green, including Lighthouse on `ubuntu-latest`, before any pipeline work starts.
2. The composer prompt follows the gate's rules: open sentences with a word from the cited claims or a plain function word, start every sentence with a capital or a digit, keep headings lowercase except claim words, never emit an empty section or two neighbouring sections with one heading, write digits and never "half", "twice" or "double".
3. The extract stage validates claim `text`, `label` and `values` against the span, and the slug and labels, because no gate rule reads them.
4. Decide the `basis` of a tier-2 claim (the fifth fixture misdescribes it as `filing`).
5. The pipeline passes `release` and `updatedAt` to `renderDraft`, and real `YYYY-MM-DD` dates for G9's recent titles.
6. Flipping a `LIVE` flag means re-reading its present-tense copy and rewriting the seven pipeline stages in the present tense; a few present-tense sentences still sit outside the guarded copy.
7. G10 should read headings as well as fact sentences.
8. Owner placeholders: the byline wording (`DESK_BYLINE_LABEL`), the publication name and the domain.
9. Grouped limitation sentences read awkwardly for claims with no number value, and a group has no size cap.

## Known limits of the checks

Published on the site's `/method` page and recorded in the parts: ordinals and vague quantities ("second", "several"), lone "one", word fractions ("a third"), zero/none/no, undated dates, lowercase-initial names (a sentence cannot open with one, nor with a currency sign or a dash), text the gate does not read (the slug, claim text and label, headings that assert something without a figure or a name), and meaning, which is the independent model check's job once the Desk is live. The scoreboard measures the checks against known seeded defects; it is a floor, not a proof of live accuracy.

## Open decisions for the owner

- The byline wording, the publication name (Robywire is assumed) and the domain.
- Whether the repo is public (recommended, so receipts and run logs can be checked).
- For Plan 2: an Anthropic API key with a spend cap, a GitHub repository, and a Cloudflare account with a Pages project, an R2 bucket and a domain.
