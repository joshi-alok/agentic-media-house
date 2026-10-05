# Robywire

Robywire is a daily robotics news site. The Desk is the pipeline that writes it. A piece publishes without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify is held for the owner.

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).

## Repository layout

| Path | What it is |
|---|---|
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
| `docs/` | Specs and plans. |

The workspace packages export their TypeScript source directly, so there is no build step for them.

## Source registry

`sources.yml` is the tiered registry of where stories come from.

- Tier 1 (primary) sources are what the Desk writes from: a company's own announcement, a paper, a filing, a standard, a results sheet.
- Tier 2 (secondary) sources are what the Desk discovers from: other outlets' feeds that say something happened. They are never the sole source of a claim.

If a story has no reachable tier-1 source, that fact goes in the piece. It is never quietly laundered through a competitor's reporting.

Every `status` starts as `unverified`; the Desk changes it as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Requirements

- Node 22.19 or newer (`.nvmrc` says 22, which installs the latest 22.x; Lighthouse needs 22.19) and npm 10 or newer.
- A POSIX shell: macOS, Linux or WSL. The fixture build sets an environment variable in the usual shell way.
- Google Chrome, for `npm run lighthouse` only. It is found automatically; to use another Chrome or Chromium, set `CHROME_PATH` to its executable.

## Commands

Run everything from the repository root.

| Command | What it does |
|---|---|
| `npm ci` | Install exactly what `package-lock.json` pins. |
| `npm run typecheck` | `tsc` in `gate` and `evals`, and `astro check` in `site`. |
| `npm test` | Vitest in every workspace. |
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A16 on `site/dist`: HTML, links, receipts, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
| `npm run verify` | All of the above in CI order: typecheck, tests, seeded evals, fixture drift, production build, production audit, fixture build, fixture audit, Lighthouse. |

`npm run build` and `npm run build:fixtures` both write `site/dist`, so the second replaces the first. `npm run verify` runs them in the order that each audit needs.

For local work on the pages, run `ROBYWIRE_FIXTURES=1 npm run dev --workspace @robywire/site`.

## Fixtures

Until the Desk has published something there is nothing real to show, so the site is built and tested on made-up pieces. All of it is fictional: the company is Fixture Robotics, the product is the FX-1, and every address is on `*.example`. The outlet that one piece cites, Mercer Wire, is made up too.

- `npm run fixtures:generate --workspace @robywire/site` writes the fixture pieces, their ledgers and a desk state into `site/src/content-fixtures/`. It starts from the golden piece in `gate/src/fixtures/`, makes variants of it, and runs each through the real gate and the real renderer, so the fixtures are what the Desk will produce.
- Five pieces are made. Four are ordinary: the gate clears them and their ledgers say `release: auto`. The fifth (FX-5) rests on one sentence that Mercer Wire reported, so the gate holds it (`TIER2_ATTRIBUTION`). It stands for a draft that the owner then released: its ledger says `release: owner`, its article carries the Unconfirmed. label, and its receipts page says who released it.
- The generated files are committed. `npm run fixtures:check` fails if they are out of date.
- The site reads `site/src/content-fixtures/` only when `ROBYWIRE_FIXTURES=1`, which `npm run build:fixtures` sets. Otherwise it reads `site/src/content/`, which holds no pieces. A fixture build shows a ribbon at the top of every page that reads FIXTURE DATA and says it is not real reporting. A production build has neither the ribbon nor the words Fixture Robotics anywhere, and `npm run audit:prod` fails if it does.

## What the site refuses to build

A piece is two files: the MDX that readers see and the ledger JSON behind its receipts. `site/src/lib/match-pieces.ts` joins them and stops the build, with a message that names the piece, when they do not belong together:

- the ledger has no piece, or the piece has no ledger, or their slug, title, date or categories differ;
- the body of the MDX is not exactly what `renderBody` (in `gate/src/render/body.ts`) writes from the ledger, so a hand edit of the article, or of the ledger, is caught on the first build;
- a correction or retraction is recorded in the desk state for the piece and its `updatedAt` is not the day of the latest one, or it has an `updatedAt` and nothing is recorded.

## The audit

`npm run audit` reads the built pages in `site/dist` and checks them against the rules of the design and of the content. The checks are listed, with a sentence for each, in `site/scripts/audit/checks.mjs`; every check has a test that gives it a page it must accept and a page it must reject. They include: every page parses and has one `h1`, a title, a description and a skip link; no images, no italics, no web fonts, no border over one pixel, no rounded corner; every colour is one of the design tokens in `site/src/styles/tokens.css`; every internal link and `#fragment` resolves; every article links to its receipts page and has `NewsArticle` data; every claim marker in an article leads to its claim; and the feed, the sitemap, `robots.txt` and the 404 page are there and agree.

## Reading the scoreboard

`npm run evals:seeded` is the proof that the gate works. It takes one golden piece, breaks it in a known way once for every failure code of the nine checks, and fails if the gate misses any. It writes the result to `evals/scoreboard/seeded.json`, which is committed; a test fails if the committed file is out of date, so run the command and commit the file after any change to the gate.

The site shows the same file on its `/method/` page, under the headline `N of N seeded defects caught`. Each row is one defect:

- `id` names the defect, for example `swapped-number` (a sentence says 83 kg where the cited claim says 38 kg).
- `check` and `code` are the rule and the failure code that should catch it, for example G4 and `G4_NUMBER_UNSUPPORTED`.
- `caught` is `true` when the gate reported that code, and `false` when it did not. A `false` fails the tests, and the page would show it in red as `missed`.
- `baselinePasses` says that the unbroken golden piece publishes, so a catch means the gate saw the defect and did not simply reject everything.

The scoreboard is a floor, not a proof. It says the gate catches the defects that were thought of; it says nothing about the ones nobody seeded. The independent model check and its measured accuracy come later and are not part of the scoreboard.

## CI

`.github/workflows/ci.yml` runs the steps of `npm run verify` one by one on every push to `main` and on every pull request, and `site/test/verify.test.ts` fails if the two lists differ. Chrome is already installed on the `ubuntu-latest` runner.
