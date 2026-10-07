import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
import { FakeGit } from '../src/run/git';
import { useScratch } from './support/context';
import { MARKER, writeHostileRun } from './support/hostile-run';
import { clock } from './support/run';

// `desk pack-artifact`, the command that the workflow makes the artifact with. What goes in the pack is in test/run/pack.test.ts; here are the words of the command, what it prints, and
// which exit code each ending has.

const scratch = useScratch();

function setup(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const cwd = scratch();
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd, now: clock(), git: new FakeGit(), config: defaultConfig() };
  return { cwd, out, err, code: () => main(argv, deps) };
}

const parsed = (...argv: string[]): Parsed => {
  const result = parseArgs(argv);
  if (!result.ok) throw new Error(`not parsed: ${result.message}`);
  return result.args;
};
const refused = (...argv: string[]): string => {
  const result = parseArgs(argv);
  if (result.ok) throw new Error(`parsed: ${JSON.stringify(result.args)}`);
  return result.message;
};

describe('parseArgs: pack-artifact', () => {
  it('takes the folder of a run and the folder for the pack, and no option', () => {
    expect(parsed('pack-artifact', 'runs/2026-10-05', 'out')).toEqual({ command: 'pack-artifact', runDir: 'runs/2026-10-05', outDir: 'out' });
  });

  it('refuses fewer or more than two arguments, and an option, each with a message that says so', () => {
    expect(refused('pack-artifact')).toBe('pack-artifact needs the folder of a run and the folder for the pack, and was given neither');
    expect(refused('pack-artifact', 'runs/x')).toBe('pack-artifact needs the folder of a run and the folder for the pack, and was given only one');
    expect(refused('pack-artifact', 'a', 'b', 'c')).toBe('pack-artifact needs the folder of a run and the folder for the pack, and was given 3 arguments');
    expect(refused('pack-artifact', 'a', 'b', '--dry')).toBe('unknown option --dry for pack-artifact');
  });

  it('is in the usage, with what it never has in it', () => {
    expect(USAGE).toContain('  desk pack-artifact <folder of a run> <folder for the pack>');
    expect(USAGE).toContain('No reply of a model, reason of the verifier, sentence of a');
    expect(USAGE).toContain('A pack of more than 24 KB, or a file of it of more than 8 KB, is an error.');
  });
});

describe('main: pack-artifact', () => {
  it('packs the run, says how many files and how many bytes, and lists the files, and exits 0', async () => {
    const run = setup(['pack-artifact', 'runs/2026-10-05', 'pack']);
    writeHostileRun(path.join(run.cwd, 'runs/2026-10-05'));
    expect(await run.code()).toBe(0);
    expect(run.err).toEqual([]);
    expect(run.out[0]).toMatch(/^pack-artifact: 7 files, \d+ bytes, in pack$/);
    expect(run.out.slice(1)).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json', 'run.json'].map((name) => `pack-artifact: ${name}`));
    expect(readdirSync(path.join(run.cwd, 'pack')).sort()).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json', 'run.json']);
    expect(run.out.join('\n')).not.toContain(MARKER);
  });

  it('says that there is nothing to pack, exits 0 and makes no folder when the folder of the run is not there: a day that was done has none', async () => {
    const run = setup(['pack-artifact', 'runs/2026-10-05', 'pack']);
    expect(await run.code()).toBe(0);
    expect(run.out).toEqual(['pack-artifact: runs/2026-10-05 is not there, so there is nothing to pack']);
    expect(existsSync(path.join(run.cwd, 'pack'))).toBe(false);
  });

  it('exits 1, and writes nothing, for a folder for the pack that has something in it, so that what is uploaded from it is the pack and nothing else', async () => {
    const run = setup(['pack-artifact', 'runs/2026-10-05', 'pack']);
    writeHostileRun(path.join(run.cwd, 'runs/2026-10-05'));
    mkdirSync(path.join(run.cwd, 'pack'));
    writeFileSync(path.join(run.cwd, 'pack', 'in-the-way.txt'), 'x');
    expect(await run.code()).toBe(1);
    expect(run.err).toEqual(['desk: the folder of the pack is not empty, so what is uploaded from it would not be the pack alone']);
    expect(readdirSync(path.join(run.cwd, 'pack'))).toEqual(['in-the-way.txt']);
  });

  it('exits 1 for a folder for the pack that is inside the folder of the run, which would put the pack in the run', async () => {
    const run = setup(['pack-artifact', 'runs/2026-10-05', 'runs/2026-10-05/pack']);
    writeHostileRun(path.join(run.cwd, 'runs/2026-10-05'));
    expect(await run.code()).toBe(1);
    expect(run.err).toEqual(['desk: the folder of the pack must not be the folder of the run, or inside it, or hold it']);
    expect(run.out).toEqual([]);
  });

  it('exits 1 when the pack is too big, and writes nothing', async () => {
    const run = setup(['pack-artifact', 'runs/2026-10-05', 'pack']);
    const dir = path.join(run.cwd, 'runs/2026-10-05');
    writeHostileRun(dir);
    // A verification that has a long history, every round with a long list of codes of the gate.
    const { REASON_LABELS } = await import('../../site/src/lib/reasons');
    const codes = Object.keys(REASON_LABELS).filter((code) => code.startsWith('G')).slice(0, 60);
    const gate = { route: 'hold', failures: codes.map((code) => ({ code })), holdReasons: [], checks: {} };
    writeFileSync(path.join(dir, '06-verify.json'), JSON.stringify({ outcome: 'hold', rounds: 11, gate, verifier: { model: 'claude-sonnet-5-5', passed: false, notes: [] }, history: Array.from({ length: 12 }, (_, at) => ({ round: at, gate, verifierFailures: [], sent: [] })) }));
    expect(await run.code()).toBe(1);
    expect(run.err).toHaveLength(1);
    expect(run.err[0]).toMatch(/^desk: the packed 06-verify\.json is \d+ bytes, and a file of a pack has at most 8192$/);
    expect(existsSync(path.join(run.cwd, 'pack'))).toBe(false);
  });

  it('exits 1 and says what went wrong for an error that is not one of the pack', async () => {
    const run = setup(['pack-artifact', 'runs-is-a-file', 'pack']);
    writeFileSync(path.join(run.cwd, 'runs-is-a-file'), 'not a folder');
    expect(await run.code()).toBe(1);
    expect(run.err).toHaveLength(1);
    expect(run.err[0]).toMatch(/^the pack could not be made: /);
  });
});
