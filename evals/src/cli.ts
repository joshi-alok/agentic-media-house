import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSeeded } from './run';
import type { SeededResult } from './run';
import { buildScoreboard, renderScoreboardJson, renderTable } from './scoreboard';

/** Where the public scoreboard is written. The file is committed. */
const SCOREBOARD_FILE = new URL('../scoreboard/seeded.json', import.meta.url);

/** 0 when every seeded defect was caught and the unbroken piece publishes; 1 otherwise, including when there are no cases. */
export function exitCodeFor(result: SeededResult): number {
  return result.rate < 1 || !result.baselinePasses ? 1 : 0;
}

/**
 * Run the seeded-defect evals, write the scoreboard, print the table, and
 * return the exit code. The scoreboard is written even when a case is missed,
 * because it must show what happened.
 */
export function main(
  file: URL = SCOREBOARD_FILE,
  print: (text: string) => void = console.log,
  run: () => SeededResult = runSeeded,
): number {
  const result = run();
  const path = fileURLToPath(file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderScoreboardJson(buildScoreboard(result)));

  print(renderTable(result));
  const code = exitCodeFor(result);
  print(
    code === 0
      ? '\nPASS: every seeded defect was caught.'
      : '\nFAIL: the gate missed a seeded defect, or the unbroken piece does not publish. Fix the gate, not the cases.',
  );
  return code;
}

// Run when started as a script (tsx src/cli.ts), not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
