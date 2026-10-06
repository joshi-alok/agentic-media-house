import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The made-up pages and feeds that the tests read live in `desk/test/fixtures/`. Every address in them
// ends in `.example`, which can never be a real site.

/** The folder of the fixtures, as a path. */
export const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** The text of a fixture file, by its path under `desk/test/fixtures/`. */
export function fixtureText(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}
