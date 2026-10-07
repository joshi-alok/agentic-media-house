import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { secretsIn } from '../support/secrets';
import { ROOT, loadWorkflow, stepNamed, stepsOf, stringsWith, workflowText } from '../support/workflow';

// `.github/workflows/deploy.yml` puts the site on Cloudflare. Nothing can run it here, so these tests read it as data and say every property that matters: when it starts,
// that a newer deploy replaces an older one, what the token may do, the steps in their order (so that a build or an audit that fails stops the deploy), what the build is for
// (production, never the fixtures), and that the two secrets of Cloudflare reach the deploy and nothing else.

const workflow = loadWorkflow('deploy.yml');
const text = workflowText('deploy.yml');
const steps = stepsOf(workflow);
const SITE_URL_DEFAULT = 'https://agentic-media-house.joshi-alok.workers.dev';

describe('deploy.yml: when it starts', () => {
  it('starts on a push to main, and by hand, and at nothing else: not on a pull request, not on a schedule', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(workflow.on.push).toEqual({ branches: ['main'] });
  });

  it('lets a newer deploy cancel an older one that is still running', () => {
    expect(workflow.concurrency).toEqual({ group: 'deploy', 'cancel-in-progress': true });
  });

  it('may read the repository and do nothing else: the secrets are what it deploys with', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs)) expect(job).not.toHaveProperty('permissions');
  });

  it('has one job, on Ubuntu, with a time after which GitHub stops it', () => {
    const jobs = Object.values(workflow.jobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!['runs-on']).toBe('ubuntu-latest');
    expect(jobs[0]!['timeout-minutes']).toBeGreaterThan(0);
  });
});

describe('deploy.yml: the steps, in order', () => {
  it('checks out, sets up Node, installs, builds, audits the build, and deploys', () => {
    expect(steps.map((step) => step.name)).toEqual(['Check out the repository', 'Set up Node', 'Install dependencies', 'Production build', 'Audit the production build', 'Deploy to Cloudflare']);
    expect(steps.map((step) => step.uses ?? step.run)).toEqual(['actions/checkout@v7', 'actions/setup-node@v7', 'npm ci', 'npm run build', 'npm run audit:prod', 'npx wrangler deploy']);
  });

  it('stops at the first step that fails: no step has a condition or continue-on-error, so a build that fails or an audit that fails is never followed by the deploy', () => {
    for (const step of steps) {
      expect(step, step.name).not.toHaveProperty('if');
      expect(step, step.name).not.toHaveProperty('continue-on-error');
    }
  });

  it('uses the Node of .nvmrc and the cache of npm, and installs exactly what the lock file says', () => {
    expect(stepNamed(workflow, 'Set up Node').with).toEqual({ 'node-version-file': '.nvmrc', cache: 'npm' });
    expect(stepNamed(workflow, 'Install dependencies').run).toBe('npm ci');
  });

  it('builds the production site and audits that build, with the same two commands as CI, and never builds the fixtures', () => {
    const ci = loadWorkflow('ci.yml');
    const ciRuns = stepsOf(ci).flatMap((step) => (step.run === undefined ? [] : [step.run]));
    expect(ciRuns).toContain(stepNamed(workflow, 'Production build').run);
    expect(ciRuns).toContain(stepNamed(workflow, 'Audit the production build').run);
    expect(text).not.toContain('build:fixtures');
    expect(text).not.toContain('ROBYWIRE_FIXTURES');
  });

  it('deploys with the program that the root package pins, from the settings of wrangler.jsonc, and with no flag that would say otherwise', () => {
    const deploy = stepNamed(workflow, 'Deploy to Cloudflare');
    expect(deploy.run).toBe('npx wrangler deploy');
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('deploy.yml: the address of the site', () => {
  it('is the variable SITE_URL of the repository, and the address that the site is already live at when there is none, for the build and for nothing else', () => {
    expect(stepNamed(workflow, 'Production build').env).toEqual({ SITE_URL: `\${{ vars.SITE_URL || '${SITE_URL_DEFAULT}' }}` });
    for (const step of steps) if (step.name !== 'Production build') expect(step.env ?? {}, step.name).not.toHaveProperty('SITE_URL');
  });

  it('is on the same host as the /method page that the user agent of the daily run links to, so that a site that moves changes both or fails here', () => {
    const settings = parse(readFileSync(`${ROOT}desk.config.yml`, 'utf8')) as { userAgent: string };
    const linked = /\(\+(https?:\/\/[^)\s]+)\)/.exec(settings.userAgent)?.[1];
    expect(linked).toBeDefined();
    expect(new URL(linked!).host).toBe(new URL(SITE_URL_DEFAULT).host);
    expect(new URL(linked!).pathname).toBe('/method');
  });
});

describe('deploy.yml: the secrets', () => {
  it('are the token and the account of Cloudflare, in the env of the step that deploys, and nowhere else: not in a command, not in a condition, not in another step', () => {
    for (const { path: where, value } of stringsWith(workflow, 'secrets.')) {
      expect(where, `${where}: ${value}`).toMatch(/^jobs\.deploy\.steps\.5\.env\.CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)$/);
    }
    expect(stepNamed(workflow, 'Deploy to Cloudflare').env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      WRANGLER_SEND_METRICS: 'false',
    });
  });

  it('never appear in a command: no run: has an expression, names a secret, or prints the environment', () => {
    for (const step of steps) {
      if (step.run === undefined) continue;
      expect(step.run).not.toContain('${{');
      expect(step.run).not.toMatch(/CLOUDFLARE|secret|token|printenv|set -x/i);
    }
  });

  it('and nothing else in the file is shaped like a key or an account id', () => {
    expect(secretsIn(text)).toEqual([]);
  });
});
