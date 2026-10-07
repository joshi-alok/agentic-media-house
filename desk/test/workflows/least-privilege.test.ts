import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useScratch } from '../support/context';
import { ISOLATED } from '../support/repo';
import { secretsIn } from '../support/secrets';
import { ROOT, loadWorkflow, stepsOf, stringsWith, workflowText } from '../support/workflow';


// What each step of each workflow can reach. A workflow of a public repository runs code that is installed from the internet (`npm ci` runs the install scripts of every package of the
// tree), so a secret that is in reach of a step that does not need it is a secret that the least trusted package can read. The rules, each tested here by reading the files:
// the checkout leaves no credential in `.git/config`; the token of the workflow is in the `env` of the steps that push, open a pull request or start the deploy, and of no other step; the
// key of the model and the variables of the bucket are in the step that runs the Desk and of no other; git is given the token for github.com alone, by the environment, in one place.

const scratch = useScratch();
const FILES = ['ci.yml', 'deploy.yml', 'desk.yml'];
const WORKFLOWS = Object.fromEntries(FILES.map((file) => [file, loadWorkflow(file)]));
const SCRIPT = path.join(ROOT, '.github/scripts/github-auth.sh');
const SOURCING = '. .github/scripts/github-auth.sh';

const RUN = 'Run the Desk';
const PUSH = 'Push what the run committed';
const BRANCH = 'Keep what the run committed on a branch, because the site does not build with it';
const DEPLOY = 'Deploy the site';

describe('the checkout', () => {
  it.each(FILES)('of %s leaves no credential in .git/config: persist-credentials is false, so that npm ci and every step that is not given the token run with none in reach', (file) => {
    const checkouts = stepsOf(WORKFLOWS[file]!).filter((step) => step.uses?.startsWith('actions/checkout@') === true);
    expect(checkouts.length).toBeGreaterThan(0);
    for (const step of checkouts) expect(step.with, `${file}: ${step.name}`).toMatchObject({ 'persist-credentials': false });
  });
});

describe('the token of the workflow', () => {
  it('is in the env of the four steps of desk.yml that push, open a pull request or start the deploy, under the name that gh reads, and in no other place of any workflow', () => {
    for (const file of FILES) {
      const where = [...stringsWith(WORKFLOWS[file], 'github.token'), ...stringsWith(WORKFLOWS[file], 'secrets.GITHUB_TOKEN')];
      if (file !== 'desk.yml') {
        expect(where, file).toEqual([]);
        continue;
      }
      const steps = stepsOf(WORKFLOWS[file]!);
      expect(where.map((place) => place.path)).toEqual([RUN, PUSH, BRANCH, DEPLOY].map((name) => `jobs.desk.steps.${steps.findIndex((step) => step.name === name)}.env.GH_TOKEN`));
      for (const place of where) expect(place.value).toBe('${{ github.token }}');
    }
  });

  it('is not in the env of the workflow or of a job, which every step would have, and install, set up Node, build and audit have no env of their own that has it', () => {
    for (const file of FILES) {
      const workflow = WORKFLOWS[file]!;
      expect(workflow, file).not.toHaveProperty('env');
      for (const job of Object.values(workflow.jobs)) expect(job, file).not.toHaveProperty('env');
    }
    for (const step of stepsOf(WORKFLOWS['desk.yml']!)) {
      if (['Install dependencies', 'Set up Node', 'Give the commits of the Desk a name'].includes(step.name ?? '')) expect(step, step.name).not.toHaveProperty('env');
      if (['Build the site with what the run committed', 'Audit the production build'].includes(step.name ?? '')) expect(JSON.stringify(step.env ?? {}), step.name).not.toMatch(/token/i);
    }
    for (const step of stepsOf(WORKFLOWS['deploy.yml']!).concat(stepsOf(WORKFLOWS['ci.yml']!))) expect(JSON.stringify(step.env ?? {}), step.name).not.toMatch(/github\.token|GITHUB_TOKEN|GH_TOKEN/);
  });

  it('gives git its credential, through the one script, to the steps that push, and to no step that only asks gh to do something: the Desk, the push, and the branch of a build that failed, and not the deploy', () => {
    const steps = stepsOf(WORKFLOWS['desk.yml']!);
    const sourcing = steps.filter((step) => step.run?.split('\n').some((line) => line.trim() === SOURCING) === true).map((step) => step.name);
    expect(sourcing).toEqual([RUN, PUSH, BRANCH]);
    // Each of them has the token to hand it, and sources the script before it starts anything else.
    for (const step of steps.filter((candidate) => sourcing.includes(candidate.name))) {
      expect(step.env, step.name).toHaveProperty('GH_TOKEN', '${{ github.token }}');
      expect(step.run!.split('\n')[0], step.name).toBe(SOURCING);
    }
    expect(steps.find((step) => step.name === DEPLOY)!.run).toBe('gh workflow run deploy.yml --ref main');
  });

  it('is never in an address, never built into a header in a workflow, never named in a command but in the line that sources the script, and no step prints the environment', () => {
    for (const file of FILES) {
      const text = workflowText(file);
      expect(text, file).not.toMatch(/x-access-token/i);
      expect(text, file).not.toMatch(/extraheader|base64|Authorization:/i);
      expect(text, file).not.toMatch(/https?:\/\/[^\s/@]*:[^\s/@]*@/);
      for (const step of stepsOf(WORKFLOWS[file]!)) {
        for (const line of (step.run ?? '').split('\n')) {
          if (line.trim() === SOURCING) continue;
          expect(line, `${file}: ${step.name}`).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|\$\{\{|\b(?:printenv|set -x)\b|\benv\b/);
        }
      }
    }
  });
});

describe('the key of the model and the variables of the bucket', () => {
  const NAMES = /ANTHROPIC_API_KEY|R2_ENDPOINT|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/;

  it('are in the env of the step that runs the Desk, and of no other step of any workflow', () => {
    for (const file of FILES) {
      for (const step of stepsOf(WORKFLOWS[file]!)) {
        const has = NAMES.test(JSON.stringify(step.env ?? {}));
        expect(has, `${file}: ${step.name}`).toBe(file === 'desk.yml' && step.name === RUN);
      }
    }
  });

  it('are not in the environment of git or of gh, whichever step starts them: the Desk gives a child the variables of an allow-list (test/run/environment.test.ts) and the scripts that start them are in this file', () => {
    expect(readFileSync(SCRIPT, 'utf8')).not.toMatch(NAMES);
  });
});

describe('.github/scripts/github-auth.sh', () => {
  /** Source the script in bash as a step does (`bash -e`), with the token that is given, and run `after`; return what the whole said. */
  function sourced(after: string, token: string | null = 'MADE-UP-TOKEN-VALUE'): { stdout: string; stderr: string; code: number } {
    const env: Record<string, string> = { ...(process.env as Record<string, string>), ...ISOLATED };
    delete env.GH_TOKEN;
    if (token !== null) env.GH_TOKEN = token;
    const dir = scratch();
    try {
      const stdout = execFileSync('bash', ['--noprofile', '--norc', '-e', '-c', `. ${JSON.stringify(SCRIPT)}\n${after}`], { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { stdout, stderr: '', code: 0 };
    } catch (error) {
      const failure = error as { stdout: string; stderr: string; status: number };
      return { stdout: failure.stdout, stderr: failure.stderr, code: failure.status };
    }
  }

  it('gives git, for github.com, a basic credential of the name x-access-token and the token, and says nothing', () => {
    const result = sourced('git config --get-urlmatch http.extraheader https://github.com/owner/repo');
    expect(result.code).toBe(0);
    const header = result.stdout.trim();
    expect(header).toMatch(/^AUTHORIZATION: basic [A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(header.slice('AUTHORIZATION: basic '.length), 'base64').toString('utf8')).toBe('x-access-token:MADE-UP-TOKEN-VALUE');
  });

  it('gives it for no other host: the header is not sent to a host that is not github.com, nor to one that has the name in it', () => {
    for (const url of ['https://example.org/owner/repo', 'https://github.com.evil.example/owner/repo', 'https://evilgithub.com/owner/repo', 'http://github.com/owner/repo']) {
      const result = sourced(`git config --get-urlmatch http.extraheader ${url} || true`);
      expect(result.stdout.trim(), url).toBe('');
    }
  });

  it('says nothing of the token as it goes, on either output, and leaves no variable but the three of git and the token that it was given', () => {
    const result = sourced('env | sort | grep -v "^GH_TOKEN=" | grep -i "MADE-UP\\|x-access" || true; printf "%s\\n" "$GIT_CONFIG_COUNT"');
    expect(result.stdout.trim()).toBe('1');
    expect(result.stderr).toBe('');
  });

  it('sets only GIT_CONFIG_COUNT and the key and the value that follow it, which is how git is given a setting by the environment', () => {
    const result = sourced('printf "%s\\n" "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "${GIT_CONFIG_VALUE_0:0:21}"');
    expect(result.stdout.split('\n').filter((line) => line !== '')).toEqual(['1', 'http.https://github.com/.extraheader', 'AUTHORIZATION: basic ']);
  });

  it('fails, with a message that does not have the token, and does not go on, when there is no token', () => {
    const result = sourced('echo went on', null);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain('went on');
    expect(result.stderr).toBe('github-auth: GH_TOKEN is not set, so git has no credential\n');
  });

  it('fails the same when the token is empty', () => {
    expect(sourced('echo went on', '').code).toBe(1);
  });

  it('is not run with a trace, does not print what it was given, and writes nothing to a file', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    const code = text.split('\n').filter((line) => !line.startsWith('#')).join('\n');
    expect(code).not.toMatch(/set -[a-z]*x|echo[^\n]*\$\{?GH_TOKEN/);
    // The only places that it sends anything: the error output, and the bin.
    expect([...code.matchAll(/\d*>>?\s*(\S+)/g)].map((found) => found[1])).toEqual(['&2', '/dev/null']);
  });

  it('is the only script in .github/scripts, and has nothing in it shaped like a secret', () => {
    expect(readdirSync(path.join(ROOT, '.github/scripts'))).toEqual(['github-auth.sh']);
    expect(secretsIn(readFileSync(SCRIPT, 'utf8'))).toEqual([]);
  });
});
