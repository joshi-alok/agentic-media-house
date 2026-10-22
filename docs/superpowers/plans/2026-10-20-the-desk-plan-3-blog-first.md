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

**Run of 2026-10-20**, branch `plan-3-blog-first` at `a3cdbd7`, the owner's go given in chat. Command: `desk tune --urls runs/tune-urls.txt --trials 1 --max-calls 40 --client api --config runs/tune-settings.yml --profile brief` (folder `runs/tune/20261020-143741`, git-ignored). Spent: 21 of 40 calls, 103,652 tokens in and 20,054 out, **US$0.41** at the prices of the settings. Exit 0, not stopped.

| Page | Claims kept | Rounds | Last draft: blockers / words / notes | Model check on the last draft | Outcome |
|---|---|---|---|---|---|
| 1 Agility Robotics (company) | 8 of 10 | 1 | none / 280 / 2 | 15 of 15 entailed | **published** |
| 2 IEEE Spectrum (another outlet) | 6 of 10 | 2 | none / 270 / 2 | 12 of 13: the heading "Orders, funding and availability" was not entailed (the cited passages cover funding and availability, not orders) | **held** |
| 3 FANUC (company) | 9 of 11 | 2 | none / 246 / 1 | 15 of 16: one takeaway "not entailed", with a reason that says the sentence is supported | **held** |
| 4 Boston Dynamics (company) | 3 of 5 | 0 | none / 175 / 2 | 12 of 12 entailed | **published** |
| 5 Universal Robots (company) | 3 of 7 | 1 | none / 130 / 6 | 13 of 13 entailed | **published** |

**Criterion (at least 3 of 5 pages with at least 3 claims, a last draft with no blocker, and a model check that ran): 5 of 5.** The diagnosis holds: the news-shaped gate was what stopped every earlier trial. Plan 3b may start. Three pieces would publish by themselves; two are held by the model check after the rounds of revision were spent on blockers in round 0 (page 2: 11 sentences without the outlet's exact name and 4 unsupported numbers; page 3: one number and one name in analysis), leaving none for the model check's objection.

What the drafts show that the numbers do not (to design in Plan 3b):
- **The facts are clean, short and cited; nothing is padded or invented** in the three published drafts. The drafts are 130 to 280 words, so the 150 to 500 range of `brief` fits a press release; a piece with only 3 claims repeats one fact in the title, description, opening and takeaway.
- **The "What we couldn't verify" sentences are unreadable.** They are written by code from the label and values of each claim and give text such as "The 5 Agility unveiled Digit 5, 5 repeatedly lift up to 50 lb., 90-minute 90-minute runtime battery charges in 9 and 5 weighs 284 lb. (129 kg) figures come from a company press release". Labels are fragments of the quoted passage, cut to six words. This must be redesigned before anything is published (for example one plain sentence per basis, naming the source, with no concatenated fragments).
- **An attributed piece repeats the outlet in every sentence** ("IEEE Spectrum — Robotics reports that ..." eight times), because G6 demands the registry's exact outlet name in each attributed sentence. A digest needs one attribution per item or paragraph, and a short outlet name.
- **The model check is the weak link.** It rejected one heading rightly (a heading claiming more than its claims) and one takeaway wrongly (its own reason says "this is fine"). The verdict must follow the reasoning (ask for the reason first, or a structured verdict), and the labelled set needs cases for headings and invented entities. A rejection found in the last round has no revision round left: reserve one round for the model check, or let a model-check rejection of a heading or sentence go back for one more round.
- **Round 0 is still expensive for the writer**: 13 unsupported numbers on page 5 (product and standard names that contain a number), 11 unattributed sentences on page 2. The prompt now tells the writer; the next run will show whether it learned.


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

4. **Corrections made after the reviews of Tasks 11 and 14** (all conservative, all pinned by tests): the compose prompt now says which rule blocks and which is noted exactly as the gate treats them (amount words block in analysis and headings; the first word of an analysis sentence comes from a closed list of function words or from a cited claim's quoted passage, name values or outlet; the section count and the categories cannot be revised; the reserved headings are named); the public words say that the "Unconfirmed." label is in the BODY (a headline or description built on another outlet's claim names the outlet and carries no label), that a name opening a factual sentence is not read at all, and that for meaning and for names the model check is the only layer.
5. **Task 14b, hardening found by the final whole-implementation review** (one task, two commits, `3ca9a57` and `a3cdbd7`): a revision may not turn a fact into analysis (`reviseReplySchema`; otherwise a fact the model check rejected could be laundered into analysis, which no model reads); a word that mixes letters and digits (`mid-2027`, `FY2027`, `10x`, `Q3`) must appear in a cited claim's passage, name values or outlet (new blocker `G4_FIGURE_UNSUPPORTED`, also for the first word of a fact sentence and for headings, with non-ASCII digits included); analysis may name the company that a fact opens with; the verify reply limit is 16000 tokens; each tune trial leaves `log.txt` (counts and codes only; a failed write never replaces the result); the compose prompt asks for the outlet's name exactly as given and for letter-and-digit words only as the passage writes them. Seeded defects: 60 of 60.
6. **Open decisions for the owner** (none blocks the paid run; most must be settled before `DESK_SCHEDULE=on`):
   - the footer `disclosure()`, `deskIntro()` and `siteDescription()` still say every factual sentence traces to a passage "in a primary source", which is no longer literally true;
   - a piece that rests entirely on another outlet's reporting now publishes with no human (its headline names the outlet and has no label): accept, or require the label, or refuse tier-2-only headlines;
   - the share of analysis is only a note and no model reads analysis: add a hard ceiling that blocks, or have the model check judge analysis;
   - the verifier's labelled set (`desk/evals/verifier-set.json`) has no case for amount words, letter-and-digit figures, an invented company in a sentence or a heading, or a name that opens a sentence: add them and calibrate before going live;
   - runbook step 23 (the rehearsal with no primary source) no longer forces a hold;
   - the HTTP timeout of 120 seconds applies to every call, verify included;
   - the ledger field is still called `gate.warnings` while everything else says notes: the last cheap moment to rename it is before any ledger is published;
   - the branch `plan-3-blog-first` is not merged; `main` is untouched.

## Known limits of this plan

It was written from reading the code, not replayed mechanically as Plans 1 to 2b were. Where a change makes tests fail in files that this plan could not list line by line, the task gives the **rule** to apply and the `grep` that finds the files; apply the rule, never weaken a test that guards a blocker, and if a failing test is in neither the list nor the rule, stop and ask. The transcript of what each task changed is its commit.
