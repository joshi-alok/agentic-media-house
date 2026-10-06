import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DeskConfig, defaultConfig, loadConfig } from '../src/config';

// The settings of a run live in one place and are checked when they are read:
// a mistake in a config file stops the run before it starts, with a message that
// names the file and the setting.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-config-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** Write `yaml` to a file of its own and return its path. */
function configFile(yaml: string): string {
  const file = path.join(scratch, `desk-${++counter}.yml`);
  writeFileSync(file, yaml);
  return file;
}

/** The message of the error that loading `yaml` throws. */
function failure(yaml: string): string {
  const file = configFile(yaml);
  try {
    loadConfig(file);
  } catch (error) {
    return (error as Error).message.replace(file, '<file>');
  }
  throw new Error(`loadConfig accepted: ${yaml}`);
}

describe('defaultConfig', () => {
  it('holds the settings of the design', () => {
    expect(defaultConfig()).toEqual({
      recencyHours: 72,
      shortlistMax: 15,
      minClaims: 3,
      maxRevisionRounds: 2,
      userAgent: 'RobywireDesk/0.1 (+https://robywire.example/method)',
      requestIntervalMs: 1000,
      maxBytes: 2_000_000,
      budget: { maxCalls: 24, maxInputTokens: 400_000, maxOutputTokens: 60_000 },
      models: { select: 'claude-haiku-4-5-20251001', extract: 'claude-sonnet-5-5', compose: 'claude-sonnet-5-5', verify: 'claude-sonnet-5-5' },
      runDir: 'runs',
      evidenceDir: 'evidence',
    });
  });

  it('is valid under its own schema', () => {
    expect(DeskConfig.parse(defaultConfig())).toEqual(defaultConfig());
  });

  it('returns a new object each time, so one caller cannot change another caller defaults', () => {
    const first = defaultConfig();
    first.budget.maxCalls = 1;
    first.models.verify = 'changed';
    first.recencyHours = 1;
    expect(defaultConfig().budget.maxCalls).toBe(24);
    expect(defaultConfig().models.verify).toBe('claude-sonnet-5-5');
    expect(defaultConfig().recencyHours).toBe(72);
  });

  it('names the Desk and links to the /method page in the user agent, which the fetcher sends to every site', () => {
    expect(defaultConfig().userAgent).toContain('RobywireDesk');
    expect(defaultConfig().userAgent).toContain('https://robywire.example/method');
  });

  it('keeps the model names in this one place: no other file of the package spells one', () => {
    const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && file !== 'config.ts',
    );
    expect(sources).toContain('index.ts');
    for (const file of sources) expect(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), file).not.toContain('claude-');
  });
});

describe('loadConfig without a file', () => {
  it('gives the defaults', () => {
    expect(loadConfig()).toEqual(defaultConfig());
  });

  it('gives a new object each time', () => {
    expect(loadConfig()).not.toBe(loadConfig());
  });
});

describe('loadConfig with a file', () => {
  it('merges the settings of the file over the defaults', () => {
    const config = loadConfig(configFile('recencyHours: 48\nshortlistMax: 5\nrunDir: out/runs\n'));
    expect(config).toEqual({ ...defaultConfig(), recencyHours: 48, shortlistMax: 5, runDir: 'out/runs' });
  });

  it('merges the budget and the models one setting at a time', () => {
    const config = loadConfig(configFile('budget:\n  maxCalls: 10\nmodels:\n  verify: test-verifier\n'));
    expect(config.budget).toEqual({ maxCalls: 10, maxInputTokens: 400_000, maxOutputTokens: 60_000 });
    expect(config.models).toEqual({ ...defaultConfig().models, verify: 'test-verifier' });
  });

  it('gives the defaults for an empty file and for a file of comments', () => {
    expect(loadConfig(configFile(''))).toEqual(defaultConfig());
    expect(loadConfig(configFile('# nothing to change\n'))).toEqual(defaultConfig());
  });

  it('accepts a setting at the edge of what is allowed', () => {
    const config = loadConfig(configFile('maxRevisionRounds: 0\nrequestIntervalMs: 0\nminClaims: 1\nrunDir: r\n'));
    expect([config.maxRevisionRounds, config.requestIntervalMs, config.minClaims, config.runDir]).toEqual([0, 0, 1, 'r']);
  });

  it('accepts another user agent that still links to a /method page', () => {
    const config = loadConfig(configFile('userAgent: "OtherDesk/2 (+https://example.test/method)"\n'));
    expect(config.userAgent).toBe('OtherDesk/2 (+https://example.test/method)');
  });

  it('does not change the defaults of the next caller', () => {
    loadConfig(configFile('recencyHours: 1\nbudget:\n  maxCalls: 1\n'));
    expect(loadConfig()).toEqual(defaultConfig());
  });
});

describe('loadConfig refuses a mistake, and says where it is', () => {
  it('a negative budget, naming the setting', () => {
    expect(failure('budget:\n  maxCalls: -1\n')).toBe('desk config <file>: budget.maxCalls: Too small: expected number to be >0');
  });

  it('a setting that does not exist, naming it', () => {
    expect(failure('recencyDays: 3\n')).toBe('desk config <file>: Unrecognized key: "recencyDays"');
  });

  it('a setting that does not exist inside the budget or the models, naming where', () => {
    expect(failure('budget:\n  maxCall: 3\n')).toBe('desk config <file>: budget: Unrecognized key: "maxCall"');
    expect(failure('models:\n  summarise: x\n')).toBe('desk config <file>: models: Unrecognized key: "summarise"');
  });

  it('a number that is not a whole number, or not a number', () => {
    expect(failure('recencyHours: 1.5\n')).toBe('desk config <file>: recencyHours: Invalid input: expected int, received number');
    expect(failure('recencyHours: soon\n')).toBe('desk config <file>: recencyHours: Invalid input: expected number, received string');
  });

  it.each(['recencyHours', 'shortlistMax', 'minClaims', 'maxBytes', 'budget:\n  maxInputTokens', 'budget:\n  maxOutputTokens'])('%s of zero', (key) => {
    expect(failure(`${key}: 0\n`)).toContain('Too small: expected number to be >0');
  });

  it('a negative number of revision rounds, or a negative pause between requests', () => {
    expect(failure('maxRevisionRounds: -1\n')).toBe('desk config <file>: maxRevisionRounds: Too small: expected number to be >=0');
    expect(failure('requestIntervalMs: -5\n')).toBe('desk config <file>: requestIntervalMs: Too small: expected number to be >=0');
  });

  it('a user agent that does not link to the /method page', () => {
    expect(failure('userAgent: RobywireDesk\n')).toBe(
      'desk config <file>: userAgent: must include the address of the /method page, such as https://robywire.example/method',
    );
  });

  it('an empty model name or folder name', () => {
    expect(failure('models:\n  select: ""\n')).toContain('models.select: Too small');
    expect(failure('runDir: ""\n')).toContain('runDir: Too small');
    expect(failure('evidenceDir: ""\n')).toContain('evidenceDir: Too small');
  });

  it('every problem at once, separated by semicolons', () => {
    expect(failure('recencyHours: 0\nbudget:\n  maxCalls: -1\n')).toBe(
      'desk config <file>: recencyHours: Too small: expected number to be >0; budget.maxCalls: Too small: expected number to be >0',
    );
  });

  it('a budget or a models entry that is not a mapping', () => {
    expect(failure('budget: 5\n')).toBe('desk config <file>: budget: Invalid input: expected object, received number');
  });

  it('a file that is not a mapping of settings', () => {
    expect(failure('- 72\n- 15\n')).toBe('desk config <file>: Invalid input: expected object, received array');
  });

  it('a file that is not YAML', () => {
    expect(failure('recencyHours: [72\n')).toMatch(/^desk config <file>: not valid YAML \(/);
  });

  it('a file that sets a key twice', () => {
    expect(failure('recencyHours: 1\nrecencyHours: 2\n')).toMatch(/^desk config <file>: not valid YAML \(.*unique/);
  });

  it('a file that is not there, naming it', () => {
    const missing = path.join(scratch, 'missing.yml');
    expect(() => loadConfig(missing)).toThrow(`desk config ${missing}: cannot read the file (ENOENT)`);
  });
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
    const ignored = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split('\n');
    expect(ignored).toContain(`${defaultConfig().runDir}/`);
    expect(ignored).toContain(`${defaultConfig().evidenceDir}/`);
  });
});
