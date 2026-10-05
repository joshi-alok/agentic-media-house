import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSeeded } from '../src/run';
import { buildScoreboard, renderScoreboardJson } from '../src/scoreboard';

// The scoreboard is the public proof: the site's /method page shows it. It is
// committed, so it must be exactly what the gate gives today.

const FILE = new URL('../scoreboard/seeded.json', import.meta.url);

describe('the committed scoreboard', () => {
  it('is exactly what the gate gives today; if this fails, run `npm run evals:seeded` and commit the file', () => {
    expect(readFileSync(FILE, 'utf8')).toBe(renderScoreboardJson(buildScoreboard(runSeeded())));
  });

  it('shows every case caught and a baseline that publishes', () => {
    const board = JSON.parse(readFileSync(FILE, 'utf8')) as ReturnType<typeof buildScoreboard>;
    expect(board.rate).toBe(1);
    expect(board.baselinePasses).toBe(true);
    expect(board.caught).toBe(board.total);
    expect(board.cases.every((item) => item.caught)).toBe(true);
  });

  it('can be imported by the package name, which is how the site will read it', async () => {
    const imported = (await import('@robywire/evals/scoreboard')) as { default: ReturnType<typeof buildScoreboard> };
    expect(imported.default).toEqual(JSON.parse(readFileSync(FILE, 'utf8')));
  });
});
