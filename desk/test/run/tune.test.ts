import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { TuneRecord, TuneRow, dollarsOf, parseUrlList, priceOf, rowLines, totalLines } from '../../src/run/tune';

// The pieces of `desk tune` that need no page and no model: the list of addresses, the price of a token, and the lines of the table. The whole command, with pages and a
// scripted model, is tested in test/tune.test.ts.

const urls = (text: string): string[] | string => {
  const result = parseUrlList(text);
  return 'problem' in result ? result.problem : result.urls;
};

describe('parseUrlList', () => {
  it('reads one address to a line, in order', () => {
    expect(urls('https://a.example/one\nhttps://b.example/two\n')).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('leaves out empty lines, lines of spaces and whole-line comments, and the spaces round an address', () => {
    expect(urls('# the pages to try\n\n   \n  https://a.example/one  \n\t# another comment\nhttps://b.example/two')).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('ends a line at a comment that follows a space, and keeps the # of the fragment of an address, which is not a comment', () => {
    expect(urls('https://a.example/one # the first\nhttps://b.example/two#section\nhttps://c.example/three\t# tab')).toEqual(['https://a.example/one', 'https://b.example/two#section', 'https://c.example/three']);
  });

  it('reads lines that end the way Windows ends them', () => {
    expect(urls('https://a.example/one\r\nhttps://b.example/two\r\n')).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('keeps an address twice when it is listed twice: the list is the owner\'s', () => {
    expect(urls('https://a.example/one\nhttps://a.example/one')).toEqual(['https://a.example/one', 'https://a.example/one']);
  });

  it('refuses a line that is not the address of a web page, and says which line and what it said', () => {
    expect(urls('https://a.example/one\nnot an address\n')).toBe('line 2 is not the address of a web page (an http or https address): "not an address"');
    expect(urls('ftp://a.example/file')).toContain('line 1 is not the address of a web page');
    expect(urls('a.example/one')).toContain('line 1 is not the address of a web page');
    expect(urls('# c\n\njavascript:alert(1)')).toContain('line 3 is not the address of a web page');
  });

  it('cuts a long line that it refuses at eighty characters', () => {
    const long = `${'x'.repeat(200)}`;
    const message = urls(long) as string;
    expect(message).toContain(`"${'x'.repeat(80)}..."`);
    expect(message).not.toContain('x'.repeat(81));
  });

  it('cuts a line of eighty-one characters, and shows a line of exactly eighty whole', () => {
    expect(urls('y'.repeat(80))).toBe(`line 1 is not the address of a web page (an http or https address): "${'y'.repeat(80)}"`);
    expect(urls('y'.repeat(81))).toBe(`line 1 is not the address of a web page (an http or https address): "${'y'.repeat(80)}..."`);
  });

  it('refuses a file that lists nothing: no line at all, or only comments', () => {
    expect(urls('')).toBe('it lists no address');
    expect(urls('# nothing here\n\n')).toBe('it lists no address');
  });
});

describe('priceOf and dollarsOf', () => {
  const models = defaultConfig().models;
  const prices = { inputPerMillion: 3, outputPerMillion: 15 };

  it('has no price when the settings have none, and never makes one up', () => {
    expect(priceOf({ models })).toBeUndefined();
  });

  it('gives the price of the settings when extract, compose and verify are one model', () => {
    expect(priceOf({ models, prices })).toEqual({ price: { input: 3, output: 15 } });
  });

  it('says why it cannot apply the one price when the three models are not one, and does not guess which to use', () => {
    expect(priceOf({ models: { ...models, verify: 'another-model' }, prices })).toEqual({ why: 'extract, compose and verify use different models, and the settings hold one price' });
    expect(priceOf({ models: { ...models, extract: 'another-model' }, prices })).toHaveProperty('why');
    expect(priceOf({ models: { ...models, compose: 'another-model' }, prices })).toHaveProperty('why');
  });

  it('does not look at the model that selects, which tune never asks', () => {
    expect(priceOf({ models: { ...models, select: 'a-cheaper-model' }, prices })).toEqual({ price: { input: 3, output: 15 } });
  });

  it('makes dollars of tokens: the tokens in at the price in, the tokens out at the price out, for a million of each', () => {
    expect(dollarsOf({ inputTokens: 1_000_000, outputTokens: 0 }, { input: 3, output: 15 })).toBe(3);
    expect(dollarsOf({ inputTokens: 0, outputTokens: 1_000_000 }, { input: 3, output: 15 })).toBe(15);
    expect(dollarsOf({ inputTokens: 10_000, outputTokens: 2_000 }, { input: 3, output: 15 })).toBeCloseTo(0.06, 10);
    expect(dollarsOf({ inputTokens: 0, outputTokens: 0 }, { input: 3, output: 15 })).toBe(0);
  });
});

const usage = { calls: 3, inputTokens: 10_000, outputTokens: 2_000 };
const judged: TuneRow = {
  url: 'https://a.example/one',
  trial: 2,
  kind: 'company-newsroom',
  status: 'judged',
  note: null,
  claims: { proposed: 9, survivors: 6, dropped: { 'quote-not-found': 2, 'value-not-in-quote': 1 } },
  composed: { route: 'revise', codes: { G4_NUMBER_UNSUPPORTED: 2, G9_BANNED_PHRASE: 1 } },
  modelCheck: { round: 1, judged: 14, entailed: 12, notEntailed: 1, ambiguous: 1, missing: 0, claims: 6, labelProblems: 2 },
  verdict: { outcome: 'hold', rounds: 2, route: 'revise', codes: { G4_NUMBER_UNSUPPORTED: 1 } },
  usage,
};
const POSITION = { page: 3, pages: 5, trials: 4 };

describe('rowLines', () => {
  it('says, for a trial that went all the way, each step in its order: the kind, the claims, the gate, the model check, the verdict and the tokens', () => {
    expect(rowLines(judged, POSITION, undefined)).toEqual([
      'page 3 of 5, trial 2 of 4: https://a.example/one',
      '  kind: company-newsroom (tier 1)',
      '  result: went through the model check',
      '  claims proposed: 9',
      '  claims dropped: quote-not-found 2, value-not-in-quote 1',
      '  claims surviving: 6',
      '  composed draft: the gate says revise (G4_NUMBER_UNSUPPORTED 2, G9_BANNED_PHRASE 1)',
      '  model check: round 1 judged 14 items: entailed 12, not entailed 1, ambiguous 1, missing 0; label problems 2 (6 claims)',
      '  verify: hold after 2 revision rounds; the gate says revise (G4_NUMBER_UNSUPPORTED 1)',
      '  tokens: 10000 in, 2000 out, 3 model calls',
    ]);
  });

  it('adds the dollars when there is a price, and not otherwise', () => {
    expect(rowLines(judged, POSITION, { input: 3, output: 15 }).at(-1)).toBe('  dollars: $0.0600');
    expect(rowLines(judged, POSITION, undefined).some((line) => line.includes('dollars'))).toBe(false);
  });

  it('says none for what was not dropped, leaves the codes out of a gate that says publish, and says singular for one', () => {
    const clean: TuneRow = {
      ...judged,
      claims: { proposed: 3, survivors: 3, dropped: {} },
      composed: { route: 'publish', codes: {} },
      modelCheck: { round: 0, judged: 1, entailed: 1, notEntailed: 0, ambiguous: 0, missing: 0, claims: 1, labelProblems: 0 },
      verdict: { outcome: 'publish', rounds: 1, route: 'publish', codes: {} },
      usage: { calls: 1, inputTokens: 5, outputTokens: 6 },
    };
    const lines = rowLines(clean, POSITION, undefined);
    expect(lines).toContain('  claims dropped: none');
    expect(lines).toContain('  composed draft: the gate says publish');
    expect(lines).toContain('  model check: round 0 judged 1 item: entailed 1, not entailed 0, ambiguous 0, missing 0; label problems 0 (1 claim)');
    expect(lines).toContain('  verify: publish after 1 revision round; the gate says publish');
    expect(lines.at(-1)).toBe('  tokens: 5 in, 6 out, 1 model call');
  });

  it('says that the model was not asked when the gate found failures in every round', () => {
    const lines = rowLines({ ...judged, modelCheck: null }, POSITION, undefined);
    expect(lines).toContain('  model check: not asked (the gate found failures in every round)');
  });

  it('says for a page that was never tried: no trial in the head, the reason, and nothing else', () => {
    const blocked: TuneRow = { ...judged, trial: null, kind: 'tier2', status: 'not-fetched', note: 'https://a.example/one: robots.txt does not allow it', claims: null, composed: null, modelCheck: null, verdict: null, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } };
    expect(rowLines(blocked, POSITION, { input: 3, output: 15 })).toEqual([
      'page 3 of 5: https://a.example/one',
      '  kind: tier2 (tier 2)',
      '  result: not fetched: https://a.example/one: robots.txt does not allow it',
    ]);
  });

  it('says the tier of every kind of source: the four of a primary source are tier 1, another outlet is tier 2, and an unknown address has none', () => {
    const kind = (name: TuneRow['kind']): string => rowLines({ ...judged, kind: name }, POSITION, undefined)[1]!;
    expect(kind('company-newsroom')).toBe('  kind: company-newsroom (tier 1)');
    expect(kind('arxiv')).toBe('  kind: arxiv (tier 1)');
    expect(kind('sec')).toBe('  kind: sec (tier 1)');
    expect(kind('standard')).toBe('  kind: standard (tier 1)');
    expect(kind('tier2')).toBe('  kind: tier2 (tier 2)');
    expect(kind('unknown')).toBe('  kind: unknown (no tier)');
  });

  it('says what each status means, with the reason after it', () => {
    const base: TuneRow = { ...judged, claims: null, composed: null, modelCheck: null, verdict: null, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } };
    const result = (status: TuneRow['status'], note: string | null): string => rowLines({ ...base, status, note }, POSITION, undefined)[2]!;
    expect(result('too-few-claims', '1 of 3 survived')).toBe('  result: too few claims to write a piece from: 1 of 3 survived');
    expect(result('unknown-kind', 'no host')).toBe('  result: not a known kind of source, so not read: no host');
    expect(result('failed', 'the reply is not JSON')).toBe('  result: failed: the reply is not JSON');
    expect(result('stopped', 'the budget')).toBe('  result: stopped by the budget of model calls: the budget');
  });
});

describe('the schemas of what tune.json holds', () => {
  const record: TuneRecord = {
    stamp: 's',
    date: '2026-10-05',
    client: 'fake',
    trials: 1,
    maxCalls: 1,
    models: defaultConfig().models,
    rows: [{ ...judged, url: 'x' }],
    total: { pages: 1, trials: 1, calls: 3, inputTokens: 10_000, outputTokens: 2_000 },
    dollars: null,
    stopped: null,
  };

  it('takes a row and a record as they are, and a name of one character', () => {
    expect(TuneRow.safeParse({ ...judged, url: 'x' }).success).toBe(true);
    expect(TuneRecord.safeParse(record).success).toBe(true);
  });

  it('refuses a row with no address, a record with no name, a record of another client than the two, a count that is not a whole number, and a field that it does not know', () => {
    expect(TuneRow.safeParse({ ...judged, url: '' }).success).toBe(false);
    expect(TuneRow.safeParse({ ...judged, usage: { ...usage, calls: 1.5 } }).success).toBe(false);
    expect(TuneRow.safeParse({ ...judged, extra: 1 }).success).toBe(false);
    expect(TuneRecord.safeParse({ ...record, stamp: '' }).success).toBe(false);
    expect(TuneRecord.safeParse({ ...record, client: 'recorded' }).success).toBe(false);
    expect(TuneRecord.safeParse({ ...record, maxCalls: 0 }).success).toBe(false);
  });
});

describe('totalLines', () => {
  const record: TuneRecord = {
    stamp: '20261005-043100',
    date: '2026-10-05',
    client: 'api',
    trials: 2,
    maxCalls: 40,
    models: defaultConfig().models,
    rows: [],
    total: { pages: 3, trials: 4, calls: 12, inputTokens: 100_000, outputTokens: 20_000 },
    dollars: null,
    stopped: null,
  };

  it('says the totals, and that there are no dollars because the settings have no prices', () => {
    expect(totalLines(record, undefined)).toEqual(['total: 3 pages, 4 trials, 12 of 40 model calls, 100000 tokens in, 20000 out', 'dollars: not shown, because the settings have no prices (see prices in desk/src/config.ts)']);
  });

  it('says the dollars when there is a price, and why not when there is one that cannot be applied', () => {
    expect(totalLines(record, { price: { input: 3, output: 15 } })[1]).toBe('total dollars: $0.6000');
    expect(totalLines(record, { why: 'the models differ' })[1]).toBe('dollars: not shown, because the models differ');
  });

  it('says, singular for one, why the invocation stopped when it did', () => {
    const lines = totalLines({ ...record, total: { ...record.total, pages: 1, trials: 1 }, stopped: 'the budget of 40 model calls is spent' }, undefined);
    expect(lines[0]).toBe('total: 1 page, 1 trial, 12 of 40 model calls, 100000 tokens in, 20000 out');
    expect(lines.at(-1)).toBe('stopped: the budget of 40 model calls is spent');
  });
});
