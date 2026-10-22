# The Desk, blog first — redesign for AI agents in crypto (Plan 3 design)

**Date:** 2026-10-20
**Status:** Draft for owner review (direction approved in chat on 2026-10-20: "go" to the scope below)
**Supersedes:** [the Desk design](./2026-10-04-the-desk-design.md) §1 (goal), §3 (scope), §6 (tier-2 rule), §7 (gate), and the "tune prompts, never rules" decision in [the automation design](./2026-10-06-the-desk-automation-design.md) §10. Everything else in those documents (stages, evidence store, receipts, workflows, budgets) stands.
**Built by:** Sonnet 5.5, same author-then-replay method as Plans 1 to 2b.

---

## 1. Why this exists

The owner wanted a blog: research, write and publish by itself, daily. What was built is a press-release fact checker with a site attached: one format (`news`, 600 to 850 words), written only from one primary page, where every sentence must trace to a quoted span and may add no capitalised word, number or heading word the span lacks.

The first real-model trials (`runs/tune-first-4.out`, `runs/tune-five-1.out`: 6 page-trials, 5 vendors) show it cannot publish:

- **0 of 6 passed.** After two revision rounds the one failure left on every page was `G2_BODY_LENGTH`. A press release leaves 3 to 8 surviving claims; the rules allow nothing else to be said, so 600 words cannot be written.
- **The model verifier (G10) never ran.** "Not asked (the gate found failures in every round)." Word-level rules stop every draft before the one check that judges meaning.
- **Three prompt-tuning commits** fixed one page and broke the next. The decision "tune prompts, never rules" is reversed here, on that evidence.

Two root causes: the **source model** (one primary page; a trade-press story always holds, `HOLD_TIER2` in `gate/src/checks/g6-sourcing.ts`) and the **gate model** (it tries to prove meaning with word rules, and every rule fails closed on ordinary prose).

## 2. The product

**Agentic Media House** is a blog about the agentic future in crypto: AI agents that hold keys, pay, transact and prove who they are on-chain. A reader should come away understanding something. Posts explain, compare and may take a view; sources are linked inline; a post says plainly that an automated pipeline wrote it. Verification is a layer under the writing, not the product.

**In scope:** payments and commerce between agents; agent wallets, keys and account abstraction; identity, reputation and trust; protocols and standards (ERCs and EIPs, agent-payment protocols, agent-tool protocols that touch money); agent infrastructure (execution, data, compute); security incidents involving agents; regulation and policy that touches any of it; funding of such projects as facts (who raised how much, from whom).

**Out of scope, and enforced:** token prices and market moves, trading signals, "which token to buy", airdrop or yield-farming guides, promotion of any token or project, affiliate or sponsored content. The Desk holds no position in anything and says so on `/method`.

**Beats (closed vocabulary, replaces the seven robotics beats):** `payments-commerce`, `identity-trust`, `wallets-keys`, `protocols-standards`, `agent-infrastructure`, `security-incidents`, `policy-regulation`. Cross-tag: `funding`.

## 3. Formats

Two formats, both built from the same structured draft and the same renderer; a format is a **profile** of thresholds and prompt wording, chosen by the run and passed to the gate through its existing `GateConfig` overrides. The frontmatter gains `format: digest | explainer`; the content collection keeps the name `news` and the URL path `/news/<slug>`.

| | `digest` | `explainer` |
|---|---|---|
| What | The day's agent-in-crypto stories, 3 to 7 items, each a heading and 1 to 3 sentences with its source linked | One standard, protocol, paper, repo or post-mortem explained: what it does, how, what is new, what is unresolved |
| Sources | Per item: a primary source preferred; a secondary outlet allowed with attribution | At least one primary document; technical claims only from primary documents |
| Body words (target) | 150 to 500 | 500 to 1,400 |
| Takeaways | none | 3 to 5 |
| Analysis share (target) | up to 35%, one "why it matters" sentence per item | up to 40% |
| Minimum surviving claims | 3 in all, at least 1 per item | 5 |

Which format a run writes is a rule, not a model choice: an `explainer` on the days in `explainerDays` (default Tuesday and Friday) when the shortlist holds a primary-document candidate; otherwise a `digest` when at least `digestMinItems` (default 3) stories qualify; otherwise `no-story`. The select model still chooses the stories within the format.

## 4. Sources

The two tiers become two **roles**, and the rule "no primary source means hold" goes. In the code, tier 1 stays the name of the primary role and tier 2 of the secondary one (the schemas, codes and tests keep `tier`; only reader-facing words say primary and secondary).

- **primary:** a document that originates the fact. Spec and standard texts (ERCs, EIPs, protocol specifications), code repositories and their release notes, project documentation, governance proposals and votes, a project's own announcement or post-mortem, regulator releases and filings, audits, papers.
- **secondary:** trade press and newsletters. Used to **discover**, and in a digest to **report with attribution** ("CoinDesk reports…"). Never the basis of a technical claim in an explainer.

Rules that replace §6 of the first design:

1. A secondary-sourced fact sentence must name its outlet and be marked `attributed` (a blocker, as today); the page labels it "Reported by <outlet>". It **no longer forces a hold**.
2. At most half of a digest's items may rest on a secondary source alone (a warning, `G6_SECONDARY_SHARE`), and such an item is at most two sentences with no more than 15 words quoted. Rewriting other outlets' stories at length is bad journalism and what Google's scaled-content-abuse policy names; `sources.yml` already says so.
3. **Bases** (the label on how a claim is known) change from robotics to crypto: `spec` (ERC, EIP, protocol specification), `code` (repository or contract source), `onchain` (chain data read directly), `governance` (proposal or vote), `filing` (regulator filing or release), `paper`, `docs` (project documentation: the project's own statement of intent), `announcement` (project press release or blog post), `reported` (secondary). **Safe bases** (no "What we couldn't verify" note needed): `spec`, `code`, `onchain`, `governance`, `filing`, `paper`. `docs`, `announcement` and `reported` are not safe. The `status` vocabulary (`demonstrated`, `deployed`, `planned`, `unspecified`) stays; "deployed" now includes "live on mainnet".
4. **Discovery uses only what the fetcher already reads:** RSS and Atom feeds and HTML pages. GitHub release and commit Atom feeds, Discourse forum RSS and the arXiv API (Atom) cover specs, code, governance and papers with no new fetcher.

**`sources.yml` is rewritten.** Starting list, every entry `unverified` until the free pre-check (fetch, robots and kind only, no model) has run:

- **primary / standards and code:** the ERCs repository, the Ethereum Magicians forum, the repositories of the agent-payment and agent-tool protocols the owner names, the Ethereum Foundation blog.
- **primary / projects:** developer and engineering blogs of the exchanges, wallets and protocols the owner names.
- **primary / regulators:** SEC, CFTC and ESMA press releases.
- **primary / research:** arXiv API for `cs.CR`, `cs.MA` and `cs.AI` filtered to agent plus blockchain, smart-contract or payment terms; IACR ePrint.
- **secondary:** CoinDesk, The Block, Decrypt, Blockworks, DL News, Bankless, The Defiant.

The owner supplies the project and protocol names (the industry is theirs); the first plan task is the pre-check. A source whose robots rules refuse the Desk's fetcher is marked `blocked` and skipped, as today.

## 5. The gate: blockers and notes

Today every failure sends the draft back for revision and a tier-2 fact adds a hold. The gate gains a third output.

- `CheckOutput` gains `warnings: Failure[]`; `GateResult` gains `warnings`. A per-code table (`SEVERITY` in the gate's config) says which codes are blockers and which are notes. Routing is unchanged: any blocker is `revise`, any hold reason is `hold`, otherwise `publish`.
- **Notes never block, never go back to the composer, and never stop G10 from running.** They are written to the ledger (`gate.warnings`) and listed on the piece's receipts page, so the cost of leaving a rule soft is public and measurable.

| Group | Codes | Becomes |
|---|---|---|
| Frontmatter and structure the renderer needs | `G1_*`, `G2_HEADING_EMPTY`, `G2_HEADING_RESERVED`, `G2_SECTIONS_MIN`, `G2_LIMITATIONS_MISSING`, `G2_LIMITATION_COVERAGE` | **blocker** |
| Coverage | `G3_*` | **blocker** |
| Numbers, dates, quantities | `G4_NUMBER_UNSUPPORTED`, `G4_DATE_UNSUPPORTED`, `G4_VALUE_NOT_IN_SPAN`, `G4_HEADING_NUMBER`, `G4_HEADING_QUOTE` | **blocker** |
| Quotes | `G5_QUOTE_NOT_VERBATIM` | **blocker** |
| Sourcing | `G6_TIER2_UNATTRIBUTED`, `G6_TIER2_IN_ANALYSIS`, `G6_TIER2_BASIS`, `G6_TIER1_REPORTED` | **blocker** |
| Analysis cannot add a figure | `G7_ANALYSIS_NEW_VALUE`; `G7_ANALYSIS_PLACEMENT` narrowed to the title and description only | **blocker** |
| Limitation templates | `G8_*` (written by code from claim metadata) | **blocker** |
| Duplicates and policy | `G9_SLUG_COLLISION`, `G9_TITLE_DUPLICATE`, new `G9_POLICY_PHRASE` | **blocker** |
| Length and shape | `G2_OPENING_LENGTH`, `G2_TAKEAWAYS_COUNT`, `G2_BODY_LENGTH`, `G2_HEADING_QUESTION`, `G2_HEADING_TOO_LONG`, `G7_ANALYSIS_SHARE` | **note** |
| Word-level names and quantities | `G4_NAME_UNSUPPORTED`, `G4_HEADING_NAME`, `G4_NUMBER_WORD_UNCHECKABLE` | **note** (G10 judges meaning) |
| Style | `G9_BANNED_PHRASE`, `G6_SECONDARY_SHARE` | **note** |
| Deleted, with their tests | `G4_INITIAL_WORD_UNSUPPORTED`, `G2_SENTENCE_START` (they exist only to feed the first-word rule), the `HOLD_TIER2` hold reason | removed |

**The policy check (`G9_POLICY_PHRASE`).** A small deterministic list, in config, that turns the scope line into code: price-direction predictions ("will rally", "is set to crash", "price target"), advice constructions ("you should buy", "worth buying", "buy the dip"), hype ("100x", "to the moon", "guaranteed returns"), and cashtags (`$` followed by a ticker). It does not ban "buy" or "sell" alone, because agents buy compute and sell API access. A false positive sends the draft back for one revision; it never publishes. The list is a starting point and grows from the shadow week.

**Identifier tokens.** Crypto text is full of tokens that look like numbers or names: `ERC-8004`, `x402`, `EIP-4337`, `USDC`, `v2`, `0x…` addresses, `$20M`. The number checks (blockers) must treat an identifier that a claim lists as a name value as a name, not as a number. This is the main technical risk of the move and is covered by crypto fixtures written before the domain swap (§8, step 2).

**G10, the model verifier, becomes the one place meaning is judged.** It runs on every draft that has no blockers. Any "not entailed" or "ambiguous" verdict still holds the piece after two revision rounds, as today. Its calibration (thresholds frozen against the labelled set) is part of the acceptance in §9.

**Code-written parts stay code-written:** the title, description, limitation sentences, bylines, the receipts and a footer on every post, "Not financial advice. Written by an automated pipeline; every claim links to its source." The byline label stays "automated, with sources linked".

## 6. Prompts and the extract stage

- **Compose** is rewritten around the blockers only: cite every fact sentence; take every number, date and quantity from the cited claim; quote verbatim; attribute anything from a secondary outlet; mark analysis; no prices and no advice. The paragraphs about first words, capitalised names and heading words are deleted. A voice section is added per format: plain, specific, written for builders, explains why a detail matters, no hype. The target lengths come from the profile and are described as targets, so the model is not pushed to pad.
- **Select** gets the new editorial bar (in `sources.yml`): publish a story if a standard moved a stage, a protocol shipped or changed, an agent-related incident was written up, money moved with a named amount, a regulator acted, or a paper shows a result that can be read; do not publish price talk, rumours, partnerships with no deliverable, or a restatement of another outlet's story.
- **Extract** keeps its rules. One change, because the trials show a claim lost to a cosmetic rule in 5 of 6 pages: a label longer than six words is **shortened by code** to its first six words (all of which are words of the quotation, so the grounding rule still holds) instead of dropping the claim. Anything further waits for the numbers from the first trials of this design.
- **Verify** prompts add the formats and keep the verdict vocabulary.

## 7. What changes in the repository

| Package | Change |
|---|---|
| `gate` | severity table and `warnings` output; edits to `g2`, `g4`, `g6`, `g7`, `g9`; new `BEATS`, `BASES`, `SAFE_BASES`, `DEFAULT_BANNED_PHRASES`, policy list; `format` in the frontmatter schema; `gate.warnings` in the ledger schema; profiles; a new golden piece and fixtures in the crypto domain; seeded-defect cases for every blocker and **"must not block" cases for every note** |
| `desk` | prompts (select, extract, compose, verify); select stage (format rule, secondary allowed); verify stage (notes pass through, G10 order); config (`explainerDays`, `digestMinItems`, profiles); demo world and story; `tune` text |
| `site` | copy, `/method` limits and rules page, home page, topic pages for the new beats, a format chip, "Reported by" label, the notes list on receipts, fixtures |
| root | `sources.yml`, `README.md`, memory of the project |

Names inside the code keep `@robywire/*` and `ROBYWIRE_FIXTURES`; renaming them stays a separate, optional decision.

## 8. Order of work

1. **Test the diagnosis first, on the robotics pages already saved.** Add the severity table and the `warnings` output, re-point the profile at a short "brief" range (150 to 500 words), delete the `HOLD_TIER2` line, and re-run `desk tune` on the five saved pages (`runs/tune-urls.txt`; the page text is local, so no refetch). Cost about US$0.50. **Pass:** at least 3 of the 5 compose a draft with no blockers within two revision rounds and G10 runs on them. **Fail:** the diagnosis is wrong and we stop and re-plan; nothing else is built on it.
2. **Crypto fixtures** (identifier tokens, dollar amounts, versions, addresses) and the G4 changes they require, test-first.
3. **Domain swap:** beats, bases, banned and policy lists, golden piece, site copy and fixtures. Mechanical.
4. **Formats and the format rule;** profiles; digest and explainer prompts.
5. **`sources.yml` and the free pre-check** with the names the owner supplies.
6. **Live trials** (§9), then the shadow week and the go-live steps already written in the 2b runbook.

Steps 1 to 4 are replayable offline like the earlier plans; 1 and 6 spend money and each stops for the owner's go.

## 9. Done means

1. `npm run verify` green; every blocker has a seeded-defect case that is caught; every note has a case that is **not** blocked; the severity table has a test that fails when a code is missing from it.
2. **Live trial, US$3 at most:** on 10 real inputs (5 digest candidates, 5 explainer candidates), at least 7 compose a piece with no blockers within two rounds, G10 runs on all 10, and every piece that reaches `publish` has a ledger whose notes are listed.
3. **The owner reads 5 of those pieces** and would publish at least 4 under their name. Every issue they find becomes a recorded case (a blocker, a note or a prompt line), whichever fits.
4. The verifier's score on the labelled set is measured once with the real model and the thresholds are frozen (the open item from the first design).
5. Shadow week, then the 14-day run, as already defined; "at least 10 of 14 days publish a piece" now counts digests and explainers alike.

## 10. Risks

| Risk | Mitigation |
|---|---|
| G10 returns "ambiguous" often and holds persist | Measured in step 1; a hold stays a draft pull request, never silence; the ambiguity rate is reported after every trial |
| Identifier tokens break the number checks | Fixtures first (step 2); names that a claim lists are accepted as names |
| Secondary sources turn the digest into rewritten news | Attribution is a blocker; share cap and quote limit; outlets are linked, never paraphrased at length |
| Crypto readers act on a post as advice | Scope excludes prices and recommendations; policy blocker; footer on every post; `/method` states it |
| A wrong figure in a stale post | Every figure is "as stated in the source on its date", the receipts show the retrieval time, corrections stay public |
| Large mechanical change touches many tests | Severity is a table, not new code paths; notes keep their existing tests as "emits a note"; the plan is mostly renames and deletions |
| Legal or reputational exposure of a public crypto site | Out of this spec; the owner decides on a disclosure and jurisdiction review before go-live and tells me what the byline and `/method` must say |

## 11. Out of scope

On-chain verification of figures (reading Etherscan, DefiLlama or Dune and checking a claim against the chain, which would be the strongest form of "primary" here: a later version); newsletter, social posting, search, comments; a custom domain; renaming the `news` path or the internal package scope; any outreach.

## 12. Decisions made here, for you to veto

- The beat names in §2 and the two formats in §3.
- Explainers on Tuesday and Friday, a digest on the other days, `no-story` when there is nothing.
- Most word-level rules become **notes** rather than being deleted, so their hit rate stays visible; only the two first-word rules and the tier-2 hold are removed.
- The policy list is a **blocker**, not a note.
- Secondary sources may be reported with attribution, with a one-half share cap in a digest.
- The footer wording in §5 and the "Reported by" label are placeholders for your wording.
