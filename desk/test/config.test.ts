import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PUBLICATION_NAME } from '@robywire/gate';
import { DeskConfig, EVIDENCE_KINDS, defaultConfig, loadConfig, placeholderHost } from '../src/config';

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
  it('has a budget of calls that holds the worst case of a piece that the model check holds', () => {
    // Select, Extract, Compose, a revision and a model check for each round, and one more model check: the worst case of a hold by the model check, without retries.
    const { budget, maxRevisionRounds, modelCheckRevisions } = defaultConfig();
    expect(budget.maxCalls).toBeGreaterThanOrEqual(3 + 2 * (maxRevisionRounds + modelCheckRevisions) + 1);
  });

  it('holds the settings of the design', () => {
    expect(defaultConfig()).toEqual({
      recencyHours: 72,
      shortlistMax: 15,
      shortlistPerSource: 3,
      minClaims: 3,
      maxRevisionRounds: 2,
      modelCheckRevisions: 1,
      maxAttemptsPerDay: 3,
      userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
      requestIntervalMs: 1000,
      maxBytes: 2_000_000,
      maxPageChars: 150_000,
      budget: { maxCalls: 24, maxInputTokens: 400_000, maxOutputTokens: 60_000 },
      models: { select: 'claude-haiku-4-5-20251001', extract: 'claude-sonnet-5-5', compose: 'claude-sonnet-5-5', verify: 'claude-sonnet-5-5' },
      runDir: 'runs',
      evidenceDir: 'evidence',
      evidence: { kind: 'local' },
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
    expect(defaultConfig().userAgent).toContain('AgenticMediaHouseDesk');
    expect(defaultConfig().userAgent).toContain('https://agenticmediahouse.example/method');
    expect(defaultConfig().userAgent).toBe('AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)');
  });

  it('starts the user agent with the name of the publication without its spaces, and a placeholder address says so to a live run', () => {
    expect(defaultConfig().userAgent.startsWith(`${PUBLICATION_NAME.replaceAll(' ', '')}Desk/`)).toBe(true);
    expect(placeholderHost(defaultConfig().userAgent)).toBe('agenticmediahouse.example');
  });

  it('spells the name of the publication in this one place: the prompts take it from the gate and no other file of the package writes it', () => {
    const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && file !== 'config.ts',
    );
    expect(sources).toContain('index.ts');
    for (const file of sources) {
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      expect(text, file).not.toMatch(/agentic\s?media\s?house/i);
      expect(text, file).not.toMatch(/robywire(?!\/)/i);
    }
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
    const config = loadConfig(configFile('maxRevisionRounds: 0\nmodelCheckRevisions: 0\nrequestIntervalMs: 0\nminClaims: 1\nmaxAttemptsPerDay: 1\nrunDir: r\n'));
    expect([config.maxRevisionRounds, config.modelCheckRevisions, config.requestIntervalMs, config.minClaims, config.maxAttemptsPerDay, config.runDir]).toEqual([0, 0, 0, 1, 1, 'r']);
  });

  it('takes the number of tries that a day may have from the file', () => {
    expect(loadConfig(configFile('maxAttemptsPerDay: 5\n')).maxAttemptsPerDay).toBe(5);
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

  it.each(['recencyHours', 'shortlistMax', 'minClaims', 'maxAttemptsPerDay', 'maxBytes', 'maxPageChars', 'budget:\n  maxInputTokens', 'budget:\n  maxOutputTokens'])('%s of zero', (key) => {
    expect(failure(`${key}: 0\n`)).toContain('Too small: expected number to be >0');
  });

  it('a number of tries a day that is not a whole number of at least 1', () => {
    expect(failure('maxAttemptsPerDay: -1\n')).toBe('desk config <file>: maxAttemptsPerDay: Too small: expected number to be >0');
    expect(failure('maxAttemptsPerDay: 2.5\n')).toBe('desk config <file>: maxAttemptsPerDay: Invalid input: expected int, received number');
  });

  it('a negative number of revision rounds, or a negative pause between requests', () => {
    expect(failure('maxRevisionRounds: -1\n')).toBe('desk config <file>: maxRevisionRounds: Too small: expected number to be >=0');
    expect(failure('modelCheckRevisions: -1\n')).toBe('desk config <file>: modelCheckRevisions: Too small: expected number to be >=0');
    expect(failure('requestIntervalMs: -5\n')).toBe('desk config <file>: requestIntervalMs: Too small: expected number to be >=0');
  });

  it('a user agent that does not link to the /method page', () => {
    expect(failure('userAgent: AgenticMediaHouseDesk\n')).toBe(
      'desk config <file>: userAgent: must include the address of the /method page, such as https://agenticmediahouse.example/method',
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

describe('the evidence store setting', () => {
  it('is the folder `evidenceDir` unless the file says r2, and has no other kind', () => {
    expect([...EVIDENCE_KINDS]).toEqual(['local', 'r2']);
    expect(defaultConfig().evidence).toEqual({ kind: 'local' });
    expect(loadConfig(configFile('evidence:\n  kind: r2\n')).evidence).toEqual({ kind: 'r2' });
    expect(loadConfig(configFile('evidence:\n  kind: local\n')).evidence).toEqual({ kind: 'local' });
    expect(loadConfig(configFile('evidence:\n  kind: r2\nevidenceDir: elsewhere\n'))).toEqual({ ...defaultConfig(), evidence: { kind: 'r2' }, evidenceDir: 'elsewhere' });
  });

  it('does not change the defaults of the next caller', () => {
    const first = defaultConfig();
    first.evidence.kind = 'r2';
    expect(defaultConfig().evidence.kind).toBe('local');
  });

  it('refuses another kind, a missing kind, and a setting that is not a mapping, naming the setting', () => {
    expect(failure('evidence:\n  kind: s3\n')).toBe('desk config <file>: evidence.kind: Invalid option: expected one of "local"|"r2"');
    expect(failure('evidence:\n  kind: ""\n')).toBe('desk config <file>: evidence.kind: Invalid option: expected one of "local"|"r2"');
    expect(failure('evidence: {}\n')).toBe('desk config <file>: evidence.kind: Invalid option: expected one of "local"|"r2"');
    expect(failure('evidence: r2\n')).toBe('desk config <file>: evidence: Invalid input: expected object, received string');
  });

  it.each(['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'])('refuses %s in the setting, because the address, the name and the keys of a bucket are read from the environment and never from a file', (key) => {
    expect(failure(`evidence:\n  kind: r2\n  ${key}: fake-value-123\n`)).toBe(`desk config <file>: evidence: Unrecognized key: "${key}"`);
  });

  it.each(['r2', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'R2_ENDPOINT', 'R2_BUCKET', 'r2SecretAccessKey', 'secretAccessKey', 'bucket'])('refuses %s as a setting of its own', (key) => {
    expect(failure(`${key}: fake-value-123\n`)).toBe(`desk config <file>: Unrecognized key: "${key}"`);
  });

  it('never repeats what a refused key held: a secret that was put in a file is not in the message', () => {
    for (const yaml of ['evidence:\n  kind: r2\n  secretAccessKey: fake-secret-value-123\n', 'R2_SECRET_ACCESS_KEY: fake-secret-value-123\n', 'evidence: fake-secret-value-123\n', 'evidence:\n  kind: fake-secret-value-123\n']) {
      expect(failure(yaml), yaml).not.toContain('fake-secret-value-123');
    }
  });
});

describe('the prices setting', () => {
  it('is not there unless the file has it: the Desk does not know what a model costs and never makes a price up', () => {
    expect(defaultConfig()).not.toHaveProperty('prices');
    expect(loadConfig(configFile('recencyHours: 48\n'))).not.toHaveProperty('prices');
    expect(loadConfig().prices).toBeUndefined();
  });

  it('is the price of a million tokens in and of a million tokens out, in dollars, as the file gives them', () => {
    expect(loadConfig(configFile('prices:\n  inputPerMillion: 3\n  outputPerMillion: 15\n')).prices).toEqual({ inputPerMillion: 3, outputPerMillion: 15 });
    expect(loadConfig(configFile('prices:\n  inputPerMillion: 0.8\n  outputPerMillion: 4.25\n')).prices).toEqual({ inputPerMillion: 0.8, outputPerMillion: 4.25 });
    expect(loadConfig(configFile('prices: { inputPerMillion: 1, outputPerMillion: 5 }\n'))).toEqual({ ...defaultConfig(), prices: { inputPerMillion: 1, outputPerMillion: 5 } });
  });

  it('refuses a price that is not a number above zero, a price that is missing, one that does not exist, and a block that is not a mapping, naming the setting', () => {
    expect(failure('prices:\n  inputPerMillion: 0\n  outputPerMillion: 15\n')).toBe('desk config <file>: prices.inputPerMillion: Too small: expected number to be >0');
    expect(failure('prices:\n  inputPerMillion: 3\n  outputPerMillion: -1\n')).toBe('desk config <file>: prices.outputPerMillion: Too small: expected number to be >0');
    expect(failure('prices:\n  inputPerMillion: cheap\n  outputPerMillion: 15\n')).toBe('desk config <file>: prices.inputPerMillion: Invalid input: expected number, received string');
    expect(failure('prices:\n  inputPerMillion: 3\n')).toBe('desk config <file>: prices.outputPerMillion: Invalid input: expected number, received undefined');
    expect(failure('prices:\n  inputPerMillion: 3\n  outputPerMillion: 15\n  cachedPerMillion: 1\n')).toBe('desk config <file>: prices: Unrecognized key: "cachedPerMillion"');
    expect(failure('prices: 3\n')).toBe('desk config <file>: prices: Invalid input: expected object, received number');
  });
});

describe('the folders of a run', () => {
  it('are kept out of git: run artifacts and private snapshots of sources never go into the repository', () => {
    const ignored = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split('\n');
    expect(ignored).toContain(`/${defaultConfig().runDir}/`);
    expect(ignored).toContain(`/${defaultConfig().evidenceDir}/`);
  });
});

describe('placeholderHost', () => {
  // The user agent is what the Desk calls itself to every site, with the address of the page that says who it is. The default one links to an address that
  // does not exist, agenticmediahouse.example, so a live run has to be given a real one: this says which hosts are placeholders (a name under .example is reserved for examples).
  it.each([
    ['the default user agent', 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)', 'agenticmediahouse.example'],
    ['a host in capitals', 'Desk/1 (+https://Desk.EXAMPLE/method)', 'desk.example'],
    ['a host that is only example', 'Desk/1 (+https://example/method)', 'example'],
    ['a host with a sub-domain', 'Desk/1 (+http://www.news.example/method)', 'www.news.example'],
    ['a host with a port', 'Desk/1 (+https://agenticmediahouse.example:8443/method)', 'agenticmediahouse.example'],
    ['a host with a dot at the end', 'Desk/1 (+https://agenticmediahouse.example./method)', 'agenticmediahouse.example'],
    ['an address in the middle of the text', 'Mozilla-like Desk/1 see https://agenticmediahouse.example/method for more', 'agenticmediahouse.example'],
  ])('finds the placeholder in %s', (_what, agent, host) => {
    expect(placeholderHost(agent)).toBe(host);
  });

  it.each([
    ['an address that is not a placeholder', 'Desk/1 (+https://agenticmediahouse.org/method)'],
    ['a host that only has example inside its name', 'Desk/1 (+https://example.com/method)'],
    ['a host that ends in example without a dot', 'Desk/1 (+https://notexample/method)'],
    ['a name under .test', 'Desk/1 (+https://agenticmediahouse.test/method)'],
    ['a path that has example in it', 'Desk/1 (+https://agenticmediahouse.org/example/method)'],
    ['no address at all', 'Desk/1'],
    ['an address that cannot be read', 'Desk/1 (+https://[bad/method)'],
  ])('finds none in %s', (_what, agent) => {
    expect(placeholderHost(agent)).toBeUndefined();
  });

  it('judges the first address of the text, the one that must be the /method page', () => {
    expect(placeholderHost('Desk/1 (+https://agenticmediahouse.org/method; https://agenticmediahouse.example/other)')).toBeUndefined();
  });
});
