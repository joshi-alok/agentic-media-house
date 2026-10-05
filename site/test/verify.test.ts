import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// `npm run verify` is the one command that says whether the repository is in
// order, and CI runs the same steps one by one. These tests keep the two lists
// identical, and keep the README honest about what the commands are.

const ROOT = new URL('../../', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, ROOT), 'utf8');

const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string>; engines: { node: string } };
const workflow = parse(read('.github/workflows/ci.yml')) as {
  on: { push: { branches: string[] }; pull_request: unknown };
  jobs: Record<string, { 'runs-on': string; steps: { name?: string; uses?: string; with?: Record<string, string>; run?: string }[] }>;
};
const readme = read('README.md');

/** The scripts a command line such as "npm run build && npm test" runs, in order. */
function scriptsOf(commandLine: string): string[] {
  return commandLine.split('&&').map((part) => {
    const match = /^\s*npm (?:run )?([\w:.-]+)\s*$/.exec(part);
    if (match === null) throw new Error(`not an npm script: ${JSON.stringify(part)}`);
    return match[1]!;
  });
}

const EXPECTED_ORDER = ['typecheck', 'test', 'evals:seeded', 'fixtures:check', 'build', 'audit:prod', 'build:fixtures', 'audit', 'lighthouse'];

describe('the verify script', () => {
  it('runs typecheck, tests, seeded evals, fixture drift, the production build and its audit, the fixture build and its audit, then Lighthouse', () => {
    expect(scriptsOf(pkg.scripts.verify!)).toEqual(EXPECTED_ORDER);
  });

  it('runs only scripts that exist', () => {
    for (const name of scriptsOf(pkg.scripts.verify!)) expect(pkg.scripts, name).toHaveProperty(name);
  });
});

describe('the CI workflow', () => {
  const job = Object.values(workflow.jobs)[0]!;
  const runs = job.steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));

  it('runs on a push to main and on every pull request', () => {
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on).toHaveProperty('pull_request');
  });

  it('has one job, on Ubuntu, with the Node version of .nvmrc', () => {
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    expect(job['runs-on']).toBe('ubuntu-latest');
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node'));
    expect(setup?.with?.['node-version-file']).toBe('.nvmrc');
  });

  it('installs exactly what the lock file pins, then runs the steps of the verify script in the same order', () => {
    expect(runs[0]).toBe('npm ci');
    expect(runs.slice(1).map((run) => scriptsOf(run)[0])).toEqual(scriptsOf(pkg.scripts.verify!));
  });

  it('runs each step as one npm script, so that a failure names the step', () => {
    for (const run of runs.slice(1)) expect(scriptsOf(run), run).toHaveLength(1);
  });

  it('gives every step a name', () => {
    for (const step of job.steps) expect(step.name, JSON.stringify(step)).toBeTruthy();
  });
});

describe('the README', () => {
  it('names every root script, so that a new command cannot be left undocumented', () => {
    for (const name of Object.keys(pkg.scripts)) {
      const spelled = name === 'test' ? 'npm test' : `npm run ${name}`;
      expect(readme, name).toContain(spelled);
    }
  });

  it('names the Node version Lighthouse needs, and the fixture flag', () => {
    expect(readme).toContain('22.19');
    expect(readme).toContain('ROBYWIRE_FIXTURES=1');
  });

  it('is plain ASCII, like the rest of the source', () => {
    expect([...readme].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });

  it('is in step with the Node version the package asks for', () => {
    expect(pkg.engines.node).toBe('>=22');
  });
});
