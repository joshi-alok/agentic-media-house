# The Desk — Design Spec

**Date:** 2026-10-04
**Status:** Draft for owner review
**Owner:** Alok
**Built by:** Sonnet 5.5, clean-room (no code carried over from earlier projects; the Robywire docs are used as written specification only)

---

## 1. Goal

Build **Robywire**, a daily robotics news site, together with **the Desk**, the pipeline that writes it. A piece publishes without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify is held for the owner.

This is a showpiece for what Sonnet 5.5 can build end to end. Its proof is mechanical and public: tests, a seeded-defect eval scoreboard, a per-article receipts page, and a 14-day live run.

## 2. Definition of done

All of the following:

1. Gate unit tests pass, and the deterministic checks catch 100% of the seeded defects in `evals/`.
2. The model verifier's precision and recall are measured on a labelled set of at least 60 sentences (20 supported, 20 unsupported, 20 subtly distorted). The pass thresholds are written down at milestone 5 and frozen; the verifier meets them.
3. Five shadow days (`desk run --dry` on real days, nothing published) are complete.
4. The site is live on a public domain. Lighthouse is 95 or higher in every category on the home, article and receipts pages, and the site audit script passes.
5. A 14-day burn-in: all 14 scheduled runs execute with no manual intervention in the run mechanics; at least 10 of the 14 days publish a piece; zero retractions; every correction is public and counted. Holds are by design human work and do not count against "unattended."
6. A short written report covers the burn-in: pieces published, holds and their reasons, what the gate caught, corrections, and cost.

## 3. Scope

**In v1**
- Format `news` only (600–850 words).
- Sources: HTML newsrooms, RSS/Atom feeds, and arXiv abstract pages.
- One piece per day, or none.
- The seven beats and the `funding` tag from the content contract.
- Public receipts, status, holds and corrections pages.

**Out of v1**
- Other formats (`explainer`, `launch`, `field-notes`).
- PDF and full-paper extraction.
- Photographs.
- Newsletter, social posting, search, comments, accounts.
- Any outreach to companies (the Desk contacts no one).

## 4. Principles

1. **Fail closed.** Any error means nothing publishes. "No story today" is a valid, logged outcome.
2. **The gate is code.** A model proposes; deterministic code disposes. The model verifier is a second layer, never the only one.
3. **Evidence is immutable.** Every claim points to a hashed snapshot of the source as fetched.
4. **Untrusted input.** Fetched text is data. Model stages have no tools; only pipeline code can write files, commit, or touch credentials.
5. **Disclosure.** Pieces state that they are produced by an automated pipeline and how they are verified. The byline wording is the owner's; the disclosure itself is part of the design.
6. **Corrections are public.** Nothing is silently edited or deleted.

## 5. Pipeline

Each stage reads only the previous stage's typed artifact and writes its own into `runs/<date>/` (Zod-validated JSON).

| # | Stage | Input → output | Notes |
|---|---|---|---|
| 1 | Discover | `sources.yml` → candidates | Polls tier-1 newsrooms and tier-2 feeds. Dedups against everything seen. |
| 2 | Select | candidates → one story or none | Haiku 4.5 ranks against `desk/rubric.md`: a new fact, not a duplicate of a piece in the last 14 days, and a reachable tier-1 source preferred. A story with no reachable tier-1 source can still be selected, but is composed in attributed form and always holds (§6). |
| 3 | Fetch | story → snapshots | Stores extracted text, SHA-256 and retrieval time per tier-1 document. Respects `robots.txt`; identifies itself with a user agent that links to `/method`. |
| 4 | Extract | snapshots → claims | Sonnet 5.5 emits atomic claims (see §6). Code confirms each quoted span exists verbatim at its offset. |
| 5 | Compose | claims → structured draft | Sonnet 5.5 emits sentences that each cite claim IDs. A deterministic renderer builds the MDX (see §6). |
| 6 | Verify | draft + claims → verdict | The gate (see §7). Up to two revision rounds, each fed the exact failures. |
| 7 | Publish or hold | verdict → commit or draft PR | Pass: build, then push to `main`. Fail: branch and draft PR with the gate report. |

Runs are keyed by date and guarded by a concurrency lock. A re-run for the same date cannot create a duplicate.

## 6. Claim ledger

**Claim**
```
id           "c-12"
text         atomic statement, normalised
type         number | date | name | spec | quote | event
source       { url, tier: 1, snapshotHash, retrievedAt }
span         { start, end, quote }      verbatim in the snapshot, at most 300 characters
basis        datasheet | press-release | briefing | paper | filing | standard | measured | demo
status       demonstrated | deployed | planned | unspecified
values       [{ kind, raw, normalised, unit }]   numbers, dates, names the claim licenses
```

**Sentence** (the composer's output unit)
```
text         the sentence
kind         fact | analysis | limitation
claimIds     one or more claim IDs (required for fact; optional for analysis)
```

- **Fact** sentences need at least one claim. Title, description and key-takeaway bullets are fact sentences.
- **Analysis** sentences are labelled "Analysis" on the page. They may not appear in the title, description, opening paragraph or takeaways, and may not introduce a number, date or name that no fact sentence in the piece contains. Default cap: 20% of sentences, configurable.
- **Limitation** sentences fill the mandatory "What we couldn't verify" section. They are rendered by template from claim metadata (`basis`, `status`), never freely composed, so the gate can verify them. Each cites the claims whose metadata it describes. Example: "The 2.3 m/s speed figure comes from the company's datasheet; no independent measurement was available." Because the Desk contacts no one, "we asked and did not hear back" does not appear in v1.
- **Rendering.** No model-authored MDX reaches the repo. A deterministic renderer turns the structured draft into MDX (escaping `{`, `}` and `<`) and writes a sidecar ledger. Each sentence ends with a small marker linking to its claim on the receipts page.
- **Tier-2 claims.** A claim sourced only from a tier-2 outlet is allowed solely in attributed form ("Outlet X reports…"), labelled unconfirmed. Any piece containing one routes to hold, never auto-publish. This reconciles the `sources.yml` house rule with the gate.

## 7. The gate

Deterministic checks (all must pass):

| ID | Check |
|---|---|
| G1 | Frontmatter validates against the contract schema; `categories` are 1–3 slugs from the closed vocabulary; `description` ≤155 characters. |
| G2 | Structure: opening paragraph 40–60 words; 3–5 takeaway bullets; 600–850 words total; declarative `##` headings (none ends in a question mark); `## What we couldn't verify` present unless every claim's basis is `filing`, `standard`, `paper` or `measured`. |
| G3 | Coverage: every fact sentence has at least one claim ID, and every ID exists. |
| G4 | Values: every number, date, name and unit token in a fact sentence appears, after normalisation, in the `values` of a cited claim, and each value's raw text occurs in that claim's span. Normalisation covers `1,200` / `1.2k`, `12 kg` / `12 kilograms`, and ISO versus long dates. Name detection is capitalisation-based and deliberately strict: a capitalised, non-sentence-initial token must appear in a cited claim's values or in a maintained allow-list, and a false positive sends the draft to revision, never to publish. |
| G5 | Quotes: any quoted string in the piece is verbatim in a cited claim's span. |
| G6 | Sourcing: every claim's source is tier 1, or the sentence is a labelled tier-2 attribution (which forces hold). |
| G7 | Analysis rules from §6. |
| G8 | Limitation sentences match their template and the cited claims' metadata. |
| G9 | Hygiene: no slug collision (contract §7 rule applies), no near-duplicate title in the last 14 days (token-overlap threshold set in config at milestone 1 against fixture pairs), banned filler phrases absent. |

Model check:

| ID | Check |
|---|---|
| G10 | An independent verifier call judges whether each fact sentence is entailed by the union of its cited spans, and whether each `basis` and `status` label is supported. Any "not entailed" or "ambiguous" holds the piece. |

The verifier model is a config value, defaulting to Sonnet 5.5 with a different prompt than the composer. The evals decide whether that is enough; if not, a stronger model replaces it and the runtime is no longer Sonnet-only.

A piece publishes only if G1–G9 pass, G10 passes, and no forced-hold condition applies.

## 8. Repository and components

One repo, npm workspaces, TypeScript, Node 22.

```
sources.yml      tiered source registry, seeded from the Robywire list (all statuses reset to unverified)
site/            Astro static site
desk/            pipeline stages + CLI (run, run --dry, replay, retract)
gate/            pure functions implementing G1–G9; no model calls
evals/           seeded-defect harness + labelled verifier set
.github/         workflows: CI, daily run
docs/            specs and plans
```

- **Public ledger** lives in `site/src/content/ledger/<slug>.json`: URL, hash, retrieval time, short spans, claim metadata, gate results.
- **Evidence store.** Full snapshots go to a private Cloudflare R2 bucket, because third-party pages should not be republished in a public repo. Snapshots for published pieces are kept indefinitely; those for held drafts for 90 days. If the store is unreachable at verify time, the run fails closed.
- **Dependencies** stay minimal: Astro, Zod, Vitest, the Anthropic SDK, a text-extraction library, and a feed parser.

## 9. Models and runtime

| Role | Model |
|---|---|
| Select | Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Extract, compose | Sonnet 5.5 (`claude-sonnet-5-5`) |
| Verify (G10) | config; default Sonnet 5.5 |

- A GitHub Actions cron runs `desk run` daily (default 04:30 UTC, set in the workflow). Concurrency group prevents overlap.
- Cloudflare deploys the static site on every push to `main`.
- A per-run token ceiling is set at milestone 3 from measured dry runs, with 2x headroom. The API key carries a spend cap.

## 10. Content contract: adopted, with deviations

The Robywire content contract v2 (24 Aug 2026) is adopted as the editorial contract: frontmatter schema, the seven beats (`humanoids`, `home-consumer`, `industrial-warehouse`, `field-mobility`, `software-autonomy`, `components-supply-chain`, `policy-standards`), the `funding` cross-tag, the news body template, slug-collision rule, and the `featured: false` rule. Deviations:

| Contract | This design | Why |
|---|---|---|
| `/news/<slug>` and `/topics/<beat>` routes | Same | Kept (the contract's `/topics/` fix over `/news/<beat>` stands). |
| "What we couldn't verify" freely written | Limitation sentences rendered from claim metadata | The gate can verify templates, not free prose. |
| "What we asked for and did not receive" | Dropped in v1 | The Desk makes no outreach. |
| `format`: news, explainer, launch, field-notes | `news` only | Open question 2 in the contract: answered for v1. |
| Press-kit images preferred | No `image` block; generated SVG fact card | Licensing risk; the contract already allows "no image". |
| Named human byline | Byline discloses automation | Principle 5; wording is the owner's. |
| Open question: where corrections live | In the ledger and `/corrections`; a notice appears at the top of the article and `updatedAt` is set | Resolves contract open question 3. |

## 11. Site design

The house register: quieter, thinner, greyer; color only where it means something.

- System fonts only (no font requests); hairline rules; no rounded corners; one reading column of about 65 characters; light and dark follow the system setting, no toggle.
- Blue marks anything that links to a receipt. Green and red appear only in gate results.
- Analysis sentences carry a plain text label; no italics anywhere.
- **Home:** today's piece leads, then recent pieces by beat. A thin strip shows live ledger numbers: pieces published, claims verified, drafts held, last run time.
- **Pages:** `/`, `/news/[slug]`, `/news/[slug]/receipts`, `/topics/[beat]`, `/method` (gate rules in plain English plus the eval scoreboard), `/status`, `/holds` (what the gate stopped and why, never the held text), `/corrections`, `/rss.xml`, sitemap, 404.
- **Fact card:** a generated SVG per piece built from its own claims, also used as the share image.
- **Quality bar:** AA contrast, skip link, visible focus, minimal motion, Lighthouse 95 or higher, `NewsArticle` JSON-LD per post.

## 12. Error handling

- **Fetch:** timeouts and 5xx get bounded retries with backoff. `robots.txt` is respected and never worked around. An unreachable source has its `sources.yml` status updated and is skipped. A story whose tier-1 source is unreachable is never rewritten from a competitor's reporting; it is held in attributed form.
- **Model calls:** bounded retries on 429 and 5xx. Schema-invalid output gets one repair attempt, then the stage fails. Truncation or refusal fails the stage.
- **Gate failure** is the expected path: up to two revision rounds, then hold as a draft PR.
- **Publish:** the runner builds before pushing to `main`; a failed build opens a PR instead.
- **Corrections and retractions:** a correction fixes a factual error with a public notice; a retraction withdraws a piece. `desk retract <slug> --reason` keeps the page up with a visible notice and logs it. Both are listed publicly.
- **Visibility:** `/status` shows the last run, its outcome and the hold count; a failed run triggers a GitHub notification.

## 13. Testing and evals

- **Gate unit tests:** table-driven, with the seeded defects (swapped number, invented quote, tier-2-only claim, unsupported sentence) as fixtures. Number normalisation gets the most cases.
- **Stage contract tests:** every artifact validates against its schema; recorded model responses replay in CI, so CI makes no live API calls.
- **Evals:** run on demand and nightly against live models. Deterministic checks must catch 100% of seeded defects. The verifier is measured on the labelled set from §2.
- **Site checks:** build, content-schema validation, internal-link check, a receipts link on every article, and an audit script covering HTML validity, accessibility and Lighthouse.
- **Shadow days:** five `--dry` runs on real days before go-live.

## 14. Build plan

| # | Milestone | Done when |
|---|---|---|
| 0 | Foundations: repo, workspaces, schemas, CI skeleton, `sources.yml` | Typecheck and CI pass |
| 1 | Gate, built test-first against the seeded-defect fixtures | 100% of deterministic defects caught |
| 2 | Site shell and design system, rendered from hand-written fixture pieces | Build, schema, link and Lighthouse checks pass |
| 3 | Pipeline stages, `desk run --dry`, `desk replay`, verifier evals | A full dry run on real sources; baseline verifier numbers recorded |
| 4 | Automation: Actions cron, Cloudflare deploy, `/status`, hold-PR flow, retract CLI | A forced failure produces a hold PR, not a publish |
| 5 | Shadow week (5 dry days) | Verifier thresholds written down and frozen |
| 6 | Go-live and 14-day burn-in | Definition of done (§2) met |

Milestones 1 and 2 are independent and can be built in parallel; milestone 3 needs both. The earliest finish is the build time plus 19 calendar days (5 shadow + 14 live).

Implementation is planned in three plans: Plan 1 covers milestones 0–2 (foundations, gate, site); Plan 2 covers milestones 3–4 (pipeline and automation); Plan 3 covers milestones 5–6 (shadow week and burn-in, which are operational rather than code).

## 15. Prerequisites and open items

**Provided by the owner:** an Anthropic API key with a spend cap (needed by milestone 3); a GitHub repo and a Cloudflare account with a Pages project, an R2 bucket and a domain (needed by milestone 4).

**Open:**
- Publication name and domain (assumed: Robywire).
- Repo visibility (recommended: public, so receipts and run logs are checkable).
- Byline wording for the automation disclosure.

**Defaults chosen here, adjustable:** 20% analysis cap; 2 revision rounds; 300-character span cap; 10-of-14 publishing days; 60-sentence labelled set; 90-day retention for held-draft snapshots; 04:30 UTC schedule.

## 16. Risks

| Risk | Mitigation |
|---|---|
| A wrong claim goes live | Code gate plus independent verifier; hold on any doubt; public corrections; burn-in counts retractions |
| Correlated model error (drafter and verifier agree on a mistake) | Deterministic G3–G6 do not rely on models; verifier measured by evals; swap model if recall is low |
| Prompt injection from fetched pages | Models have no tools; pipeline code holds all write authority; spans verified verbatim |
| Sources block the fetcher or change markup | Per-source status tracking; a story with an unreachable tier-1 source is held in attributed form, never auto-published; no scraping workarounds |
| Copyright | Short quoted spans with attribution, no full-text republication, snapshots kept private |
| Holds dominate and the site looks dead | Burn-in requires at least 10 of 14 publishing days; hold causes feed back into prompts and the rubric |
| Cost | Token ceiling per run, spend cap on the key, one piece a day |
