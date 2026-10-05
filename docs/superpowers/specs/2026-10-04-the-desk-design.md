# The Desk — Design Spec

**Date:** 2026-10-04 (amended 2026-10-05 after the Plan 1 review: §4, §6, §7, §8, §10, §11, §12 and §14 now describe what the plan builds)
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
2. **The gate is code.** A model proposes; deterministic code disposes. The model verifier is a second layer, never the only one. The gate reads every sentence, every heading and the frontmatter; what it cannot judge (meaning, the slug, the claim text and label, headings that assert something without a figure or a name) is covered by the extract stage and G10 in Plan 2, and `/method` lists these limits instead of claiming more.
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
label        short noun phrase naming the claim (used in limitation sentences, on the receipts page and on the fact card)
type         number | date | name | spec | quote | event
source       { url, tier, snapshotHash, retrievedAt, outlet? }   tier is 1 or 2; outlet is required when tier is 2
span         { start, end, quote }      verbatim in the snapshot, at most 300 characters
basis        datasheet | press-release | briefing | paper | filing | standard | measured | demo
status       demonstrated | deployed | planned | unspecified
values       [{ kind, raw, normalised, unit }]   numbers, dates, names the claim licenses
```

**Sentence** (the composer's output unit)
```
text         the sentence
kind         fact | analysis | limitation
claimIds     one or more claim IDs (required for fact; optional for analysis; the claims described, for limitation)
attributed   fact only: true when the sentence attributes a tier-2 claim to its outlet
template     limitation only: basis | status
```

- **Fact** sentences need at least one claim. Title, description and key-takeaway bullets are fact sentences.
- **Analysis** sentences are labelled "Analysis" on the page. They may not appear in the title, description, opening paragraph or takeaways, and may not introduce a number, date or name that no fact sentence in the piece contains. Default cap: 20% of sentences, configurable.
- **Limitation** sentences fill the mandatory "What we couldn't verify" section. They are rendered by template from claim metadata (`basis`, `status`), never freely composed, so the gate can verify them. Each sentence describes a group of claims that share one `basis` (or one `status`: demonstrated or planned) and cites all of them once, in ascending order; one claim gives the singular wording and two or more the plural wording of the same template. A piece has one sentence per group, so the section stays short (the golden piece has five), and a group has no size cap. The section must cover every cited claim whose basis is not `filing`, `standard`, `paper` or `measured`, and every cited claim whose status is `demonstrated` or `planned`. Example: "The 2.3 m/s speed figure comes from the company's datasheet; no independent measurement was available." Because the Desk contacts no one, "we asked and did not hear back" does not appear in v1.
- **Rendering.** No model-authored MDX reaches the repo. A deterministic renderer turns the structured draft into MDX (escaping `{`, `}` and `<`) and writes a sidecar ledger. Each sentence ends with a small marker linking to its claim on the receipts page. The ledger is built first. The article body is written from it alone (`renderBody`), and so are the title and the description (`renderHead`); the site refuses to build a piece whose body, title or description is not exactly what its ledger renders, so the article and its receipts cannot differ.
- **Tier-2 claims.** A claim sourced only from a tier-2 outlet is allowed solely in attributed form ("Outlet X reports…"), labelled `Unconfirmed.` on the page (the same plain bold label style as `Analysis.`), flagged in the ledger, marked with an `Unconfirmed` chip on the receipts page, and never used in an analysis sentence. Any piece containing one routes to hold, never auto-publish. If the owner releases a held draft, its ledger records `release: owner` and its receipts page says "Held by the gate, then released by the owner." This reconciles the `sources.yml` house rule with the gate.

## 7. The gate

Deterministic checks (all must pass):

| ID | Check |
|---|---|
| G1 | Frontmatter validates against the contract schema (`NewsFrontmatter`; a test keeps G1 and the schema in agreement): title and `description` not empty, `description` ≤155 characters, `publishedAt` a real date, slug lowercase letters and digits joined by single hyphens, `categories` 1–3 distinct slugs from the closed vocabulary with at least one beat, and `author.name` equal to the Desk's name (`Robywire Desk`), so no piece carries a human author. |
| G2 | Structure: opening paragraph 40–60 words; 3–5 takeaway bullets; at least two sections; 600–850 words in the body, counted as the opening, the takeaways, the section paragraphs and the limitation sentences (a word is a run of non-whitespace; the title, description and headings are not counted); every `##` heading present, at most 80 characters and declarative (none ends in a question mark; what a heading may contain is G4's); `## What we couldn't verify` present unless every cited claim has basis `filing`, `standard`, `paper` or `measured` and status other than `demonstrated` or `planned`, and then covering each such claim with a limitation sentence of the matching template; every sentence of every kind starts with a capital letter or a digit (after any opening quotation mark or bracket), so that the first-word rule below can read it. |
| G3 | Coverage: every fact sentence has at least one claim ID, and every ID exists. |
| G4 | Values: every number, date, name and unit token in a fact sentence appears, after normalisation, in the `values` of a cited claim, and each value's raw text occurs in that claim's span. Normalisation covers `1,200` / `1.2k`, `12 kg` / `12 kilograms`, ISO versus long dates, and numbers written in words (`twelve kilograms` is 12 kg); words that state an amount with no value to compare (`half`, `twice`, `doubled`, `tenfold`) are refused, and the composer writes the figure as digits and cites the claim. Name detection is capitalisation-based and deliberately strict: a capitalised, non-sentence-initial token must appear in a cited claim's name values or outlet, or in a maintained allow-list, and a false positive sends the draft to revision, never to publish. The first word of a sentence is not read as a name; it must be an ordinary function word from a fixed list (articles, determiners, pronouns, prepositions, conjunctions and sentence adverbs; no noun, no verb), a whole word of a cited claim's text, label, quoted span, name values or outlet, or on the allow-list. Section headings are checked text: no number, date or quoted passage, and no capitalised word (the first included, unless it is a function word) that no claim cited in that section contains. Known limits, published on /method: ordinals, vague quantities, lone "one", word fractions, zero/none/no, undated dates, lowercase-initial names (a sentence cannot open with one), text the gate does not read (the slug, the claim text and label, headings that assert something without a figure or a name; the extract stage validates the first two in Plan 2), and meaning, which is G10's job. |
| G5 | Quotes: any quoted string in the piece is verbatim in a cited claim's span. |
| G6 | Sourcing: every claim's source is tier 1, or the sentence is a fact sentence that names the outlet and is marked `attributed` (never an analysis sentence); the article labels it `Unconfirmed.` and the piece routes to hold. |
| G7 | Analysis rules from §6. A number (in digits or words), date or name in an analysis sentence must appear in some fact sentence, a word that states an unverifiable amount is always new, and the first word of an analysis sentence follows the G4 opening-word rule against the words of the fact sentences. |
| G8 | Limitation sentences match their template exactly: each describes a group of claims that share one basis (or one status), cites each claim once in ascending order, and equals the sentence the gate renders from the group's metadata. |
| G9 | Hygiene: no slug collision (contract §7 rule applies, with the day step added in §10); no near-duplicate title among pieces published on the draft's day or up to 14 calendar days (UTC) before it (`titleWindowDays`; recent titles are passed with their dates, older ones are ignored; word-overlap threshold 0.6, calibrated at milestone 1 against fixture pairs); banned filler phrases absent from the title, description, headings, body and limitations. |

Model check:

| ID | Check |
|---|---|
| G10 | An independent verifier call judges whether each fact sentence is entailed by the union of its cited spans, and whether each `basis` and `status` label is supported. Any "not entailed" or "ambiguous" holds the piece. |

The verifier model is a config value, defaulting to Sonnet 5.5 with a different prompt than the composer. The evals decide whether that is enough; if not, a stronger model replaces it and the runtime is no longer Sonnet-only.

A piece publishes only if G1–G9 pass, G10 passes, and no forced-hold condition applies.

## 8. Repository and components

One repo, npm workspaces, TypeScript, Node 22.

```
sources.yml      tiered source registry, seeded from the Robywire list (every `verified` status reset to `unverified`; the documented `blocked` status of the arXiv RSS entry and the `n/a` status of the entry with no fixed address are kept, and the legend in the file says so)
site/            Astro static site
desk/            pipeline stages + CLI (run, run --dry, replay, retract)
gate/            the checks G1–G9 as pure functions (no network, no model calls), and what they share: the Zod schemas for claims, drafts, ledger entries and desk state; the limitation templates; the opening-word and number-word readers; the deterministic renderer (`renderDraft`, `renderBody`, the `NewsFrontmatter` schema); the slug helper; `loadSources`, which reads `sources.yml` (the one part that reads a file); and a fictional golden piece, exported separately as `@robywire/gate/fixtures`, that the tests, the evals and the site fixtures start from
evals/           seeded-defect harness + labelled verifier set
.github/         workflows: CI, daily run
docs/            specs and plans
```

- **Public ledger** lives in `site/src/content/ledger/<slug>.json`: URL, hash, retrieval time, short spans, claim metadata, gate results, every sentence of the article with its section, paragraph, heading, kind and `attributed` flag, and `release` (`auto` when the gate cleared the piece, `owner` when the owner released a held draft). The article body is written from this file alone, and the site refuses to build a piece whose body differs from it.
- **Evidence store.** Full snapshots go to a private Cloudflare R2 bucket, because third-party pages should not be republished in a public repo. Snapshots for published pieces are kept indefinitely; those for held drafts for 90 days. If the store is unreachable at verify time, the run fails closed.
- **Dependencies** stay few, and every version is pinned exactly and installed from the lock file (`npm ci`). Runtime: Zod and yaml (gate); Astro with `@astrojs/mdx`, `@astrojs/markdown-satteri`, `@astrojs/rss`, `@astrojs/sitemap` and sharp (site, for the share-image PNG). Build, test and audit tooling only: TypeScript, tsx, Vitest, `@types/node`, `@astrojs/check`, parse5, fast-xml-parser, fast-xml-validator, diff, satteri, lighthouse and chrome-launcher. The Anthropic SDK, a text-extraction library and a feed parser arrive with the Desk (Plan 2).

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
| Named human byline | Byline discloses automation: the author is always `Robywire Desk` (G1 rejects any other name) and the article byline reads `Robywire Desk · automated, with sources linked`; both are constants in the gate package (`DESK_AUTHOR_NAME`, `DESK_BYLINE_LABEL`), and the label does not say "verified" until G10 runs | Principle 5; wording is the owner's and still to be confirmed. |
| Open question: where corrections live | In the ledger and `/corrections`; a notice appears at the top of the article and `updatedAt` is set (the byline shows `Updated <date>`, JSON-LD `dateModified` uses it, and the build refuses a piece whose `updatedAt` is not the UTC day of the latest correction or retraction recorded for it, or that has one with nothing recorded) | Resolves contract open question 3. |
| `/rss.xml` and `sitemap.xml` | Feed items carry title, description, link, date and categories only, never article text; the sitemap is `sitemap-index.xml` plus `sitemap-0.xml`, named in `/robots.txt` | Copyright principle: the article and its receipts are the place to read; discovery is kept. |
| Slug collision: year, then month | Year, then month, then day (`slug-YYYY-MM-DD`) as a last resort, from the piece's `publishedAt` and never the clock; if all four are taken the run fails closed | A third repeat in a month must not fail the run. |

## 11. Site design

The house register: quieter, thinner, greyer; color only where it means something.

- System fonts only (no font requests); hairline rules; no rounded corners; one reading column of about 65 characters; light and dark follow the system setting, no toggle.
- Blue marks anything that links to a receipt. Green and red appear only in gate results.
- Analysis sentences carry the plain text label `Analysis.` and attributed sentences from another outlet carry `Unconfirmed.`; no italics anywhere.
- **Home:** today's piece leads, then recent pieces by beat. A thin strip shows live ledger numbers: pieces published, claims verified, drafts held, last run time.
- **Pages:** `/`, `/news/[slug]`, `/news/[slug]/receipts`, `/topics/[beat]`, `/method` (the gate rules in plain English as the code enforces them, the known limits of the checks, which parts of the Desk are not running yet, and the eval scoreboard with its caveat that it is a floor, not a proof; every sentence whose tense depends on a part of the Desk being live is written from one switchboard and says what is not running in the future tense, and is tested for every setting), `/status`, `/holds` (what the gate stopped and why, never the held text), `/corrections`, `/rss.xml` (one item per piece, no article text), `/sitemap-index.xml` and `/sitemap-0.xml`, `/robots.txt`, 404.
- **Fact card:** a generated SVG per piece built from its own claims, shown on the article page as an inline figure in the colours of the design tokens (so it follows light and dark), and also used as the share image (`card.svg`, `card.png`). It draws up to three figures, from tier-1 claims only, each with its basis in plain words (datasheet, press release, filing, measured and so on); a figure from another outlet is never drawn. The audit fails an article without it.
- **Quality bar:** AA contrast, skip link, visible focus, minimal motion, Lighthouse 95 or higher, `NewsArticle` JSON-LD per post.

## 12. Error handling

- **Fetch:** timeouts and 5xx get bounded retries with backoff. `robots.txt` is respected and never worked around. An unreachable source has its `sources.yml` status updated and is skipped. A story whose tier-1 source is unreachable is never rewritten from a competitor's reporting; it is held in attributed form.
- **Model calls:** bounded retries on 429 and 5xx. Schema-invalid output gets one repair attempt, then the stage fails. Truncation or refusal fails the stage.
- **Gate failure** is the expected path: up to two revision rounds, then hold as a draft PR. A held draft that the owner decides to publish is released with `release: owner` recorded in its ledger; the receipts page says so and each attributed sentence carries `Unconfirmed.`
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
| 0 | Foundations: repo, workspaces, schemas, CI skeleton, `sources.yml` | Typecheck passes and the CI workflow runs exactly the steps of `npm run verify` (tested); the first green GitHub Actions run, including Lighthouse on ubuntu-latest, is an entry check for the pipeline work and happens when the repo is pushed (needed by milestone 4 at the latest) |
| 1 | Gate, built test-first against the seeded-defect fixtures | 100% of deterministic defects caught |
| 2 | Site shell and design system, rendered from fictional fixture pieces generated from the golden piece (each variant is run through the real gate and renderer, and `fixtures:check` fails on drift) | Build, schema, link and Lighthouse checks pass |
| 2+ | Hardening pass added after review (inside Plan 1 it is called "Milestone 3"; this table's milestone 3 is the pipeline): headings, first words and number words are checked text, limitation sentences are grouped and must cover every claim that needs one, the article, title and description are written from the ledger, attributed sentences are labelled, the fact card is shown with honest figures, and the copy says only what is running | `npm run verify` green from a clean install; every seeded defect caught |
| 3 | Pipeline stages, `desk run --dry`, `desk replay`, verifier evals | A full dry run on real sources; baseline verifier numbers recorded |
| 4 | Automation: Actions cron, Cloudflare deploy, `/status`, hold-PR flow, retract CLI | A forced failure produces a hold PR, not a publish |
| 5 | Shadow week (5 dry days) | Verifier thresholds written down and frozen |
| 6 | Go-live and 14-day burn-in | Definition of done (§2) met |

Milestones 1 and 2 are independent and can be built in parallel; milestone 3 needs both. The earliest finish is the build time plus 19 calendar days (5 shadow + 14 live).

Implementation is planned in three plans: Plan 1 covers milestones 0–2 (foundations, gate, site) plus a hardening pass added after review (its tasks 71–88, which the plan calls "Milestone 3"; that is not this table's milestone 3); Plan 2 covers milestones 3–4 (pipeline and automation); Plan 3 covers milestones 5–6 (shadow week and burn-in, which are operational rather than code).

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
