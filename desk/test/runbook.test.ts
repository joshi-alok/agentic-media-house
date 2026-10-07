import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs, USAGE } from '../src/cli';
import { useScratch } from './support/context';
import { ISOLATED, git } from './support/repo';
import { secretsIn } from './support/secrets';
import { ROOT, loadWorkflow, stringsWith } from './support/workflow';

// docs/runbook.md is the list of operations that put the publication on the air: the commands to type and what to expect. Nothing in it can be run by a test, because every
// operation of it meets GitHub, Cloudflare or a real model. What a test can do is keep it from lying about the repository, and from teaching anyone to leak a secret: every
// command of the repository that it names exists and takes the options it is given, every workflow and file it names is there, the names agree with the files that fix them
// (the secrets with the workflows, the times with the schedule, the Worker with wrangler.jsonc), no secret is ever on a command line, and every step says what to expect.

const scratch = useScratch();
const TEXT = readFileSync(`${ROOT}docs/runbook.md`, 'utf8');
const LINES = TEXT.split('\n');
const PKG = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { scripts: Record<string, string> };
const VERIFIER_USAGE = readFileSync(`${ROOT}desk/evals/run-verifier.ts`, 'utf8');

interface Step {
  number: number;
  title: string;
  /** The text of the step, from its heading to the next heading. */
  text: string;
  /** The lines of its fenced blocks, and the language of each block. */
  blocks: { lang: string; lines: string[] }[];
}

/** The steps of the runbook, as the `### N. Title` headings split it, with the fenced blocks of each. */
function stepsOf(lines: readonly string[]): Step[] {
  const steps: Step[] = [];
  let current: Step | undefined;
  let block: { lang: string; lines: string[] } | undefined;
  for (const line of lines) {
    const fence = /^```(\S*)\s*$/.exec(line);
    if (block !== undefined) {
      if (fence !== null && fence[1] === '') {
        current?.blocks.push(block);
        block = undefined;
      } else {
        block.lines.push(line);
      }
      if (current !== undefined) current.text += `${line}\n`;
      continue;
    }
    const heading = /^### (\d+)\. (.+)$/.exec(line);
    if (heading !== null) {
      current = { number: Number(heading[1]), title: heading[2]!, text: '', blocks: [] };
      steps.push(current);
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      current = undefined;
      continue;
    }
    if (current !== undefined) current.text += `${line}\n`;
    if (fence !== null && current !== undefined) block = { lang: fence[1]!, lines: [] };
  }
  return steps;
}

const STEPS = stepsOf(LINES);
/** Every line of every fenced block of the runbook that holds a command (not the text of a file that the reader makes). */
const COMMANDS = STEPS.flatMap((step) => step.blocks.filter((block) => block.lang === 'bash').flatMap((block) => block.lines)).filter((line) => line.trim() !== '');

describe('docs/runbook.md: its shape', () => {
  it('has its parts numbered from 1 and its steps numbered from 1, in order, with no step missing', () => {
    const parts = LINES.flatMap((line) => /^## Part (\d+)\. /.exec(line)?.[1] ?? []).map(Number);
    expect(parts).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(STEPS.map((step) => step.number)).toEqual(STEPS.map((_, at) => at + 1));
    expect(STEPS.length).toBeGreaterThanOrEqual(30);
  });

  it('gives every step the exact commands, in a block of its own, and what to expect', () => {
    for (const step of STEPS) {
      // A step that is done in the dashboard of Cloudflare has no command to give, and says so in its title.
      if (!step.title.endsWith('(in the dashboard)')) expect(step.blocks.length, `step ${step.number}: ${step.title}`).toBeGreaterThan(0);
      expect(step.text, `step ${step.number}: ${step.title}`).toMatch(/^\*\*Expect:\*\*/m);
    }
  });

  it('marks as outward every step that sends something to GitHub, Cloudflare or the model, or that spends money, and no step that only reads or changes this checkout', () => {
    const OUTWARD = [/\bgh (?:secret set|repo create|workflow (?:run|enable|disable)|variable set|api -X)/, /\bgit push\b/, /\bwrangler"? (?:login|r2 bucket (?:create|lifecycle add|dev-url disable)|deploy|rollback)\b/, /ANTHROPIC_API_KEY="\$\(cat /];
    const outward = (step: Step): boolean => step.blocks.some((block) => block.lines.some((line) => OUTWARD.some((pattern) => pattern.test(line))));
    const wrong = STEPS.filter((step) => /\(outward/.test(step.title) !== outward(step)).map((step) => `step ${step.number}: ${step.title}`);
    expect(wrong).toEqual([]);
  });

  it('refers only to steps that there are, and never to a step that comes later than the one that refers to it, unless it says what to do then', () => {
    for (const step of STEPS) {
      for (const match of step.text.matchAll(/\bsteps? (\d+)(?: and (\d+))?/g)) {
        for (const number of [match[1], match[2]].flatMap((value) => (value === undefined ? [] : [Number(value)]))) {
          expect(number, `step ${step.number} refers to step ${number}`).toBeGreaterThanOrEqual(1);
          expect(number, `step ${step.number} refers to step ${number}`).toBeLessThanOrEqual(STEPS.length);
        }
      }
    }
    const introduction = LINES.slice(0, LINES.indexOf('## Part 1. Before anything goes outward')).join('\n');
    for (const match of introduction.matchAll(/\bsteps? (\d+)/g)) expect(Number(match[1])).toBeLessThanOrEqual(STEPS.length);
  });

  it('is plain ASCII, like the rest of the source', () => {
    expect([...TEXT].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('docs/runbook.md: the commands of the repository that it names', () => {
  const npmLines = COMMANDS.flatMap((line) => [...line.matchAll(/\bnpm (?:run )?([\w:.-]+)/g)].map((match) => ({ line, script: match[1]!, command: /\bnpm run /.test(match[0]) || match[1] === 'test' ? 'script' : 'other' })));

  it('runs only scripts that package.json has, and only the npm commands that install or run', () => {
    expect(npmLines.length).toBeGreaterThan(8);
    for (const { line, script, command } of npmLines) {
      if (script === 'ci') continue;
      expect(command, line).toBe('script');
      expect(PKG.scripts, line).toHaveProperty(script);
    }
  });

  it('names a workspace only when there is one', () => {
    const names = ['@robywire/desk', '@robywire/site', '@robywire/gate', '@robywire/evals'];
    for (const line of COMMANDS) for (const match of line.matchAll(/--workspace (\S+)/g)) expect(names, line).toContain(match[1]);
  });

  /** The words of `npm run desk -- ...` commands of the runbook, with the command and options of each. */
  const deskCommands = COMMANDS.flatMap((line) => [...line.matchAll(/npm run desk -- ([^)|;]+)/g)].map((match) => match[1]!.trim())).filter((text) => text !== '');

  it('gives every desk command a command that the usage lists, and only options that the usage lists for it', () => {
    expect(deskCommands.length).toBeGreaterThan(6);
    for (const text of deskCommands) {
      const [command, ...rest] = text.split(/\s+/);
      expect(USAGE, text).toContain(`desk ${command}`);
      const usageLine = USAGE.split('\n').find((line) => line.startsWith(`  desk ${command}`))!;
      for (const option of rest.filter((word) => word.startsWith('--'))) expect(usageLine, `${text}: ${option}`).toContain(option);
    }
  });

  it('gives every desk command that has no placeholder in it arguments that the command line accepts, as it will be typed', () => {
    const typed = deskCommands.filter((text) => !text.includes('<'));
    expect(typed.length).toBeGreaterThan(4);
    for (const text of typed) {
      const words = text.match(/"[^"]*"|\S+/g)!.map((word) => word.replace(/^"|"$/g, ''));
      const result = parseArgs(words);
      expect(result.ok, `${text}: ${result.ok ? '' : result.message}`).toBe(true);
    }
  });

  it('gives the verifier evals only options that they have', () => {
    const lines = COMMANDS.filter((line) => line.includes('npm run evals:verifier'));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) for (const option of line.match(/--[a-z-]+/g) ?? []) if (option !== '--client' || true) expect(VERIFIER_USAGE, `${line}: ${option}`).toContain(`'${option}'`);
  });
});

describe('docs/runbook.md: the files and the workflows that it names', () => {
  it('names only files of the repository that are there', () => {
    const named = [...TEXT.matchAll(/`((?:\.github|desk|site|docs)\/[\w./-]+|desk\.config\.yml|wrangler\.jsonc|sources\.yml|package\.json)`/g)].map((match) => match[1]!);
    expect(named.length).toBeGreaterThan(8);
    for (const file of named) expect(existsSync(path.join(ROOT, file)), file).toBe(true);
  });

  it('starts, enables and disables only workflows that exist, and starts only those that can be started by hand', () => {
    const named = COMMANDS.flatMap((line) => [...line.matchAll(/gh workflow (run|enable|disable) (\S+\.yml)/g)].map((match) => ({ action: match[1]!, file: match[2]! })));
    expect(named.length).toBeGreaterThan(4);
    for (const { action, file } of named) {
      expect(existsSync(path.join(ROOT, '.github/workflows', file)), file).toBe(true);
      if (action === 'run') expect(loadWorkflow(file).on, file).toHaveProperty('workflow_dispatch');
    }
  });

  it('says the times of the schedule that the daily workflow has, as the times of the day', () => {
    const crons = (loadWorkflow('desk.yml').on.schedule as { cron: string }[]).map(({ cron }) => /^(\d+) (\d+) /.exec(cron)!).map((match) => `${match[2]!.padStart(2, '0')}:${match[1]!.padStart(2, '0')}`);
    expect(crons).toEqual(['04:30', '06:30', '08:30']);
    for (const time of crons) expect(TEXT, time).toContain(time);
  });

  it('lists as the secrets of the repository exactly the ones that the workflows read', () => {
    const used = new Set<string>();
    for (const file of ['desk.yml', 'deploy.yml']) for (const { value } of stringsWith(loadWorkflow(file), 'secrets.')) used.add(/secrets\.([A-Z0-9_]+)/.exec(value)![1]!);
    const step10 = STEPS.find((step) => step.number === 10)!;
    const listed = [...step10.text.matchAll(/`([A-Z][A-Z0-9_]{5,})`/g)].map((match) => match[1]!).filter((name) => used.has(name) || /^(?:ANTHROPIC|CLOUDFLARE|R2)_/.test(name));
    expect([...new Set(listed)].sort()).toEqual([...used].sort());
    expect([...used].sort()).toHaveLength(7);
  });

  it('uses the names that wrangler.jsonc and the workflows fix: the Worker, the address of the site, and one name for the bucket and the repository', () => {
    const wrangler = JSON.parse(readFileSync(`${ROOT}wrangler.jsonc`, 'utf8')) as { name: string };
    const deploy = readFileSync(`${ROOT}.github/workflows/deploy.yml`, 'utf8');
    const site = /'(https:\/\/[^']+\.workers\.dev)'/.exec(deploy)![1]!;
    expect(site).toBe(`https://${wrangler.name}.joshi-alok.workers.dev`);
    expect(TEXT).toContain(site);
    expect(TEXT).toContain(`a Worker named \`${wrangler.name}\``);
    const buckets = new Set([...TEXT.matchAll(/agentic-media-house-[a-z]+/g)].map((match) => match[0]));
    expect([...buckets]).toEqual(['agentic-media-house-evidence']);
    const repositories = new Set([...TEXT.matchAll(/joshi-alok\/[a-z-]+/g)].map((match) => match[0]));
    expect([...repositories]).toEqual(['joshi-alok/agentic-media-house']);
  });
});

describe('docs/runbook.md: the secrets', () => {
  it('has nothing in it shaped like a key, a token or an account id', () => {
    expect(secretsIn(TEXT)).toEqual([]);
  });

  it('puts no secret on a command line: a line that names one is one of the few forms that read it from a file, or the line of a file that the reader makes, with a placeholder for the value', () => {
    const NAMES = /ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|R2_ENDPOINT|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/;
    const ALLOWED = [
      /^gh secret set ANTHROPIC_API_KEY --repo joshi-alok\/agentic-media-house < ~\/\.config\/agentic-media-house\/anthropic\.key$/,
      /^(?:\( set -a; \. ~\/\.config\/agentic-media-house\/r2\.env; set \+a; )?ANTHROPIC_API_KEY="\$\(cat ~\/\.config\/agentic-media-house\/anthropic\.key\)" npm run (?:desk -- |evals:verifier -- )[^|;]*?\)?$/,
      /^R2_ENDPOINT=https:\/\/<account id>\.r2\.cloudflarestorage\.com$/,
      /^R2_BUCKET=agentic-media-house-evidence$/,
      /^R2_ACCESS_KEY_ID=<[^>]+>$/,
      /^R2_SECRET_ACCESS_KEY=<[^>]+>$/,
      /^CLOUDFLARE_API_TOKEN=<[^>]+>$/,
      /^CLOUDFLARE_ACCOUNT_ID=<[^>]+>$/,
    ];
    const blocks = STEPS.flatMap((step) => step.blocks.flatMap((block) => block.lines));
    const named = blocks.filter((line) => NAMES.test(line));
    expect(named.length).toBeGreaterThan(8);
    for (const line of named) expect(ALLOWED.some((pattern) => pattern.test(line.trim())), line).toBe(true);
  });

  it('never sets a secret with a value on the command line: no --body, no -b, no pipe from echo or printf', () => {
    for (const line of COMMANDS.filter((candidate) => candidate.includes('gh secret set'))) {
      expect(line, line).not.toMatch(/\s(?:--body|-b)\b/);
      expect(line, line).not.toMatch(/(?:echo|printf|cat <<)/);
      expect(line, line).toMatch(/<\s*~\/\.config\/agentic-media-house\/[a-z.-]+|--env-file ~\/\.config\/agentic-media-house\/[a-z0-9.-]+\.env$/);
    }
  });

  it('keeps the files of secrets out of the repository: they are under ~/.config, and the mode of the folder and of the files is said', () => {
    expect(TEXT).toContain('chmod 700 ~/.config/agentic-media-house');
    expect(TEXT).toContain('chmod 600 ~/.config/agentic-media-house/*');
    for (const line of COMMANDS.filter((candidate) => /\.(?:env|key)\b/.test(candidate))) expect(line, line).toContain('~/.config/agentic-media-house/');
  });
});

describe('docs/runbook.md: step 2, the rewrite of the history, as it is written', () => {
  const blocks = STEPS.find((step) => step.number === 2)!.blocks.filter((block) => block.lang === 'bash');
  const rewrite = blocks[0]!;
  const clean = blocks[1]!;
  const NEW = '185603530+joshi-alok@users.noreply.github.com';

  /** Run the commands of a block the way that a person types them into bash, in `cwd`, and give what they print. */
  const run = (block: { lines: string[] }, cwd: string): string => execFileSync('bash', ['--noprofile', '--norc', '-e', '-c', block.lines.join('\n')], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ISOLATED } });

  /** A repository of three commits by someone else, a tag on the second, and nothing that a push could carry that is not in them. */
  function history(): string {
    const dir = scratch();
    git(dir, 'init', '--quiet', '-b', 'main');
    git(dir, 'config', 'user.name', 'Someone Else');
    git(dir, 'config', 'user.email', 'someone.else@example.com');
    for (const name of ['one', 'two', 'three']) {
      writeFileSync(path.join(dir, `${name}.txt`), `${name}\n`);
      git(dir, 'add', '.');
      git(dir, 'commit', '--quiet', '-m', name);
      if (name === 'two') git(dir, 'tag', 'before-plan');
    }
    return dir;
  }

  it('gives every commit the address of GitHub for the author and for the committer, moves the tag to the commit that was tagged, and changes no file', () => {
    const dir = history();
    const before = git(dir, 'rev-parse', 'HEAD~1');
    const said = run(rewrite, dir).trim().split('\n');
    expect(said.filter((line) => line.startsWith('Rewrite ')).length).toBeGreaterThan(0);
    expect(said.slice(-2)).toEqual([`Joshi-Alok <${NEW}> Joshi-Alok <${NEW}>`, 'before-plan']);
    expect(git(dir, 'log', '--format=%s', 'main')).toBe('three\ntwo\none');
    expect(git(dir, 'log', '-1', '--format=%s', 'before-plan')).toBe('two');
    expect(git(dir, 'rev-parse', 'before-plan')).not.toBe(before);
    expect(git(dir, 'diff', 'backup-before-rewrite', '--stat')).toBe('');
    expect(git(dir, 'log', '--all', '--format=%ae')).toContain('someone.else@example.com');
  });

  it('then removes the old history, so that no object that a push could carry has the old address, and says so with one line', () => {
    const dir = history();
    run(rewrite, dir);
    const said = run(clean, dir).trim().split('\n');
    expect(said[0]).toMatch(/^Deleted branch backup-before-rewrite/);
    expect(said.at(-1)).toBe(`${NEW} ${NEW}`);
    expect(git(dir, 'for-each-ref', '--format=%(refname)', 'refs/original')).toBe('');
    expect(git(dir, 'branch', '--list', 'backup-before-rewrite')).toBe('');
    expect(git(dir, 'log', '--all', '--format=%ae')).not.toContain('someone.else');
    expect(git(dir, 'count-objects', '-v')).toContain('garbage: 0');
  });

  it('runs where it is told and nowhere else: it never names a path, a remote or a push', () => {
    for (const line of [...rewrite.lines, ...clean.lines]) {
      expect(line).not.toMatch(/\bgit (?:push|remote|clone|fetch)\b/);
      expect(line).not.toMatch(/(?:^|\s)\/|\.\.\//);
    }
  });
});

