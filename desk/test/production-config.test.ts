import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { defaultConfig, loadConfig, placeholderHost } from '../src/config';
import { productToken } from '../src/fetch/robots';
import { secretsIn } from './support/secrets';

// `desk.config.yml` at the root of the repository is the file of settings that the daily workflow passes to `desk run --config`. It is committed, so it is public:
// it holds the settings that a real run needs and the defaults do not give (which store keeps the evidence, who the Desk says it is) and nothing that is secret.
// What is secret, the key of the model and the four variables of the bucket, comes from the environment, and a file that carried one would be refused by `loadConfig`.

const FILE = fileURLToPath(new URL('../../desk.config.yml', import.meta.url));
const TEXT = readFileSync(FILE, 'utf8');
const SETTINGS = parse(TEXT) as Record<string, unknown>;
const DEFAULTS = defaultConfig();

/** Every name of a setting in `value`, at every depth. */
const keysOf = (value: unknown): string[] => (typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]) : []);

describe('desk.config.yml', () => {
  it('is a file that loadConfig accepts', () => {
    expect(() => loadConfig(FILE)).not.toThrow();
  });

  it('keeps the evidence in the private bucket, which the four variables of the environment describe', () => {
    expect(loadConfig(FILE).evidence).toEqual({ kind: 'r2' });
    expect(SETTINGS).not.toHaveProperty('evidenceDir');
  });

  it('says who the Desk is with an address that is not a placeholder, so that a live run is not refused, and the product token is the one that robots.txt files are asked about', () => {
    const { userAgent } = loadConfig(FILE);
    expect(placeholderHost(userAgent)).toBeUndefined();
    expect(userAgent).toMatch(/^AgenticMediaHouseDesk\/\d+\.\d+ \(\+https:\/\/[a-z0-9.-]+\/method\)$/);
    expect(productToken(userAgent)).toBe('AgenticMediaHouseDesk');
    expect(userAgent).not.toBe(DEFAULTS.userAgent);
  });

  it('leaves the models to the defaults: no model is named in the file', () => {
    expect(SETTINGS).not.toHaveProperty('models');
    expect(loadConfig(FILE).models).toEqual(DEFAULTS.models);
    expect(TEXT).not.toMatch(/claude-/);
  });

  it('writes the budget of a run and the number of runs a day, as numbers that are at most ten times the defaults, so that a slip of a zero does not remove the limit', () => {
    const config = loadConfig(FILE);
    expect(Object.keys((SETTINGS.budget ?? {}) as object).sort()).toEqual(['maxCalls', 'maxInputTokens', 'maxOutputTokens']);
    expect(SETTINGS).toHaveProperty('maxAttemptsPerDay');
    expect(config.maxAttemptsPerDay).toBeLessThanOrEqual(3);
    for (const name of ['maxCalls', 'maxInputTokens', 'maxOutputTokens'] as const) {
      expect(config.budget[name], name).toBeGreaterThan(0);
      expect(config.budget[name], name).toBeLessThanOrEqual(10 * DEFAULTS.budget[name]);
    }
  });

  it('writes a piece as an explainer', () => {
    expect(SETTINGS.profile).toBe('explainer');
    expect(loadConfig(FILE).profile).toBe('explainer');
  });

  it('keeps the runs in the folder that the workflow uploads from, and sets no other setting that changes how a run behaves than the kind of piece', () => {
    expect(loadConfig(FILE).runDir).toBe('runs');
    expect(Object.keys(SETTINGS).sort()).toEqual(['budget', 'evidence', 'maxAttemptsPerDay', 'profile', 'runDir', 'userAgent']);
  });

  it('has nothing in it that is shaped like a secret, and no setting that is named like one or that describes the bucket', () => {
    expect(secretsIn(TEXT)).toEqual([]);
    expect(keysOf(SETTINGS).filter((key) => /secret|password|credential|api[_-]?key|access[_-]?key|endpoint|bucket/i.test(key))).toEqual([]);
  });

  it('is plain ASCII, like the rest of the source', () => {
    expect([...TEXT].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});
