import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs, USAGE } from '../src/cli';
import { tier1Newsrooms, tier2Feeds } from '../src/index';
import { REASON_LABELS } from '../../site/src/lib/reasons';
import { CHECK_IDS, loadSources } from '@robywire/gate';
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

/** The step whose title starts as `pattern` says: a step is found by what it is, and not by its number, which changes when a step is added. */
function stepTitled(pattern: RegExp): Step {
  const found = STEPS.filter((step) => pattern.test(step.title));
  if (found.length !== 1) throw new Error(`${found.length} steps have a title like ${pattern}`);
  return found[0]!;
}
/** Every line of every fenced block of the runbook that holds a command (not the text of a file that the reader makes). */
const COMMANDS = STEPS.flatMap((step) => step.blocks.filter((block) => block.lang === 'bash').flatMap((block) => block.lines)).filter((line) => line.trim() !== '');

describe('docs/runbook.md: its shape', () => {
  it('has its parts numbered from 1 and its steps numbered from 1, in order, with no step missing', () => {
    const parts = LINES.flatMap((line) => /^## Part (\d+)\. /.exec(line)?.[1] ?? []).map(Number);
    expect(parts).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(STEPS.map((step) => step.number)).toEqual(STEPS.map((_, at) => at + 1));
    expect(STEPS.length).toBeGreaterThanOrEqual(38);
  });

  it('gives every step the exact commands, in a block of its own, and what to expect', () => {
    for (const step of STEPS) {
      // A step that is done in the dashboard of Cloudflare has no command to give, and says so in its title.
      if (!step.title.endsWith('(in the dashboard)')) expect(step.blocks.length, `step ${step.number}: ${step.title}`).toBeGreaterThan(0);
      expect(step.text, `step ${step.number}: ${step.title}`).toMatch(/^\*\*Expect:\*\*/m);
    }
  });

  it('marks as outward every step that sends something to GitHub, Cloudflare or the model, or that spends money, and no step that only reads or changes this checkout', () => {
    const OUTWARD = [/\bgh (?:secret set|repo (?:create|delete)|workflow (?:run|enable|disable)|variable (?:set|delete)|api -X)/, /\bgit push\b/, /\bwrangler"? (?:login|r2 bucket (?:create|lifecycle add|dev-url disable)|deploy|rollback)\b/, /ANTHROPIC_API_KEY="\$\(cat /];
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

  it('lists as the secrets of the repository exactly the ones that the workflows read: the names that its files hold, and the one that is set from its own file', () => {
    const used = new Set<string>();
    for (const file of ['desk.yml', 'deploy.yml']) for (const { value } of stringsWith(loadWorkflow(file), 'secrets.')) used.add(/secrets\.([A-Z0-9_]+)/.exec(value)![1]!);
    // The names that `gh secret set --env-file` sets are those of the lines of the files of the reader, and `gh secret set NAME < file` names its own.
    const fileNames = STEPS.flatMap((step) => step.blocks.filter((block) => block.lang === 'text').flatMap((block) => block.lines)).flatMap((line) => /^([A-Z][A-Z0-9_]+)=/.exec(line)?.[1] ?? []);
    const named = COMMANDS.flatMap((line) => /^gh secret set ([A-Z][A-Z0-9_]+) /.exec(line)?.[1] ?? []);
    expect([...new Set([...fileNames, ...named])].sort()).toEqual([...used].sort());
    expect([...used].sort()).toHaveLength(7);
  });

  it('lists as the secrets that step 11 sets the six that are not the key of the model, and sets the key of the model at the first step that needs it, which is not before the first push', () => {
    const set = stepTitled(/^Set the secrets of the repository/);
    expect(set.blocks.flatMap((block) => block.lines).some((line) => line.includes('ANTHROPIC_API_KEY'))).toBe(false);
    for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'R2_ACCESS_KEY_ID', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_SECRET_ACCESS_KEY']) expect(set.text, name).toContain(`\`${name}\``);
    const first = STEPS.find((step) => step.blocks.some((block) => block.lines.some((line) => line.startsWith('gh secret set ANTHROPIC_API_KEY --repo joshi-alok/agentic-media-house '))))!;
    expect(first.title).toMatch(/^Rehearse on GitHub/);
    expect(first.number).toBeGreaterThan(stepTitled(/^Push, and watch/).number);
    expect(first.number).toBeLessThan(stepTitled(/^Let the Desk go/).number);
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
    // The second is the private repository of the rehearsal of a held piece, which is made and deleted in one step.
    expect([...repositories].sort()).toEqual(['joshi-alok/agentic-media-house', 'joshi-alok/rehearsal-of-the-desk']);
  });
});

describe('docs/runbook.md: the secrets', () => {
  it('has nothing in it shaped like a key, a token or an account id', () => {
    expect(secretsIn(TEXT)).toEqual([]);
  });

  it('puts no secret on a command line: a line that names one is one of the few forms that read it from a file, or the line of a file that the reader makes, with a placeholder for the value', () => {
    const NAMES = /ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|R2_ENDPOINT|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/;
    const ALLOWED = [
      /^gh secret set ANTHROPIC_API_KEY --repo joshi-alok\/(?:agentic-media-house|rehearsal-of-the-desk) < ~\/\.config\/agentic-media-house\/anthropic\.key$/,
      /^\( set -a; \. ~\/\.config\/agentic-media-house\/r2\.env; set \+a; curl -s -o \/dev\/null -w '%\{http_code\}\\n' "\$R2_ENDPOINT\/\$R2_BUCKET\/(?:pending\/anonymous-request)?" \)$/,
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

describe('docs/runbook.md: the rewrite of the history (step 2), as it is written', () => {
  const blocks = stepTitled(/^Rewrite the author and committer/).blocks.filter((block) => block.lang === 'bash');
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


describe('docs/runbook.md: what it says is true of the repository', () => {
  it('runs the two searches of step 1 over the files that git tracks, and they find nothing: no key, no e-mail address of anyone', () => {
    const step = stepTitled(/^Check the repository/);
    const searches = step.blocks[0]!.lines.filter((line) => line.startsWith('git grep'));
    expect(searches).toHaveLength(2);
    for (const search of searches) {
      const found = execFileSync('bash', ['--noprofile', '--norc', '-c', `${search}; true`], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...ISOLATED } });
      expect(found, search).toBe('');
    }
  });

  it('leaves the plans out of those searches because they quote the made-up keys and addresses of the tests, and holds the plans to a list of exactly those', () => {
    const searches = stepTitled(/^Check the repository/).blocks[0]!.lines.filter((line) => line.startsWith('git grep'));
    for (const search of searches) expect(search).toContain("':!docs/superpowers/plans'");
    const matches = (search: string): Set<string> => {
      const pattern = /-E '([^']+)'/.exec(search)?.[1] as string;
      const out = execFileSync('bash', ['--noprofile', '--norc', '-c', 'git grep -h -I -o -E "$1" -- docs/superpowers/plans; true', 'bash', pattern], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...ISOLATED } });
      return new Set(out.split('\n').filter((line) => line !== ''));
    };
    const nobodys = /users\.noreply\.github\.com|noreply@anthropic\.com|@[a-z0-9.-]*\.(example|test|invalid)|@example\.(com|org|net)/i;
    const keyId = (rest: string): string => ['AK', 'IA', rest].join('');
    expect([...matches(searches[0] as string)].sort()).toEqual(
      [keyId('FAKEFAKEFAKEFAKE'), keyId('IOSFODNN7EXAMPLE'), keyId('MADEUPKEYID12345'), keyId('OTHEROTHEROTHER0'), ['sk-a', 'nt-'].join('')].sort(),
    );
    expect([...matches(searches[1] as string)].filter((address) => !nobodys.test(address)).sort()).toEqual(
      [['jane.doe', '@', 'acme-robotics.io'].join(''), ['jane.doe+tag', '@', 'mail.acme-robotics.co.uk'].join(''), ['secret-token', '@', 'github.com'].join('')].sort(),
    );
  });

  it('names only checks and codes of the gate that there are: every G1 to G10 and every code with its prefix, as the site keeps them', () => {
    const codes = Object.keys(REASON_LABELS);
    const named = [...TEXT.matchAll(/\bG(?:10|[1-9])(?:_[A-Z0-9_]*\*?)?(?![A-Za-z0-9_])/g)].map((match) => match[0]);
    expect(named.length).toBeGreaterThan(10);
    for (const name of named) {
      if (/^G(?:10|[1-9])$/.test(name)) expect(name === 'G10' || (CHECK_IDS as readonly string[]).includes(name), name).toBe(true);
      else if (name.endsWith('*')) expect(codes.some((code) => code.startsWith(name.slice(0, -1))), name).toBe(true);
      else expect(codes, name).toContain(name);
    }
    // The mistake that this test was written for: analysis is checked by G7, and G5 is the check of quotations.
    expect(TEXT).not.toMatch(/G5 \(analysis/);
    expect(TEXT).toContain('G7 (`G7_ANALYSIS_*`');
  });

  it('forces a hold in the rehearsal by a command that makes a registry that is valid and has no primary source and still has feeds', () => {
    const rehearsal = stepTitled(/^Rehearse a held piece/);
    const command = rehearsal.blocks.flatMap((block) => block.lines).find((line) => line.startsWith('node -e "'))!;
    const dir = scratch();
    writeFileSync(path.join(dir, 'sources.yml'), readFileSync(`${ROOT}sources.yml`, 'utf8'));
    execFileSync('bash', ['--noprofile', '--norc', '-e', '-c', command], { cwd: dir, env: { ...process.env, NODE_PATH: `${ROOT}node_modules` } });
    const registry = loadSources(path.join(dir, 'sources.yml'));
    expect(tier1Newsrooms(registry)).toEqual([]);
    expect(tier2Feeds(registry).length).toBeGreaterThan(3);
  });

  it('never gives the repository of the rehearsal the secrets of Cloudflare, so that nothing can be deployed from it, and deletes only that repository', () => {
    const rehearsal = stepTitled(/^Rehearse a held piece/);
    const lines = rehearsal.blocks.flatMap((block) => block.lines);
    expect(lines.filter((line) => line.includes('cloudflare.env') || line.includes('CLOUDFLARE'))).toEqual([]);
    expect(lines.filter((line) => line.startsWith('gh repo create'))).toEqual(['gh repo create joshi-alok/rehearsal-of-the-desk --private --source . --remote origin --push']);
    expect(lines.filter((line) => line.startsWith('gh repo delete'))).toEqual(['gh repo delete joshi-alok/rehearsal-of-the-desk --yes']);
    for (const line of COMMANDS.filter((candidate) => candidate.includes('gh repo delete'))) expect(line).toContain('rehearsal-of-the-desk');
    // Every command that names the repository of the rehearsal is between its creation and its deletion, or is the one that makes it.
    const first = lines.findIndex((line) => line.startsWith('gh repo create'));
    expect(lines.slice(0, first).some((line) => line.includes('rehearsal-of-the-desk'))).toBe(false);
  });

  it('starts a rehearsal with an input that the workflow has, and the schedule is switched by a variable that the workflow reads', () => {
    const desk = loadWorkflow('desk.yml');
    const inputs = Object.keys((desk.on.workflow_dispatch as { inputs: object }).inputs);
    const given = COMMANDS.flatMap((line) => [...line.matchAll(/gh workflow run desk\.yml .*? -f (\w+)=/g)].map((match) => match[1]!));
    expect(given).toEqual(['dry']);
    for (const name of given) expect(inputs).toContain(name);
    const job = Object.values(desk.jobs)[0]!;
    expect(job.if).toContain('vars.DESK_SCHEDULE');
    const variables = COMMANDS.flatMap((line) => [...line.matchAll(/gh variable (?:set|delete|list)[^\n]*?\b(DESK_SCHEDULE|SITE_URL)\b/g)].map((match) => match[1]!));
    expect(new Set(variables)).toEqual(new Set(['DESK_SCHEDULE', 'SITE_URL']));
  });

  it('keeps the schedule off until the step that lets the Desk go: no earlier step sets DESK_SCHEDULE to on, and the push says that none is set', () => {
    const go = stepTitled(/^Let the Desk go/);
    const sets = (step: Step): string[] => step.blocks.flatMap((block) => block.lines).filter((line) => /gh variable set DESK_SCHEDULE .* --body on$/.test(line));
    for (const step of STEPS) if (step.number < go.number) expect(sets(step), `step ${step.number}`).toEqual([]);
    expect(sets(go)).toHaveLength(1);
    const push = stepTitled(/^Push, and watch/);
    expect(push.blocks.flatMap((block) => block.lines)).toContain('gh variable list --repo joshi-alok/agentic-media-house');
    // A rehearsal on GitHub comes after the first push, which it needs, and before the schedule is on.
    expect(stepTitled(/^Rehearse on GitHub/).number).toBeGreaterThan(push.number);
    expect(stepTitled(/^Rehearse on GitHub/).number).toBeLessThan(go.number);
  });

  it('does not disable the workflow to keep it from starting: the first push is made with the schedule switched off by the variable, and the stop is the variable', () => {
    const push = stepTitled(/^Push, and watch/);
    expect(push.blocks.flatMap((block) => block.lines).some((line) => line.includes('gh workflow disable'))).toBe(false);
    const stop = stepTitled(/^Stop the daily run/);
    expect(stop.blocks.flatMap((block) => block.lines)[0]).toBe('gh variable set DESK_SCHEDULE --repo joshi-alok/agentic-media-house --body off');
  });

  it('proves that the bucket is private with a request that has no signature, which must be refused, before anything is put in the bucket or the first push', () => {
    const step = stepTitled(/^Prove that the bucket is private/);
    const lines = step.blocks.flatMap((block) => block.lines);
    expect(lines.filter((line) => line.includes('curl'))).toHaveLength(2);
    for (const line of lines.filter((candidate) => candidate.includes('curl'))) {
      expect(line).toContain("-w '%{http_code}\\n'");
      expect(line).not.toMatch(/Authorization|--user|-u |-H /i);
    }
    expect(step.text).toMatch(/both `curl` commands print `400`/);
    expect(step.text).toContain('InvalidArgument');
    expect(step.text).toContain('adding `-6` to both `curl` commands');
    expect(step.text).toContain('`1034`');
    expect(step.text).toContain('dev-url get');
    expect(step.number).toBeGreaterThan(stepTitled(/^Keep the secrets in files/).number);
    expect(step.number).toBeLessThan(stepTitled(/^Push, and watch/).number);
  });

  it('checks that the owner will be told: the settings of Actions, the watch on the repository, and the command that reads whether the repository is watched', () => {
    const step = stepTitled(/^Check that GitHub will tell you/);
    expect(step.title).toMatch(/\(in the dashboard\)$/);
    expect(step.text).toContain('Send notifications for failed workflows only');
    expect(step.text).toContain('**Watch**');
    expect(step.text).toContain('A run that **holds** a piece ends green');
    expect(step.blocks.flatMap((block) => block.lines)).toEqual(["gh api repos/joshi-alok/agentic-media-house/subscription --jq '{subscribed, ignored}'"]);
  });

  it('says what enforces the budget of US$10 and what the limits of the Desk are, with the numbers of the settings of the daily run', () => {
    const budget = (readFileSync(`${ROOT}desk.config.yml`, 'utf8').match(/maxCalls: (\d+)\n\s+maxInputTokens: (\d+)\n\s+maxOutputTokens: (\d+)/) ?? []).slice(1).map(Number);
    expect(budget).toHaveLength(3);
    expect(TEXT).toContain('what enforces it is the monthly spend limit on the key in the Anthropic Console');
    expect(TEXT).toContain('The Desk does not enforce dollars');
    expect(TEXT).toContain(`a run may make ${budget[0]} calls and use ${budget[1]!.toLocaleString('en-US')} tokens in and ${budget[2]!.toLocaleString('en-US')} out`);
  });

  it('does not say that a test holds the floor of the verifier, which no test can, and says that it is a command that is run by hand after a change of the prompts', () => {
    const step = stepTitled(/^Freeze the floor/);
    expect(step.text).toContain('**Nothing holds it by itself**');
    expect(step.text).toContain('a test cannot call a model');
    expect(step.text).not.toContain('a script in `package.json`');
    expect(step.text).not.toMatch(/a test of the repository then fails/);
  });

  it('puts the four questions that the trials leave open on the way to going live, each with the evidence that decides it', () => {
    const step = stepTitled(/^Decide what the trials left open/);
    const items = step.text.split('\n').filter((line) => /^\d\. \*\*/.test(line));
    expect(items).toHaveLength(4);
    for (const item of items) expect(item, item).toMatch(/Evidence: /);
    expect(items[0]).toContain('judge the analysis sentences');
    expect(items[1]).toContain('written again');
    expect(items[2]).toContain('unreachable source');
    expect(items[3]).toContain('desk keep');
    expect(step.number).toBeLessThan(stepTitled(/^Let the Desk go/).number);
    expect(TEXT).toContain('the four questions of step 28 have an answer');
  });

  it('says, of the status after a pull, what status really says on a machine that has no folder of runs', () => {
    const step = stepTitled(/^Check what the first run left/);
    expect(step.text).toContain('`attempt not known (runs/<day>/run.json is not here)`');
    expect(readFileSync(`${ROOT}desk/src/cli.ts`, 'utf8')).toContain('attempt not known (${shown} is not here)');
  });

  it('corrects a piece in the order that keeps the correction from being lost: pause the schedule, see that no run is working, pull with a fast-forward only, correct, push, wait for the deploy, look at the live site, and only then start the schedule again', () => {
    const lines = stepTitled(/^Take a piece down/).blocks.flatMap((block) => block.lines);
    const at = (needle: string): number => lines.findIndex((line) => line.includes(needle));
    const order = ['--body off', '--status in_progress', 'git pull --ff-only', 'npm run desk -- retract', 'git push', 'gh run watch', '/corrections/', '--body on'].map(at);
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('rehearses on GitHub with nothing that can publish, in the order that the check of it needs: the key, the run with dry, the pack, and the proof that main and the deploy did not move', () => {
    const lines = stepTitled(/^Rehearse on GitHub/).blocks.flatMap((block) => block.lines);
    const at = (needle: string): number => lines.findIndex((line) => line.includes(needle));
    const order = ['gh secret set ANTHROPIC_API_KEY', 'git log origin/main -1', 'gh workflow run desk.yml', 'gh run watch', 'gh run download', 'git fetch origin', 'gh run list --workflow deploy.yml'].map(at);
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(lines.filter((line) => line.includes('gh workflow run desk.yml'))).toEqual(['gh workflow run desk.yml --repo joshi-alok/agentic-media-house --ref main -f dry=true']);
  });
});
