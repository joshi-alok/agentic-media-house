import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DeskState, defaultContext, renderDraft, runGate } from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { GOLDEN_DRAFT, cloneGolden, makeTier2Variant, makeVariant } from '@robywire/gate/fixtures';
import { latestCorrectionDay } from '../src/lib/desk-state';

// Writes the fixture content the site shows when it is built with
// ROBYWIRE_FIXTURES=1: five news pieces with their ledgers, and a desk state.
// Everything is fictional (Fixture Robotics, the FX-1 family, *.example
// domains) and generated from the golden piece by the same renderer the real
// pipeline will use. Run it with `npm run fixtures:generate --workspace
// @robywire/site`; `npm run fixtures:check` fails if the committed files differ.

/** Where the committed fixtures live. */
export const FIXTURES_DIR = fileURLToPath(new URL('../src/content-fixtures/', import.meta.url));

export interface FixturePiece {
  slug: string;
  runId: string;
  input: GateInput;
  /**
   * What the fixture stands for. `publish` is an ordinary piece. `hold` is a piece that the owner released
   * after a hold: the gate clears it and the ledger says it was held.
   */
  route: 'publish' | 'hold';
}

// Each variant is the golden story about the next product, one day earlier. The last one is written the way
// a piece that rests on another outlet must be (see makeTier2Variant), so the gate clears it, and it is
// dated the day of the 'G10_AMBIGUOUS' hold in the desk state: the model check could not tell, and the owner released that draft.
const VARIANTS = [
  { n: 2, publishedAt: '2026-10-03', categories: ['humanoids'], tier2: false },
  { n: 3, publishedAt: '2026-10-02', categories: ['policy-standards'], tier2: false },
  { n: 4, publishedAt: '2026-10-01', categories: ['home-consumer', 'field-mobility'], tier2: false },
  { n: 5, publishedAt: '2026-09-29', categories: ['policy-standards', 'funding'], tier2: true },
];

const GOLDEN_RETRIEVED_AT = '2026-10-04T04:30:00Z';

/** The five fixture pieces as gate input: the golden piece and four variants of it. */
export function fixturePieces(): FixturePiece[] {
  const golden: FixturePiece = { slug: GOLDEN_DRAFT.slug, runId: 'fixture-run-1', input: cloneGolden(), route: 'publish' };
  const variants = VARIANTS.map(({ n, publishedAt, categories, tier2 }, at): FixturePiece => {
    const slug = GOLDEN_DRAFT.slug.replace('fx-1', `fx-${n}`);
    const input = makeVariant(cloneGolden(), {
      slug,
      publishedAt,
      categories,
      replace: [
        ['FX-1', `FX-${n}`],
        ['fx-1', `fx-${n}`],
        [GOLDEN_RETRIEVED_AT, `${publishedAt}T04:30:00Z`],
      ],
    });
    return { slug, runId: `fixture-run-${at + 2}`, input: tier2 ? makeTier2Variant(input) : input, route: tier2 ? 'hold' : 'publish' };
  });
  return [golden, ...variants];
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function deskState(all: readonly FixturePiece[]): DeskState {
  const [latest, corrected] = [all[0]!, all[1]!];
  return DeskState.parse({
    lastRun: { at: '2026-10-04T04:41:12Z', outcome: 'published', runId: latest.runId, slug: latest.slug },
    holds: [
      {
        at: '2026-09-30T04:38:05Z',
        categories: ['humanoids'],
        reasons: ['G4_NUMBER_UNSUPPORTED'],
        prUrl: 'https://github.example/agentic-media-house/agentic-media-house/pull/12',
      },
      { at: '2026-09-29T04:36:40Z', categories: ['policy-standards', 'funding'], reasons: ['G10_AMBIGUOUS'] },
    ],
    corrections: [
      {
        at: '2026-10-03T09:12:00Z',
        slug: corrected.slug,
        kind: 'correction',
        note: "The first version gave the arm's maximum reach as 1.6 m. The datasheet says 1.4 m, and the piece now says so.",
      },
    ],
  });
}

/** The reason that the hold of the fixture released by the owner goes by: the model check could not tell if a sentence was supported. */
const OWNER_HOLD_REASON = 'G10_AMBIGUOUS';

/**
 * Every fixture file as a map from its path under the fixtures folder to its
 * content, in sorted order. A piece that the gate does not clear stops the
 * generator: a fixture must be something the real pipeline could publish, by
 * itself or, for a hold, with the owner's release (the ledger says which). A
 * piece that has a correction in the desk state gets `updatedAt`, the day of
 * its latest one, as the site requires.
 */
export function fixtureFiles(all: readonly FixturePiece[] = fixturePieces()): Map<string, string> {
  const files = new Map<string, string>();
  const state = deskState(all);
  for (const piece of all) {
    const result = runGate(piece.input, defaultContext());
    if (result.route !== 'publish') {
      const codes = [...result.failures.map((failure) => failure.code), ...result.holdReasons].join(', ');
      throw new Error(`generate-fixtures: the fixture ${piece.slug} is not cleared by the gate (route ${result.route}: ${codes === '' ? 'none' : codes})`);
    }
    // A draft that the owner released was held: its ledger says route hold and gives the reasons of the hold, as the hold flow writes it.
    const gate = piece.route === 'hold' ? { ...result, route: 'hold' as const, holdReasons: [OWNER_HOLD_REASON] } : result;
    const updatedAt = latestCorrectionDay(state.corrections, piece.slug);
    const release = piece.route === 'publish' ? 'auto' : 'owner';
    const meta = { runId: piece.runId, gate, release, ...(updatedAt === undefined ? {} : { updatedAt }) } as const;
    const { mdx, ledger } = renderDraft(piece.input.draft, piece.input.claims, meta);
    files.set(`news/${piece.slug}.mdx`, mdx);
    files.set(`ledger/${piece.slug}.json`, json(ledger));
  }
  files.set('desk-state.json', json(state));
  return new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Write the fixture files under `outDir`. The `news` and `ledger` folders are
 * emptied first, so a piece that is no longer generated does not linger.
 * Returns the paths written, relative to `outDir`.
 */
export function writeFixtures(outDir: string): string[] {
  const files = fixtureFiles();
  for (const folder of ['news', 'ledger']) rmSync(path.join(outDir, folder), { recursive: true, force: true });
  for (const [name, content] of files) {
    const target = path.join(outDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return [...files.keys()];
}

/** The command line: `--out <folder>` writes somewhere other than the committed folder. */
export function main(argv: readonly string[]): void {
  let outDir = FIXTURES_DIR;
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]!;
    if (arg !== '--out') throw new Error(`unknown argument: ${arg}`);
    const folder = argv[++at];
    if (folder === undefined) throw new Error('--out needs a folder');
    outDir = path.resolve(folder);
  }
  const written = writeFixtures(outDir);
  console.log(`wrote ${written.length} fixture files to ${outDir}`);
}

// Run when started as a script (tsx scripts/generate-fixtures.ts), not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
