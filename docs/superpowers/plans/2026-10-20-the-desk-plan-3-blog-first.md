# The Desk, blog first — Plan 3: Blockers and Notes, and the Test of the Diagnosis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gate stop refusing pieces for the wrong reasons, and prove it on the five real pages that failed. The gate's findings are split into **blockers** (a wrong number, date or quote; an uncited sentence; a duplicate; the policy-free structure the renderer needs) that still send a draft back, and **notes** (length, shape, capitalised names, filler) that are recorded and shown but never block. Another outlet's reporting no longer forces a hold. A piece is judged against the **profile** of its kind (target ranges), the compose prompt asks only for what blocks, and `desk tune --profile brief` re-runs the saved pages with the real model so that the diagnosis of the [design](../specs/2026-10-20-the-desk-blog-first-redesign-design.md) is tested before anything else is built on it.

**Architecture:** A code is a blocker unless it is in `NOTE_CODES` (`gate/src/severity.ts`), so a new check can never publish a piece by being left out of a table. `runGateWith` splits what the checks report into `failures` (blockers) and `warnings` (notes); the route, the revision loop and the model check (G10) read only `failures`, so a draft with notes alone goes straight to G10. The ledger records the notes and the receipts page lists them. The checks themselves are not rewritten except to delete the two first-word rules, to stop G6 asking for a hold, and to split one code (`G7_ANALYSIS_NEW_NAME`). Nothing in the pipeline is renamed, and the topic (robotics today) is not touched: that is Plan 3b.

**Tech Stack:** The stack of Plans 1 to 2b: TypeScript, Zod, Vitest, Astro, `tsx`. No new package. No network, no key, no real site in Tasks 1 to 14. Task 15 is the one paid call, and it waits for the owner's go.

**Design:** [the Desk, blog first](../specs/2026-10-20-the-desk-blog-first-redesign-design.md). One refinement to the design: the spec says `CheckOutput` gains `warnings`; here the checks are untouched and `runGateWith` does the split, by code, which is the same behaviour with far fewer edits (a check's own tests still see every code it reports).

---

## Before you start

Plans 1 to 2b are built and pushed (`origin/main`), `npm ci` has been run, and `npm run verify` is green (about 6,100 tests; 61 of 61 seeded defects caught). The working tree is clean. The design spec is committed (`0a69410`).

## How to read this plan

Two part files in [`2026-10-20-the-desk-plan-3-blog-first/`](./2026-10-20-the-desk-plan-3-blog-first/), executed **strictly in order**. Tasks are numbered 1 to 15. Conventions are those of [Plan 1's index](./2026-10-04-the-desk-plan-1-foundations-gate-site.md): run from the repository root, commits carry the trailer of the model that built them, test first, ASCII only in source files, fictional fixtures.

| Part | Tasks | What it builds |
|---|---|---|
| [01](./2026-10-20-the-desk-plan-3-blog-first/01-blockers-and-notes.md) | 1–9 | The severity of a code and the split of `GateResult` into `failures` and `warnings`; length and shape become notes; capitalised names, amounts without a figure and filler become notes (one code split); the two first-word rules are deleted; another outlet no longer forces a hold and analysis may stand in the opening and the takeaways; the ledger records the notes; the receipts page lists them; the seeded evals prove that notes never block; the desk logs notes and sends none of them back |
| [02](./2026-10-20-the-desk-plan-3-blog-first/02-profiles-and-diagnosis.md) | 10–15 | Profiles (`brief`, `digest`, `explainer`) as ranges for the gate; the compose prompt rewritten around what blocks and the profile; a label that is too long is shortened instead of dropping the claim; `desk tune --profile`, with notes and word counts in the table; the public words (method page, copy, README) made true again; **the diagnosis run on the five saved pages, which needs the owner's go** |

**Tasks that make no commit:** none. Task 15 commits only the recorded result.

## What exists after Plan 3

New: `gate/src/severity.ts`, `gate/src/profiles.ts`; `GateResult.warnings`; `LedgerEntry.gate.warnings`; the code `G7_ANALYSIS_NEW_NAME`; `desk tune --profile`; `shortenLabel`. Changed: ten codes of the gate are notes; `G2_SENTENCE_START` and `G4_INITIAL_WORD_UNSUPPORTED` are gone; `TIER2_ATTRIBUTION` is a retired hold reason that nothing emits; the compose prompt; the method page, the copy and the README; the fixtures (regenerated). Root `verify` is unchanged in shape.

## The decision gate (Task 15)

The design says: if fewer than 3 of the 5 saved pages compose a draft with no blockers within two revision rounds, with G10 run on them, **stop and re-plan**. Plan 3b is not started before this result is recorded below.

## Plan 3b (written after the gate, not before)

These parts follow once Task 15 passes. They are listed so that the order is known; their tasks are written then, against the code as Plan 3 leaves it and the numbers the diagnosis run gave.

| Part | What it builds |
|---|---|
| 03 Crypto fixtures and the number checks | A small crypto fixture set (`ERC-8004`, `x402`, `EIP-4337`, `USDC`, `v2`, `0x…` addresses, `$20M`) and the changes to the token reader that it needs, test first |
| 04 The domain swap | `BEATS`, `BASES`, `SAFE_BASES`, the limitation wording, the banned and policy phrase lists (`G9_POLICY_PHRASE`), prompts (select, extract, verify), the golden piece's categories and bases, site copy and topic pages |
| 05 Formats | `format: digest | explainer` in the frontmatter, the format rule (`explainerDays`, `digestMinItems`), several stories in one run, the "Reported by" label, `G6_SECONDARY_SHARE` |
| 06 Sources | `sources.yml` rewritten with the names the owner supplies, the free pre-check, the editorial bar |
| 07 Acceptance | The live trials of §9 of the design, the owner's reading of five pieces, the verifier's calibration, the shadow week |

**Owner-only items before Plan 3b:** the go for the paid run of Task 15; the names of the protocols, exchanges, wallets and projects for `sources.yml`; the wording of the footer and of the "Reported by" label; whether a legal or jurisdiction read is wanted before going live.

## Diagnosis result

(Recorded by Task 15. Empty until the run has been made.)

## Deviations decided during execution

Recorded as they happen; each one is conservative and reversible, and each needs the owner's confirmation at the end.

1. **A name that an analysis sentence brings in is a blocker, not a note** (`G7_ANALYSIS_NEW_NAME` is not in `NOTE_CODES`). Found by the quality review of Task 3: the model check (G10) judges fact sentences and headings only, so a note here would leave an invented party in an analysis sentence checked by nothing. Consequences: Task 4 keeps the opening-word clause of G7 (it now reports `G7_ANALYSIS_NEW_NAME`) and deletes only the two first-word rules for fact sentences; the seeded count after Task 4 is `59 of 59`, not `57 of 57` (the review of Task 4 also restored one narrow rule: an analysis sentence must start with a capital letter or a digit, reported as `G7_ANALYSIS_NEW_NAME`, because the rule that used to catch it for every sentence is gone and no model reads analysis); the compose prompt (Task 11) and the method text (Task 14) say that analysis may not name what no fact names. To revisit when a model reads analysis (Plan 3b, verifier calibration).
2. **Follow-ups the reviews raised, to close before or in Plan 3b** (none blocks Plan 3):
   - the labelled verifier set has no case whose only defect is an invented company or product, and the heading carve-out of the verify prompt ("a heading that only names what the section is about is entailed") is the likeliest leak: add sentence and heading cases, and a prompt line that a name no passage contains is `not_entailed`;
   - the share of analysis is a note and G10 does not judge analysis: decide whether G10 should judge analysis ("not contradicted by the cited claims") or whether a high share cap stays a blocker;
   - the dead branch `if (where === 'opening')` and its stale comments in `desk/src/stages/verify.ts` (cleaned in Task 9), and the test that keeps it alive with an empty list of note codes.

3. **Follow-ups from the review of Task 5, folded into later tasks:**
   - a claim from another outlet that the title or the description cites is attributed (G6 requires the outlet's name) but carries no "Unconfirmed." label, because only the body is labelled; accepted, since a blocker would make a story with only secondary sources unpublishable; the public copy of Task 14 must say that a piece may rest entirely on another outlet's reporting and publish automatically, labelled in its body, and Plan 3b designs the "Reported by" label for headlines;
   - stale prose that still says a tier-2 piece is held, for **Task 9** (`desk/src`): `stages/verify.ts` ~18 and ~206-207, `stages/publish.ts` ~37-38, `stages/compose.ts` ~33, `stages/hold.ts` ~13 and ~57, `stages/select.ts` ~84 and ~112 (a user-visible string pinned by `desk/test/stages/select.test.ts` ~262) and `stages/fetch.ts` ~47; for **Task 11**: `prompts/compose.ts` "Never use analysis in the title, the description, the opening or the takeaways"; for **Task 14**: `README.md` 41 and 221, `site/src/lib/method.ts` 58, 63, 185, `site/src/lib/copy.ts` 92-93 and 148-149, `site/test/method.test.ts` 130-131, `site/test/copy.test.ts` 248-260 and 351-352; for **Task 7 or 14**: `site/src/lib/receipts.ts` 45 and 58 (they say the gate held a draft; fixture 5's hold comes from the model check) and `gate/src/constants.ts` 97 (the meaning of `release: owner`);
   - `desk/test/support/held.ts` hard-codes two empty revisions and three verifier passes, and `hold-pr.test.ts` hard-codes `Rounds of revision | 2`: derive them from `maxRevisionRounds` when Task 9 touches the revision loop.

## Known limits of this plan

It was written from reading the code, not replayed mechanically as Plans 1 to 2b were. Where a change makes tests fail in files that this plan could not list line by line, the task gives the **rule** to apply and the `grep` that finds the files; apply the rule, never weaken a test that guards a blocker, and if a failing test is in neither the list nor the rule, stop and ask. The transcript of what each task changed is its commit.
