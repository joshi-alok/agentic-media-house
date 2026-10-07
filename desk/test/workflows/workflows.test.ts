import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT, actionsOf, loadWorkflow } from '../support/workflow';
import type { Workflow } from '../support/workflow';

// The three workflows of the repository (CI, the daily run of the Desk, the deploy) call the scripts of package.json and each other. A script that is renamed, a workflow
// that is deleted, or an action that is one version in one file and another in the next, would fail on GitHub and nowhere else, which is the worst place to find out. These
// tests read all of them and `package.json` and say that they agree. (`site/test/verify.test.ts` keeps the steps of CI identical to the steps of `npm run verify`.)

const FILES = readdirSync(`${ROOT}.github/workflows`).sort();
const WORKFLOWS = Object.fromEntries(FILES.map((file) => [file, loadWorkflow(file)])) as Record<string, Workflow>;
const PKG = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { scripts: Record<string, string>; devDependencies: Record<string, string> };

/** Every `run:` text of a workflow, one line at a time. */
const linesOf = (workflow: Workflow): string[] =>
  Object.values(workflow.jobs)
    .flatMap((job) => job.steps.flatMap((step) => (step.run === undefined ? [] : step.run.split('\n'))))
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** What an `npm` command line runs: a script of package.json, `npm ci`, or something that this test does not know (and so fails). */
function npmOf(line: string): { script: string } | { install: true } | { unknown: string } | undefined {
  const match = /^npm\s+(?:(run)\s+)?([\w:.-]+)/.exec(line);
  if (match === null) return undefined;
  if (match[1] === 'run' || match[2] === 'test') return { script: match[2]! };
  if (match[2] === 'ci') return { install: true };
  return { unknown: line };
}

describe('the workflows of the repository', () => {
  it('are these three, and no other: CI, the daily run of the Desk and the deploy', () => {
    expect(FILES).toEqual(['ci.yml', 'deploy.yml', 'desk.yml']);
  });

  it('each has a name, a block of permissions of its own that is not a blanket, and only jobs that run on Ubuntu', () => {
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      expect(workflow.name, file).toBeTruthy();
      expect(workflow.permissions, file).toBeDefined();
      expect(Object.values(workflow.permissions ?? {}), file).not.toContain('write-all');
      for (const job of Object.values(workflow.jobs)) expect(job['runs-on'], file).toBe('ubuntu-latest');
    }
  });

  it('call only scripts that package.json has, and no npm command but `npm ci` and the scripts', () => {
    let seen = 0;
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      for (const line of linesOf(workflow)) {
        const npm = npmOf(line);
        if (npm === undefined) continue;
        seen++;
        expect(npm, `${file}: ${line}`).not.toHaveProperty('unknown');
        if ('script' in npm) expect(PKG.scripts, `${file}: ${line}`).toHaveProperty(npm.script);
      }
    }
    expect(seen).toBeGreaterThan(15);
  });

  it('run a program of a package only when the root package pins it: `npx wrangler` is the wrangler of devDependencies, at one exact version', () => {
    const npx = Object.entries(WORKFLOWS).flatMap(([file, workflow]) => linesOf(workflow).filter((line) => line.startsWith('npx ')).map((line) => ({ file, line })));
    expect(npx).toEqual([{ file: 'deploy.yml', line: 'npx wrangler deploy' }]);
    expect(PKG.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('use every action by a major version, and one major for one action in all of them', () => {
    const majors = new Map<string, Set<string>>();
    for (const workflow of Object.values(WORKFLOWS)) {
      for (const action of actionsOf(workflow)) {
        expect(action).toMatch(/^[a-z-]+\/[a-z-]+@v\d+$/);
        const [name, major] = action.split('@') as [string, string];
        majors.set(name, (majors.get(name) ?? new Set()).add(major));
      }
    }
    expect([...majors.keys()].sort()).toEqual(['actions/checkout', 'actions/setup-node', 'actions/upload-artifact']);
    for (const [name, found] of majors) expect([...found], name).toHaveLength(1);
  });

  it('take Node from .nvmrc, wherever they set it up', () => {
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      const setups = Object.values(workflow.jobs).flatMap((job) => job.steps.filter((step) => step.uses?.startsWith('actions/setup-node') === true));
      expect(setups.length, file).toBeGreaterThan(0);
      for (const step of setups) expect(step.with?.['node-version-file'], file).toBe('.nvmrc');
    }
  });

  it('start each other only where the other can be started: the workflow that the daily run starts exists, and can be started by hand', () => {
    const starts = linesOf(WORKFLOWS['desk.yml']!).flatMap((line) => /^gh workflow run (\S+)/.exec(line)?.[1] ?? []);
    expect(starts).toEqual(['deploy.yml']);
    for (const file of starts) {
      expect(FILES).toContain(file);
      expect(WORKFLOWS[file]!.on).toHaveProperty('workflow_dispatch');
    }
    expect(WORKFLOWS['desk.yml']!.permissions).toHaveProperty('actions', 'write');
  });

  it('give a secret to a step only in its env, in all three files', () => {
    for (const [file, workflow] of Object.entries(WORKFLOWS)) {
      const text = readFileSync(`${ROOT}.github/workflows/${file}`, 'utf8');
      const expressions = [...text.matchAll(/\$\{\{[^}]*secrets\.[^}]*\}\}/g)];
      for (const expression of expressions) {
        const line = text.slice(text.lastIndexOf('\n', expression.index) + 1, text.indexOf('\n', expression.index));
        expect(line.trim(), `${file}: ${line}`).toMatch(/^[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/);
      }
      for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.run !== undefined) expect(step.run, file).not.toContain('secrets.');
    }
  });
});
