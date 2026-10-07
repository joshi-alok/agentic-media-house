import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli';
import { R2_VARIABLES } from '../../src/run/evidence-factory';
import { useScratch } from '../support/context';
import { ISOLATED, git } from '../support/repo';
import { secretsIn } from '../support/secrets';
import { ROOT, actionsOf, loadWorkflow, stepNamed, stepsOf, stringsWith, workflowText } from '../support/workflow';

// `.github/workflows/desk.yml` starts the Desk every day. Nothing can run it here, so these tests read it as data and say every property that matters: when it starts,
// that two runs never overlap, what the token may do, which steps there are and in which order, that every secret goes into the environment of the one step that needs it
// and is never written in a command, what is pushed and when, and what is kept as an artifact. The two small scripts in it (who the commits are by, and the push) are
// run here, in a made-up repository with a made-up remote that is a folder, to show that they do what they say.

const scratch = useScratch();
const workflow = loadWorkflow('desk.yml');
const text = workflowText('desk.yml');
const steps = stepsOf(workflow);
const names = steps.map((step) => step.name);

/** The command of a step that has a line that gives git its credential in front of it: the last line of its `run:`. */
const commandOf = (step: { run?: string }): string => step.run!.trim().split('\n').at(-1)!;

/** Run the commands of a step the way GitHub runs `run:` on Linux (bash, stopping at the first error), in `cwd`. */
function runScript(script: string, cwd: string, env: Record<string, string> = {}): string {
  return execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ISOLATED, ...env } });
}

describe('desk.yml: when it starts', () => {
  it('starts at 04:30, 06:30 and 08:30 UTC every day, and by hand, and at nothing else', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.on.schedule).toEqual([{ cron: '30 4 * * *' }, { cron: '30 6 * * *' }, { cron: '30 8 * * *' }]);
  });

  it('can be started by hand with one input, `dry`, a boolean that is false unless it is said: a rehearsal', () => {
    expect(workflow.on.workflow_dispatch).toMatchObject({ inputs: { dry: { type: 'boolean', default: false } } });
    expect(Object.keys((workflow.on.workflow_dispatch as { inputs: object }).inputs)).toEqual(['dry']);
    expect(JSON.stringify(workflow.on.workflow_dispatch)).toContain('publishes nothing, commits nothing, pushes nothing and starts no deploy');
  });

  it('starts by the schedule only when the variable DESK_SCHEDULE of the repository is on, and by hand always: the condition is on the job, so that nothing of it runs otherwise', () => {
    const job = Object.values(workflow.jobs)[0]!;
    expect(job.if).toBe("${{ github.event_name != 'schedule' || vars.DESK_SCHEDULE == 'on' }}");
  });

  it('never runs two at once and never cancels one that has started', () => {
    expect(workflow.concurrency).toEqual({ group: 'desk', 'cancel-in-progress': false });
  });

  it('has one job, on Ubuntu, with a time after which GitHub stops it', () => {
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    const job = Object.values(workflow.jobs)[0]!;
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(60);
  });
});

describe('desk.yml: what the token may do', () => {
  it('may write the repository (the piece and the desk state go to main, the branch of a hold is pushed), write pull requests (a hold is sent to the owner), and start a workflow (the deploy), and may do nothing else', () => {
    expect(workflow.permissions).toEqual({ contents: 'write', 'pull-requests': 'write', actions: 'write' });
  });

  it('gives no job a permission of its own, which would change what the line above says', () => {
    for (const job of Object.values(workflow.jobs)) expect(job).not.toHaveProperty('permissions');
  });
});

describe('desk.yml: the steps, in order', () => {
  it('checks out, sets up Node, installs, names the committer, runs the Desk, builds and audits the site, pushes (or keeps the commits on a branch), keeps the artifacts and deploys', () => {
    expect(names).toEqual([
      'Check out the repository, with its history',
      'Set up Node',
      'Install dependencies',
      'Give the commits of the Desk a name',
      'Run the Desk',
      'Build the site with what the run committed',
      'Audit the production build',
      'Push what the run committed',
      'Keep what the run committed on a branch, because the site does not build with it',
      'Pack the run, with nothing in it that a model or a page wrote',
      'Keep the artifacts of the run for 14 days',
      'Deploy the site',
    ]);
  });

  it('gives every step a name', () => {
    for (const step of steps) expect(step.name, JSON.stringify(step)).toBeTruthy();
  });

  it('checks out the whole history and leaves no credential behind: persist-credentials is false, so the token is in the steps that push and in no other', () => {
    const checkout = stepNamed(workflow, 'Check out the repository, with its history');
    expect(checkout.uses).toBe('actions/checkout@v7');
    expect(checkout.with).toEqual({ 'fetch-depth': 0, 'persist-credentials': false });
  });

  it('uses the Node of .nvmrc and the cache of npm, and installs exactly what the lock file says', () => {
    const setup = stepNamed(workflow, 'Set up Node');
    expect(setup.uses).toBe('actions/setup-node@v7');
    expect(setup.with).toEqual({ 'node-version-file': '.nvmrc', cache: 'npm' });
    expect(stepNamed(workflow, 'Install dependencies').run).toBe('npm ci');
    expect(readFileSync(`${ROOT}.nvmrc`, 'utf8').trim()).toBe('22');
  });

  it('never lets a step fail without failing the job: no step has continue-on-error', () => {
    expect(stringsWith(workflow, 'continue-on-error')).toEqual([]);
    for (const step of steps) expect(step).not.toHaveProperty('continue-on-error');
  });
});

describe('desk.yml: the commits of the Desk', () => {
  const script = stepNamed(workflow, 'Give the commits of the Desk a name').run!;

  it('are by the bot of GitHub, with the address that GitHub gives it', () => {
    const repo = scratch();
    git(repo, 'init', '--quiet', '-b', 'main');
    runScript(script, repo);
    expect(git(repo, 'config', 'user.name')).toBe('github-actions[bot]');
    expect(git(repo, 'config', 'user.email')).toBe('41898282+github-actions[bot]@users.noreply.github.com');
  });
});

describe('desk.yml: the run', () => {
  const run = stepNamed(workflow, 'Run the Desk');

  it('is the command of the daily run: the file of settings of the repository, a day that is done left alone, and the defaults that make it real (the api, live sources, not dry)', () => {
    expect(run.run).toBe('. .github/scripts/github-auth.sh\nnpm run desk -- run --config desk.config.yml $DESK_FLAGS\n');
    // A start that is not a rehearsal gives the flag that leaves a day that is done alone (the whole of what a rehearsal does is in dry-run.test.ts).
    const parsed = parseArgs(commandOf(run).replace('npm run desk -- ', '').replace('$DESK_FLAGS', '--skip-if-done').split(' '));
    expect(parsed).toEqual({
      ok: true,
      args: { command: 'run', date: undefined, dry: false, client: 'api', sources: 'live', forceNew: false, skipIfDone: true, cassettes: undefined, config: 'desk.config.yml' },
    });
    expect(existsSync(`${ROOT}desk.config.yml`)).toBe(true);
  });

  it('has the key of the model and the four variables of the bucket from the secrets of the repository, each under the name it is read by, and the token of the workflow for gh', () => {
    expect(run.env).toEqual({
      ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}',
      R2_ENDPOINT: '${{ secrets.R2_ENDPOINT }}',
      R2_BUCKET: '${{ secrets.R2_BUCKET }}',
      R2_ACCESS_KEY_ID: '${{ secrets.R2_ACCESS_KEY_ID }}',
      R2_SECRET_ACCESS_KEY: '${{ secrets.R2_SECRET_ACCESS_KEY }}',
      GH_TOKEN: '${{ github.token }}',
      DESK_FLAGS: "${{ inputs.dry && '--dry' || '--skip-if-done' }}",
    });
    // The four names are the ones that the Desk reads (makeEvidenceStore), so a variable that is renamed there fails here.
    for (const name of R2_VARIABLES) expect(run.env).toHaveProperty(name);
  });

  it('is the step that has an id, so that the steps after it can say whether it ran', () => {
    expect(run.id).toBe('desk');
  });
});

describe('desk.yml: the secrets', () => {
  it('are named only in the env of a step, and nowhere else: not in a command, not in a condition, not in a name, not in an input of an action', () => {
    for (const { path: where, value } of stringsWith(workflow, 'secrets.')) {
      expect(where, `${where}: ${value}`).toMatch(/^jobs\.[a-z]+\.steps\.\d+\.env\.[A-Z0-9_]+$/);
      expect(value).toMatch(/^\$\{\{ secrets\.[A-Z0-9_]+ \}\}$/);
    }
    expect(stringsWith(workflow, 'secrets.').length).toBeGreaterThan(0);
  });

  it('never appear in a command: no run: has an expression at all, so that nothing is pasted into a script, and none names a secret or prints the environment', () => {
    const commands = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command, command).not.toContain('${{');
      expect(command, command).not.toMatch(/ANTHROPIC|R2_|secret|token/i);
      expect(command, command).not.toMatch(/\b(?:printenv|env|set -x)\b/);
    }
  });

  it('are given to the step that runs the Desk, and to no other step', () => {
    for (const step of steps) {
      const carries = Object.values(step.env ?? {}).some((value) => value.includes('secrets.'));
      expect(carries, step.name).toBe(step.name === 'Run the Desk');
    }
  });

  it('and nothing else in the file is shaped like a key', () => {
    expect(secretsIn(text)).toEqual([]);
  });
});

describe('desk.yml: pushing what the run committed', () => {
  const push = stepNamed(workflow, 'Push what the run committed');

  it('is the command `desk push`, which counts after a fetch, tries again when it is rejected and never fails open (test/run/push.test.ts says how), with the number of the run for the name of a rescue branch', () => {
    expect(push.run).toBe('. .github/scripts/github-auth.sh\nnpm run desk -- push --run-id "${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" --output "$GITHUB_OUTPUT"\n');
    // What the shell makes of it, for the made-up run 4711, attempt 2.
    const words = commandOf(push).replace('npm run desk -- ', '').replace('"${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"', '4711-2').replace('"$GITHUB_OUTPUT"', '/runner/output').split(' ');
    expect(parseArgs(words)).toEqual({ ok: true, args: { command: 'push', runId: '4711-2', output: '/runner/output', branchOnly: false, auditLog: undefined } });
  });

  it('has no script of its own that could swallow an error: no `if`, no `||`, no `;` and no `git` in the command', () => {
    expect(commandOf(push)).not.toMatch(/\bif\b|\|\||;|\bgit\b/);
  });

  it('is asked after the run whatever way the run ended, but only when the site was built with what the run committed and its audit passed: nothing reaches main before that', () => {
    expect(push.if).toBe("${{ !cancelled() && !inputs.dry && steps.desk.conclusion != 'skipped' && steps.build.outcome == 'success' && steps.audit.outcome == 'success' }}");
    expect(push.id).toBe('push');
  });
});

describe('desk.yml: the build and the audit, before anything reaches main', () => {
  const build = stepNamed(workflow, 'Build the site with what the run committed');
  const audit = stepNamed(workflow, 'Audit the production build');
  const branch = stepNamed(workflow, 'Keep what the run committed on a branch, because the site does not build with it');
  const deployWorkflow = loadWorkflow('deploy.yml');

  it('come after the run and before the push, in this order: run, build, audit, push', () => {
    const order = ['Run the Desk', build.name, audit.name, 'Push what the run committed'].map((name) => names.indexOf(name!));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('build as the Deploy workflow builds, with the same address for the site (the variable SITE_URL, or the address that the site is live at), so that what is audited is what is deployed', () => {
    expect(build.run).toBe('npm run build');
    expect(build.env).toEqual(stepNamed(deployWorkflow, 'Production build').env);
    expect(build.id).toBe('build');
  });

  it('audit the production build, in the same way that CI and Deploy do, and keep the report outside the repository, in the folder that the runner gives the job', () => {
    expect(audit.run).toBe('set -o pipefail\nnpm run audit:prod 2>&1 | tee "$RUNNER_TEMP/audit.log"\n');
    expect(audit.id).toBe('audit');
    expect(audit.if).toBe("${{ !cancelled() && steps.build.outcome == 'success' }}");
  });

  it('are asked whenever the Desk ran, unless the workflow was cancelled (a day that is done makes no commit, and then they check main itself)', () => {
    expect(build.if).toBe("${{ !cancelled() && steps.desk.conclusion != 'skipped' }}");
  });

  it('are followed, when either fails, by a step that keeps the commits on a branch and opens a draft pull request, with the report of the audit, and by nothing that pushes to main', () => {
    expect(branch.id).toBe('branch');
    expect(branch.if).toBe("${{ !cancelled() && !inputs.dry && steps.desk.conclusion != 'skipped' && (steps.build.outcome == 'failure' || steps.audit.outcome == 'failure') }}");
    expect(branch.run).toBe('. .github/scripts/github-auth.sh\nnpm run desk -- push --branch-only --run-id "${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" --audit-log "$RUNNER_TEMP/audit.log"\n');
    const words = commandOf(branch).replace('npm run desk -- ', '').replace('"${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"', '4711-2').replace('"$RUNNER_TEMP/audit.log"', '/runner/audit.log').split(' ');
    expect(parseArgs(words)).toEqual({ ok: true, args: { command: 'push', runId: '4711-2', output: undefined, branchOnly: true, auditLog: '/runner/audit.log' } });
    // The step opens a pull request, so it has the token of the workflow for gh, and no other step of the two has anything but what it needs.
    expect(branch.env).toEqual({ GH_TOKEN: '${{ github.token }}' });
    expect(build.env).toEqual({ SITE_URL: "${{ vars.SITE_URL || 'https://agentic-media-house.joshi-alok.workers.dev' }}" });
    expect(audit).not.toHaveProperty('env');
  });

  it('the step that audits ends with the exit code of the audit, not of `tee`: run as GitHub runs a script (bash -e, with no pipefail of its own), with an audit that fails', () => {
    const folder = scratch();
    const bin = path.join(folder, 'bin');
    mkdirSync(bin);
    const npm = path.join(bin, 'npm');
    writeFileSync(npm, '#!/bin/sh\necho "  FAIL  A5   a check"\necho "             - a problem"\nexit 1\n', { mode: 0o755 });
    const temp = path.join(folder, 'temp');
    mkdirSync(temp);
    const env = { ...process.env, ...ISOLATED, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: temp };
    expect(() => execFileSync('bash', ['-e', '-c', audit.run!], { cwd: folder, env, stdio: 'pipe' })).toThrow();
    expect(readFileSync(path.join(temp, 'audit.log'), 'utf8')).toBe('  FAIL  A5   a check\n             - a problem\n');
    // And without the first line the exit code of tee is the one that counts, which is what this line is for.
    const without = audit.run!.replace('set -o pipefail\n', '');
    expect(execFileSync('bash', ['-e', '-c', without], { cwd: folder, env, stdio: 'pipe' }).toString()).toContain('FAIL');
  });
});

describe('desk.yml: the artifacts', () => {
  const keep = stepNamed(workflow, 'Keep the artifacts of the run for 14 days');
  const pack = stepNamed(workflow, 'Pack the run, with nothing in it that a model or a page wrote');

  it('are the pack of the run for 14 days, even when the run failed (that is when they are wanted), and are not an error when there is none (a day that was done has no folder of runs)', () => {
    expect(keep.uses).toBe('actions/upload-artifact@v7');
    expect(keep.if).toBe('${{ !cancelled() }}');
    expect(keep.with).toEqual({ name: 'desk-runs', path: '${{ runner.temp }}/desk-run', 'retention-days': 14, 'if-no-files-found': 'ignore' });
  });

  it('are made by `desk pack-artifact`, of the folder of the day, into the folder that is uploaded, and by nothing else: the folder of the runs is never uploaded', () => {
    expect(pack.run).toBe('npm run desk -- pack-artifact "runs/$(date -u +%F)" "$RUNNER_TEMP/desk-run"');
    expect(parseArgs(['pack-artifact', 'runs/2026-10-05', '/runner/temp/desk-run'])).toEqual({ ok: true, args: { command: 'pack-artifact', runDir: 'runs/2026-10-05', outDir: '/runner/temp/desk-run' } });
    expect(pack.if).toBe('${{ !cancelled() }}');
    expect(pack).not.toHaveProperty('env');
  });

  it('are the only thing that is uploaded: no step uploads anything else, and none names the folder of the evidence', () => {
    const uploads = steps.filter((step) => step.uses?.startsWith('actions/upload-artifact') === true);
    expect(uploads).toHaveLength(1);
    expect(text).not.toMatch(/evidence/i);
    expect(String(keep.with?.path)).not.toContain('runs');
  });
});

describe('desk.yml: the deploy', () => {
  const deploy = stepNamed(workflow, 'Deploy the site');

  it('is started by hand when something was pushed, because a push by the token of a workflow starts no workflow, and by nothing else', () => {
    expect(deploy.run).toBe('gh workflow run deploy.yml --ref main');
    expect(deploy.if).toBe("${{ !cancelled() && !inputs.dry && steps.push.outputs.pushed == 'true' }}");
    expect(deploy.env).toEqual({ GH_TOKEN: '${{ github.token }}' });
  });
});

describe('desk.yml: the actions', () => {
  it('are used by a major version, the same one that the CI workflow uses for the same action', () => {
    const ci = actionsOf(loadWorkflow('ci.yml'));
    for (const action of actionsOf(workflow)) {
      expect(action, action).toMatch(/^[a-z-]+\/[a-z-]+@v\d+$/);
      const name = action.split('@')[0]!;
      const same = ci.find((candidate) => candidate.startsWith(`${name}@`));
      if (same !== undefined) expect(action).toBe(same);
    }
    expect(actionsOf(workflow)).toEqual(['actions/checkout@v7', 'actions/setup-node@v7', 'actions/upload-artifact@v7']);
  });
});
