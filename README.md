# Robywire

Robywire is a daily robotics news site. The Desk is the pipeline that writes it. A piece publishes without a human only when a code-based gate verifies that every factual sentence traces to a quoted span in a primary (tier-1) source. Anything the gate cannot verify is held for the owner.

The full design is in [`docs/superpowers/specs/2026-10-04-the-desk-design.md`](docs/superpowers/specs/2026-10-04-the-desk-design.md).

## Repository layout

| Path | What it is |
|---|---|
| `gate/` | `@robywire/gate`: pure functions implementing gate checks G1 to G9. No network, no models. |
| `evals/` | `@robywire/evals`: the seeded-defect harness that proves the gate catches what it should. |
| `site/` | `@robywire/site`: the Astro static site. |
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

Node 22 (see `.nvmrc`) and npm 10 or newer.

## Commands

Run everything from the repository root.

```bash
npm ci               # install exactly what package-lock.json pins
npm run typecheck    # tsc in every workspace that has a typecheck script
npm test             # Vitest in every workspace that has a test script
```

`npm run verify` runs every check in CI order: typecheck, tests, seeded-defect evals, fixture drift, production build and audit, fixture build and audit, then Lighthouse. It arrives with the site milestone. Until then `typecheck` and `test` are the checks that exist.
