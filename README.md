# Agentic Media House

Agentic Media House is a robotics news site, and the Desk is the pipeline that will write it. A piece will publish without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify will be held for the owner. This repository holds the gate, the ledger format, the renderer, the site and the Desk itself. The Desk is built and tested offline, with scripted models; it has not yet run against live sources or a live model, and nothing it writes has been published (see Which parts are live and The desk workspace).

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).

## Repository layout

| Path | What it is |
|---|---|
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9, and the renderer that turns a checked draft into a page. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `desk/` | `@robywire/desk`: the Desk pipeline, built and tested offline: the model layer, the seven stages, the orchestrator, replay, the command line and the verifier evals. |
| `site/` | `@robywire/site`: the Astro static site, and the scripts that audit it (`site/scripts/`). |
| `sources.yml` | The tiered source registry: where the Desk writes from and where it discovers stories. |
| `docs/` | Specs and plans. |

The workspace packages export their TypeScript source directly, so there is no build step for them.

## Source registry

`sources.yml` is the tiered registry of where stories come from.

- Tier 1 (primary) sources are what the Desk writes from: a company's own announcement, a paper, a filing, a standard, a results sheet.
- Tier 2 (secondary) sources are what the Desk discovers from: other outlets' feeds that say something happened. They are never the sole source of a claim.

If a story has no reachable tier-1 source, that fact goes in the piece. It is never quietly laundered through a competitor's reporting.

Every `status` starts as `unverified`, except the two that the original list already had: `blocked` for the arXiv feed, which the fetcher cannot reach, and `n/a` for the funding announcement, which has no fixed address. The Desk changes the others as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Which parts are live

`site/src/lib/live.ts` is the switchboard for the parts of the Desk that do not yet run for real: the private evidence store (the Desk keeps its evidence in a folder on disk; the bucket is not built), the independent model check (built and tested with scripted models, and measured on no real model), the daily schedule (not built) and the pipeline that writes and publishes (built and tested offline, and it has never published a real piece). Its four flags are all `false`. Every sentence of the site whose tense depends on one of them (the footer, the receipts intro, the home and feed descriptions, and most of the method page) is written by a function in `site/src/lib/copy.ts` that takes the switchboard, and `site/test/copy.test.ts` says what each function writes for all sixteen settings of the flags. It also fails if a page or another file writes such a sentence itself. When a part really runs, turn its flag on and let the tests name the sentences that change.

## The desk workspace

`desk/` (`@robywire/desk`) is the pipeline that will write the site. It is built and tested with no network and no API key: every test runs on made-up pages and a scripted model. `desk/test/setup/no-network.ts` runs before every test file and makes `fetch`, `net.connect`, `http.request` and `https.request` (and the lookup of a name) throw "network is not available in tests", so that a test that forgets to give the code a stand-in for the web fails at once and says what it tried to do. The guard is a safety net and not a proof: a test that started a child process that connects, or loaded a native module, could get through it. What keeps the tests offline is that each one gives the code its own stand-in.

- **Settings.** `desk/src/config.ts` has every setting of a run: how recent a story must be, how many candidates reach the selecting model, the fewest claims a piece needs, the rounds of revision, the politeness of the fetcher, the budget of a run, the model for each role, and the folders `runs/` and `evidence/`. `loadConfig` refuses a setting it does not know or a value that is not allowed.
- **Models.** One interface, `ModelClient`, that cannot express a tool, so no stage can offer a model one. A client that answers from a script (`FakeClient`), one that replays recorded replies (`RecordedClient`), one for the Anthropic API (`AnthropicClient`, tested only against a stand-in for the network), and wrappers for a budget and for retries. Text from the web reaches a model only inside delimited blocks, under a system prompt that says it is data.
- **Stages.** Discover, Select, Fetch, Extract, Compose, Verify, then Publish or Hold. Models propose and code disposes: code finds every quotation in the page and every claim's figures and names in its quotation, the gate (`gate/`) checks every sentence, an independent model check judges meaning, and only what fails goes back to the composer, at most twice. A piece that cites another outlet is never published by itself. Any error ends the run as `failed`, with nothing published.
- **A run.** Each stage writes its artifact into `runs/<date>/`, checked against a schema: `01-discover.json` to `06-verify.json`, a held draft in `held/`, the record `run.json`, and the recorded model replies in `cassettes/`. The pages it read are kept by their hash in `evidence/`. A run takes a lock, a day is run once unless `--force-new` says otherwise, and every run that is not dry makes exactly one commit: the piece, its ledger and the desk state for a piece that is published, and the desk state alone for a hold, a day with no story or a failure. Git ignores `runs/` and `evidence/`.
- **Replay.** `desk replay` runs Extract, Compose and Verify again from the pages in the evidence store and the recorded replies, and says whether each artifact is the one the run stored.

Not built, and left for the next plan: the GitHub Actions workflow that runs the Desk every day, the Cloudflare deploy, the pull request that carries a hold to the owner, the command that records a correction or a retraction, the private evidence bucket, turning on the flags of `site/src/lib/live.ts` (and rewriting the copy that goes with them), tuning the prompts against a real model (they are written, and checked only against scripted models), measuring the verifier on a real model, and a client that uses a Claude subscription instead of an API key.

## The desk command

`npm run desk -- <command>` is the command line of the Desk (`tsx desk/src/bin.ts`). Run it from the root of the repository; everything after `--` goes to the Desk.

- `npm run desk -- run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]` runs the pipeline once. A run that is not dry makes one commit; `--dry` writes the artifacts of the run and never touches `site/` or git. `--client api` (the default) needs `ANTHROPIC_API_KEY` in the environment; `--client recorded` replays the replies in `--cassettes`; `--client fake` is a scripted story. `--sources live` (the default) reads `sources.yml`; `--sources fixtures` is a made-up world with no network. The scripted client and the made-up world are only for dry runs, because nothing in them may be published. A day that already has a run is refused unless `--force-new` is given.
- `npm run desk -- replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>] [--config <path>]` runs Extract, Compose and Verify again from what the run kept, with no network, and says whether the artifacts are the same.
- `npm run desk -- status [--config <path>]` prints the last run and the number of holds, from the desk state.

`--config <path>` is the path of a YAML file of settings (from the folder the command is run in), laid over the defaults of `desk/src/config.ts`: how recent a story must be (`recencyHours`), how many candidates reach the selecting model (`shortlistMax`), the fewest claims a piece needs, the rounds of revision, the user agent, the budget, the models and the folders `runDir` and `evidenceDir`, which are below the folder the command is run in when they are relative. A file that cannot be read, or that has a setting that does not exist or a value that is not allowed, is a mistake in the arguments (exit code 2) and names the file and the setting. A live run (`--sources live`) with a user agent that links to an `.example` address is refused with exit code 2, because the default user agent links to agenticmediahouse.example, which does not exist: a live run needs a file of settings with the real address of the /method page. A run on the made-up world and a replay ask no site and are not refused.

The exit code is 0 for a run that published, held or found no story and for a replay that came out equal, 1 for a run that failed or was refused and for a replay that differs, and 2 for a mistake in the arguments.

`npm run desk:demo` runs the whole pipeline once as one command, `desk run --dry --client fake --sources fixtures`, and then replays the run. It exits 0 only if the made-up story ended published in a dry run, nothing was written to the site and git was not asked to commit, and the replay found every artifact equal. It is a step of `npm run verify`. The last line it prints says what it has shown, and what it has not: `desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality`. The model and the verifier of the demo are scripts written to pass, so it shows that the stages fit together and that a run can be replayed, and nothing about how well a real model writes or a real verifier judges.

## The verifier evals

`npm run evals:verifier` measures a verifier. `desk/evals/verifier-set.json` holds sixty sentences, each with the passages that it is judged against: for each of twenty sets of passages, one sentence that they support, one that says something they do not say, and one that changes what they say in a small way. `desk/evals/run-verifier.ts` runs a model client over the set through the verifier's own prompt and the reading of its reply that the Verify stage uses, and prints precision and recall by label and overall. With no arguments it runs a scripted verifier that knows the answers, which proves the wiring and measures no model. `--client api --model <name>` asks a real model (it needs `ANTHROPIC_API_KEY`), `--batch <n>` sets how many sentences go in one call, and `--min-precision` and `--min-recall` (numbers from 0 to 1) make the command exit with 1 when a score is below them. No floor is set: what a verifier must score is decided when real models have been measured.

## What the Desk does not check

Models propose and code disposes, and the code has limits. These are the ones that are known, so that nobody reads the checks as more than they are.

- **Text that a style sheet hides.** `extractPage` leaves out an element that hides itself in its own markup (the `hidden` attribute, `aria-hidden="true"`, an inline style of `display:none`, `visibility:hidden` or `font-size:0`) with everything in it, and it leaves out `<template>`. It does not read the style sheets of a page. Text that a class hides, that is moved off the screen, that is the colour of its background or that has an opacity of 0 is read as text of the page, and a quotation of it passes the check that the quotation is on the page. The content of `<details>` is kept on purpose: a reader sees it by opening it.
- **The date of a story that has none.** A headline link on a newsroom page has no date, so a story that is found there can be any age. The Fetch stage asks its page for one (`publishedAt` of `extractPage`: the structured data, the `article:published_time` meta tag, or the first `<time datetime>` of the article) and ends the run with no story, with the reason `stale-or-undated`, when the page gives none or one outside `recencyHours` of the run. A page can say what it likes about itself, so a page that claims to be new is believed: this stops an old announcement that sits on a newsroom page, and not a page that lies.
- **Which addresses the fetcher goes to.** `HttpFetcher` looks a host up before the first request and before every hop of a redirect, and refuses (the error kind `address`) a name that has any address that is not public (loopback, private, link-local, the metadata service of a cloud, shared, documentation, multicast), a host written as a number, `localhost` and an address with a user name in it. The name is looked up by this check and again by the transport, so a name server that answers differently the second time (DNS rebinding) is not stopped; closing that needs the transport to connect to the address that was checked. `FixtureFetcher` serves files and is not checked.
- **Analysis sentences.** Up to a fifth of the sentences of a piece may be the Desk's own analysis, which the page labels Analysis. The gate reads them for where they stand, how many there are, how they begin and the numbers, dates and names they bring in (G7), and the model check (G10) is never asked about them: it judges fact sentences and headings. Nothing reads what else an analysis sentence says, so a wrong analysis can be published. The share cap is what limits the exposure; it does not remove it.
- **Claim ids in a prompt.** The ids that a composer writes for the claims a sentence cites are strings, and the schema of its reply lets any string through. Before they are put in a prompt outside a block (the line in front of an item that is sent back for revision) they are filtered to the ids of claims that exist, which look like `c-1`; the rest are left out and logged.

## Requirements

- Node 22.19 or newer (`.nvmrc` says 22, which installs the latest 22.x; Lighthouse needs 22.19) and npm 10 or newer.
- A POSIX shell: macOS, Linux or WSL. The fixture build sets an environment variable in the usual shell way.
- Google Chrome, for `npm run lighthouse` only. It is found automatically; to use another Chrome or Chromium, set `CHROME_PATH` to its executable.

## Commands

Run everything from the repository root.

| Command | What it does |
|---|---|
| `npm ci` | Install exactly what `package-lock.json` pins. |
| `npm run typecheck` | `tsc` in `gate`, `evals` and `desk`, and `astro check` in `site`. |
| `npm test` | Vitest in every workspace. |
| `npm run evals:seeded` | Break the golden piece in known ways and check that the gate catches each one. Writes `evals/scoreboard/seeded.json`. |
| `npm run fixtures:check` | Regenerate the fixture content and fail, with a diff, if it differs from the committed files. |
| `npm run desk -- <command>` | The command line of the Desk: `run`, `replay` and `status` (see The desk command). |
| `npm run desk:demo` | Run the made-up story through the whole pipeline in a dry run, replay it, and fail unless it was published, nothing was written and the replay is equal. |
| `npm run evals:verifier` | Run the labelled set of sixty sentences through a verifier and print precision and recall (see The verifier evals). |
| `npm run build` | The production build, into `site/dist`. It reads `site/src/content/`, which has no pieces yet. |
| `npm run build:fixtures` | The fixture build, into `site/dist` (see Fixtures below). |
| `npm run audit` | Run the checks A1 to A12 and A14 to A17 on `site/dist`: HTML, links, receipts, the fact card, CSS rules, colours, feeds. Exits 1 on any problem. |
| `npm run audit:prod` | The same, plus A13: the build has no trace of the fixtures. Run it after `npm run build`. |
| `npm run lighthouse` | Measure the fixture build in `site/dist` with Lighthouse (home page, lead article and its receipts page, and the first article that carries the Unconfirmed. label with its receipts page) and fail if any score is under 95. |
| `npm run verify` | The checks in CI order: typecheck, tests, seeded evals, fixture drift, the Desk demo, production build, production audit, fixture build, fixture audit, Lighthouse. |

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

- the ledger has no piece, or the piece has no ledger, or their slug, date or categories differ;
- the `title` or the `description` of the MDX is not what `renderHead` (in `gate/src/render/head.ts`) gives from the title sentence and the description sentence of the ledger, or the `title` of the ledger is not its own title sentence;
- the body of the MDX is not exactly what `renderBody` (in `gate/src/render/body.ts`) writes from the ledger, so a hand edit of the article, or of the ledger, is caught on the first build;
- a correction or retraction is recorded in the desk state for the piece and its `updatedAt` is not the day of the latest one, or it has an `updatedAt` and nothing is recorded.

## The audit

`npm run audit` reads the built pages in `site/dist` and checks them against the rules of the design and of the content. The checks are listed, with a sentence for each, in `site/scripts/audit/checks.mjs`; every check has a test that gives it a page it must accept and a page it must reject. They include: every page parses and has one `h1`, a title, a description and a skip link; no images, no italics, no web fonts, no border over one pixel, no rounded corner; every colour, in the CSS and in the colour attributes of an inline SVG, is one of the design tokens in `site/src/styles/tokens.css`; every internal link and `#fragment` resolves; every article links to its receipts page and has `NewsArticle` data; every claim marker in an article leads to its claim; every article shows its fact card, a figure with a label that holds an inline SVG drawn in the tokens' colours; and the feed, the sitemap, `robots.txt` and the 404 page are there and agree.

## Reading the scoreboard

`npm run evals:seeded` is the proof that the gate works. It takes one golden piece, breaks it in a known way at least once for every failure code of the nine checks, and fails if the gate misses any. It writes the result to `evals/scoreboard/seeded.json`, which is committed; a test fails if the committed file is out of date, so run the command and commit the file after any change to the gate.

The site shows the same file on its `/method/` page, under the headline `N of N seeded defects caught`. Each row is one defect:

- `id` names the defect, for example `swapped-number` (a sentence says 83 kg where the cited claim says 38 kg).
- `check` and `code` are the rule and the failure code that should catch it, for example G4 and `G4_NUMBER_UNSUPPORTED`.
- `caught` is `true` when the gate reported that code, and `false` when it did not. A `false` fails the tests, and the page would show it in red as `missed`.
- `baselinePasses` says that the unbroken golden piece publishes, so a catch means the gate saw the defect and did not simply reject everything.

The scoreboard is a floor, not a proof. It says the gate catches the defects that were thought of; it says nothing about the ones nobody seeded. The independent model check and its measured accuracy come later and are not part of the scoreboard.

## CI

`.github/workflows/ci.yml` runs the steps of `npm run verify` one by one on every push to `main` and on every pull request, and `site/test/verify.test.ts` fails if the two lists differ. Chrome is already installed on the `ubuntu-latest` runner.
