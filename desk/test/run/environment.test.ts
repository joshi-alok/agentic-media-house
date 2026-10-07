import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHILD_VARIABLES, TOKEN_VARIABLES, childEnvironment } from '../../src/run/environment';
import { nodeExec } from '../../src/run/forge';
import { GitCli } from '../../src/run/git';
import { useScratch } from '../support/context';
import { ISOLATED, git } from '../support/repo';

// What a program that the Desk starts can see of the environment of the Desk. The process that runs the Desk has the key of the model and the keys of the bucket in its
// environment, and a `git` or a `gh` does not need them: these tests start real children that print what they have, and say that they have the few variables of an allow-list and
// none of the secrets.

afterEach(() => vi.unstubAllEnvs());

const scratch = useScratch();

/** Variables that a workflow or a machine might have, none of which a child needs, and that must never reach one. */
const SECRETS = {
  ANTHROPIC_API_KEY: 'made-up-anthropic-key',
  R2_ENDPOINT: 'https://made-up-account.r2.example',
  R2_BUCKET: 'made-up-bucket',
  R2_ACCESS_KEY_ID: 'made-up-access-key-id',
  R2_SECRET_ACCESS_KEY: 'made-up-secret-access-key',
  CLOUDFLARE_API_TOKEN: 'made-up-cloudflare-token',
  AWS_SECRET_ACCESS_KEY: 'made-up-aws-secret',
  NPM_TOKEN: 'made-up-npm-token',
  SOMETHING_ELSE: 'whatever',
};

describe('childEnvironment', () => {
  it('keeps PATH, HOME, LANG and TMPDIR and every variable of git, and nothing else', () => {
    const source = { PATH: '/bin', HOME: '/home/me', LANG: 'C', TMPDIR: '/tmp', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'a', GIT_CONFIG_VALUE_0: 'b', GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'x', ...SECRETS, GH_TOKEN: 'made-up', GITHUB_TOKEN: 'made-up', SHELL: '/bin/zsh', NODE_OPTIONS: '--inspect' };
    expect(childEnvironment(source)).toEqual({ PATH: '/bin', HOME: '/home/me', LANG: 'C', TMPDIR: '/tmp', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'a', GIT_CONFIG_VALUE_0: 'b', GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'x' });
  });

  it('gives the token of GitHub, as GH_TOKEN and as GITHUB_TOKEN, only when it is asked to, and still nothing of the secrets', () => {
    const source = { PATH: '/bin', ...SECRETS, GH_TOKEN: 'made-up-1', GITHUB_TOKEN: 'made-up-2' };
    expect(childEnvironment(source, { tokens: true })).toEqual({ PATH: '/bin', GH_TOKEN: 'made-up-1', GITHUB_TOKEN: 'made-up-2' });
    expect(childEnvironment(source, { tokens: false })).toEqual({ PATH: '/bin' });
    expect(childEnvironment(source, {})).toEqual({ PATH: '/bin' });
  });

  it('leaves out a variable that the source does not have, or has as undefined, and does not change the source', () => {
    const source: Record<string, string | undefined> = { PATH: undefined, HOME: '/home/me' };
    expect(childEnvironment(source)).toEqual({ HOME: '/home/me' });
    expect(Object.keys(childEnvironment(source))).toEqual(['HOME']);
    expect(source).toEqual({ PATH: undefined, HOME: '/home/me' });
  });

  it('does not take a variable for one of git because its name has git in it, or starts like one in the lower case', () => {
    expect(childEnvironment({ GITHUB_TOKEN: 'x', GIT: 'x', GITLAB: 'x', git_dir: 'x', MY_GIT_THING: 'x', GIT_: 'x', 'GIT-X': 'x', GIT_OK: 'y' })).toEqual({ GIT_OK: 'y' });
  });

  it('lists the names that it keeps', () => {
    expect([...CHILD_VARIABLES]).toEqual(['PATH', 'HOME', 'LANG', 'TMPDIR']);
    expect([...TOKEN_VARIABLES]).toEqual(['GH_TOKEN', 'GITHUB_TOKEN']);
  });
});

/** Make the environment of this process that of a workflow that runs the Desk: the secrets, a token, and what a machine has. */
function pollute(): void {
  for (const [name, value] of Object.entries(SECRETS)) vi.stubEnv(name, value);
  vi.stubEnv('GH_TOKEN', 'made-up-gh-token');
  vi.stubEnv('GITHUB_TOKEN', 'made-up-github-token');
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', 'http.https://github.com/.extraheader');
  vi.stubEnv('GIT_CONFIG_VALUE_0', 'AUTHORIZATION: basic bWFkZS11cA==');
}

describe('nodeExec: the children that it starts', () => {
  const printEnvironment = 'process.stdout.write(JSON.stringify(process.env))';

  async function seenBy(exec: ReturnType<typeof nodeExec>): Promise<Record<string, string>> {
    const result = await exec(process.execPath, ['-e', printEnvironment], {});
    expect(result.code).toBe(0);
    return JSON.parse(result.stdout) as Record<string, string>;
  }

  it('has none of the secrets, and has what git and gh need: the path, the home, the variables of git, and the ones that keep them from asking and colouring', async () => {
    pollute();
    const seen = await seenBy(nodeExec());
    for (const name of Object.keys(SECRETS)) expect(seen, name).not.toHaveProperty(name);
    expect(Object.values(seen).join('\n')).not.toContain('made-up-');
    expect(seen.PATH).toBe(process.env.PATH);
    expect(seen.HOME).toBe(process.env.HOME);
    expect(seen).toMatchObject({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1', LC_ALL: 'C' });
    // Not even the token of GitHub, which only a caller that asks for it has.
    expect(seen).not.toHaveProperty('GH_TOKEN');
    expect(seen).not.toHaveProperty('GITHUB_TOKEN');
  });

  it('has the token of GitHub when it is asked to have it, which is what gh needs, and still none of the secrets', async () => {
    pollute();
    const seen = await seenBy(nodeExec({}, { tokens: true }));
    expect(seen).toMatchObject({ GH_TOKEN: 'made-up-gh-token', GITHUB_TOKEN: 'made-up-github-token' });
    for (const name of Object.keys(SECRETS)) expect(seen, name).not.toHaveProperty(name);
  });

  it('has what the caller lays over it, and nothing of the secrets', async () => {
    pollute();
    const seen = await seenBy(nodeExec({ ONLY_FOR_THE_CHILD: 'yes' }));
    expect(seen.ONLY_FOR_THE_CHILD).toBe('yes');
    for (const name of Object.keys(SECRETS)) expect(seen, name).not.toHaveProperty(name);
  });
});

describe('GitCli: the git that it starts', () => {
  it('is given the variables of the allow-list and none of the secrets: a git on the path that says what it was given', async () => {
    pollute();
    const root = scratch();
    const dump = path.join(root, 'environment.txt');
    const shims = path.join(root, 'shims');
    mkdirSync(shims);
    const real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    writeFileSync(path.join(shims, 'git'), `#!/bin/sh\nenv > ${JSON.stringify(dump)}\nexec ${JSON.stringify(real)} "$@"\n`);
    chmodSync(path.join(shims, 'git'), 0o755);
    const repo = path.join(root, 'repo');
    mkdirSync(repo);
    git(repo, 'init', '--quiet', '-b', 'main');
    vi.stubEnv('PATH', `${shims}:${process.env.PATH}`);
    expect(await new GitCli(repo, { env: ISOLATED }).isClean(['a.txt'])).toBe(true);
    const seen = readFileSync(dump, 'utf8');
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(seen, name).not.toContain(`${name}=`);
      expect(seen, value).not.toContain(value);
    }
    expect(seen).not.toContain('GH_TOKEN=');
    expect(seen).not.toContain('GITHUB_TOKEN=');
    expect(seen).toContain(`PATH=${shims}:`);
    expect(seen).toContain('GIT_CONFIG_COUNT=1');
    expect(seen).toContain('GIT_LITERAL_PATHSPECS=1');
    expect(seen).toContain('GIT_TERMINAL_PROMPT=0');
  });
});
