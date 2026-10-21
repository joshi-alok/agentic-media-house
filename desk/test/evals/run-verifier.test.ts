import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BATCH_SIZE, evaluateVerifier, floorFailures, formatReport, loadVerifierSet, main, scoreOf } from '../../evals/run-verifier';
import type { EvalReport, ItemResult } from '../../evals/run-verifier';
import { lazyVerifier, perfectVerifier, scriptedVerifier, strictVerifier } from '../../evals/scripted';
import { ModelError } from '../../src/model/types';
import type { ModelClient, ModelRequest } from '../../src/model/types';
import { verifySystem } from '../../src/prompts/verify';
import { VERIFY_MAX_OUTPUT_TOKENS } from '../../src/stages/verify-model';
import { useScratch } from '../support/context';
import { blocksOf } from '../support/prompts';

// The harness that measures a verifier. Plan 2 verifies the harness and not a model, so these tests give it scripted verifiers whose scores are known exactly: one
// that knows the answers, one that clears everything, one that clears nothing, and one that catches what the passages do not say and misses what they change.

const SET = loadVerifierSet();
const MODEL = 'model-v';
const scratch = useScratch();

/** A client that is asked, and remembers every request. */
function spy(inner: ModelClient): { client: ModelClient; requests: ModelRequest<unknown>[] } {
  const requests: ModelRequest<unknown>[] = [];
  return {
    requests,
    client: {
      async json(request) {
        requests.push(request);
        return inner.json(request);
      },
    },
  };
}

describe('evaluateVerifier: a verifier that knows the answers', () => {
  it('scores 1 everywhere: every label right, precision and recall of both, and the accuracy', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL });
    expect(report.items).toBe(90);
    expect(report.perLabel).toEqual({
      supported: { items: 30, correct: 30, recall: 1 },
      unsupported: { items: 30, correct: 30, recall: 1 },
      distorted: { items: 30, correct: 30, recall: 1 },
    });
    expect(report.cleared).toEqual({ precision: 1, recall: 1 });
    expect(report.flagged).toEqual({ precision: 1, recall: 1 });
    expect(report.accuracy).toBe(1);
    expect(report.results.every((result) => result.cleared === (result.label === 'supported'))).toBe(true);
  });
});

describe('evaluateVerifier: a lazy verifier that clears every sentence', () => {
  it('clears every supported sentence and none of the others are caught: recall 1 for supported and 0 for the rest, and nothing flagged', async () => {
    const report = await evaluateVerifier(lazyVerifier(SET), SET, { model: MODEL });
    expect(report.perLabel).toEqual({
      supported: { items: 30, correct: 30, recall: 1 },
      unsupported: { items: 30, correct: 0, recall: 0 },
      distorted: { items: 30, correct: 0, recall: 0 },
    });
    expect(report.cleared).toEqual({ precision: 30 / 90, recall: 1 });
    expect(report.flagged).toEqual({ precision: null, recall: 0 });
    expect(report.accuracy).toBe(30 / 90);
  });
});

describe('evaluateVerifier: a verifier that is too strict and clears no sentence', () => {
  it('catches every sentence that is not supported and clears no supported one: recall 0 for supported, nothing cleared', async () => {
    const report = await evaluateVerifier(strictVerifier(SET), SET, { model: MODEL });
    expect(report.perLabel).toEqual({
      supported: { items: 30, correct: 0, recall: 0 },
      unsupported: { items: 30, correct: 30, recall: 1 },
      distorted: { items: 30, correct: 30, recall: 1 },
    });
    expect(report.cleared).toEqual({ precision: null, recall: 0 });
    expect(report.flagged).toEqual({ precision: 60 / 90, recall: 1 });
    expect(report.accuracy).toBe(60 / 90);
  });
});

describe('evaluateVerifier: a verifier that is half right', () => {
  it('catches what the passages do not say and is fooled by what they change: recall 1, 1 and 0, precision 0.5 for what it cleared and 1 for what it flagged, recall 0.5 for the flagged', async () => {
    const fooledByDistortions = scriptedVerifier(SET, (item) => (item.label === 'unsupported' ? 'not_entailed' : 'entailed'));
    const report = await evaluateVerifier(fooledByDistortions, SET, { model: MODEL });
    expect(report.perLabel.supported.recall).toBe(1);
    expect(report.perLabel.unsupported.recall).toBe(1);
    expect(report.perLabel.distorted.recall).toBe(0);
    expect(report.cleared).toEqual({ precision: 0.5, recall: 1 });
    expect(report.flagged).toEqual({ precision: 1, recall: 0.5 });
    expect(report.accuracy).toBe(60 / 90);
  });

  it('counts an ambiguous verdict as not clearing, as the Desk does', async () => {
    const hesitant = scriptedVerifier(SET, (item) => (item.label === 'supported' ? 'ambiguous' : 'not_entailed'));
    const report = await evaluateVerifier(hesitant, SET, { model: MODEL });
    expect(report.perLabel.supported.correct).toBe(0);
    expect(report.cleared.recall).toBe(0);
  });

  it('counts a label that is not supported as the item not cleared, because the Desk would hold the piece for it', async () => {
    const perfect = perfectVerifier(SET);
    const doubting: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        const value = reply.value as { labels: { id: string; basisSupported: boolean }[] };
        if (value.labels[0] !== undefined) value.labels[0].basisSupported = false;
        return reply;
      },
    };
    const report = await evaluateVerifier(doubting, SET, { model: MODEL, batchSize: 1 });
    expect(report.items).toBe(90);
    expect(report.perLabel.supported.correct).toBe(0);
    expect(report.perLabel.unsupported.correct).toBe(30);
  });
});

describe('evaluateVerifier: what it asks, and how', () => {
  it('counts a label that is not supported against the item whose passage it is, and no other item of the batch', async () => {
    const perfect = perfectVerifier(SET);
    const doubtingTheFirstPassage: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        (reply.value as { labels: { id: string; statusSupported: boolean }[] }).labels.find((label) => label.id === 'c-1')!.statusSupported = false;
        return reply;
      },
    };
    const report = await evaluateVerifier(doubtingTheFirstPassage, SET, { model: MODEL, batchSize: 90 });
    expect(report.results.filter((result) => !result.cleared === (result.label === 'supported'))).toEqual([{ id: 'e-01', label: 'supported', cleared: false }]);
    expect(report.perLabel.supported.correct).toBe(29);
  });

  it('adds up what each call cost, token for token', async () => {
    const perfect = perfectVerifier(SET);
    const costing: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        return { ...reply, usage: { inputTokens: 100, outputTokens: 7 } };
      },
    };
    expect((await evaluateVerifier(costing, SET, { model: MODEL })).usage).toEqual({ inputTokens: 900, outputTokens: 63 });
    expect((await evaluateVerifier(costing, SET, { model: MODEL, batchSize: 1 })).usage).toEqual({ inputTokens: 9000, outputTokens: 630 });
  });

  it('asks the verifier with the real prompt: the role, the model it was given, the system text of the verifier, and the limit of the reply', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    await evaluateVerifier(client, SET, { model: MODEL });
    expect(requests).toHaveLength(9);
    for (const request of requests) {
      expect(request.role).toBe('verify');
      expect(request.model).toBe(MODEL);
      expect(request.system).toBe(verifySystem());
      expect(request.maxOutputTokens).toBe(VERIFY_MAX_OUTPUT_TOKENS);
      expect(Object.keys(request).sort()).toEqual(['effort', 'maxOutputTokens', 'model', 'role', 'schema', 'system', 'user']);
    }
  });

  it('puts ten sentences in each call by default, in the order of the set, each sentence once, with the claims of its passages numbered from c-1', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    const report = await evaluateVerifier(client, SET, { model: MODEL });
    expect(DEFAULT_BATCH_SIZE).toBe(10);
    expect(report.calls).toBe(9);
    const seen: string[] = [];
    requests.forEach((request, call) => {
      const blocks = blocksOf(request.user);
      // A heading is shown as h and its place in the batch, after the sentences, so the items of a call are put back in the order of the batch.
      const items = blocks.filter((block) => /^[sh]\d+$/.test(block.id)).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      const expected = SET.items.slice(call * 10, call * 10 + 10).map((item, at) => `${item.kind === 'heading' ? 'h' : 's'}${at}`);
      expect(items.map((block) => block.id)).toEqual(expected);
      expect(blocks.filter((block) => block.id.startsWith('c-'))[0]?.id).toBe('c-1');
      seen.push(...items.map((block) => block.text));
    });
    expect(seen).toEqual(SET.items.map((item) => item.sentence));
  });

  it('takes the size of a batch from the options: 7 gives thirteen calls, the last with 6 items, and 90 gives one call', async () => {
    const seven = spy(perfectVerifier(SET));
    expect((await evaluateVerifier(seven.client, SET, { model: MODEL, batchSize: 7 })).calls).toBe(13);
    expect(seven.requests.map((request) => blocksOf(request.user).filter((block) => /^[sh]\d+$/.test(block.id)).length)).toEqual([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6]);
    const all = spy(perfectVerifier(SET));
    expect((await evaluateVerifier(all.client, SET, { model: MODEL, batchSize: 90 })).calls).toBe(1);
  });

  it('accepts a batch of one sentence, which is a call for each of the ninety', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    const report = await evaluateVerifier(client, SET, { model: MODEL, batchSize: 1 });
    expect(report.calls).toBe(90);
    expect(requests).toHaveLength(90);
  });

  it('scores the same whatever the size of the batch', async () => {
    const one = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL, batchSize: 1 });
    const many = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL, batchSize: 90 });
    expect({ ...one, calls: 0, usage: many.usage }).toEqual({ ...many, calls: 0 });
  });

  it('never shows the verifier the label or the flaw of a sentence', async () => {
    const { client, requests } = spy(perfectVerifier(SET));
    await evaluateVerifier(client, SET, { model: MODEL });
    const everything = requests.map((request) => request.user).join('\n');
    for (const item of SET.items) if (item.flaw !== undefined) expect(everything).not.toContain(item.flaw);
    expect(everything).not.toMatch(/\b(unsupported|distorted)\b/);
  });

  it('adds up what the calls cost', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL });
    expect(report.usage.inputTokens).toBeGreaterThan(9 * 500);
    expect(report.usage.outputTokens).toBeGreaterThan(0);
  });

  it('refuses a batch size that is not a whole number of at least 1', async () => {
    for (const batchSize of [0, -3, 2.5, Number.NaN]) {
      await expect(evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL, batchSize })).rejects.toThrow('the batch size must be a whole number of at least 1');
    }
  });

  it('ends with the error of the client when a call fails, and when the verifier judges what it was not asked', async () => {
    const failing: ModelClient = {
      async json() {
        throw new ModelError('transport', 'the provider is down');
      },
    };
    await expect(evaluateVerifier(failing, SET, { model: MODEL })).rejects.toThrow('the provider is down');
    const perfect = perfectVerifier(SET);
    const confused: ModelClient = {
      async json(request) {
        const reply = await perfect.json(request);
        (reply.value as { verdicts: { id: string }[] }).verdicts[0]!.id = 's99';
        return reply;
      },
    };
    await expect(evaluateVerifier(confused, SET, { model: MODEL })).rejects.toMatchObject({ name: 'ModelError', kind: 'schema' });
  });

  it('measures the same set again with the same result: it keeps no state', async () => {
    const client = perfectVerifier(SET);
    expect(await evaluateVerifier(client, SET, { model: MODEL })).toEqual(await evaluateVerifier(client, SET, { model: MODEL }));
  });
});

describe('scoreOf', () => {
  const result = (label: ItemResult['label'], cleared: boolean): ItemResult => ({ id: 'e-00', label, cleared });
  const none = { inputTokens: 0, outputTokens: 0 };

  it('has no score for what it has no items for: the empty list gives nothing', () => {
    const report = scoreOf([], 0, none);
    expect(report.accuracy).toBeNull();
    expect(report.cleared).toEqual({ precision: null, recall: null });
    expect(report.flagged).toEqual({ precision: null, recall: null });
    expect(report.perLabel.supported).toEqual({ items: 0, correct: 0, recall: null });
  });

  it('works out each score from the counts: three supported (two cleared), two unsupported (one caught) and one distorted (missed)', () => {
    const report = scoreOf([result('supported', true), result('supported', true), result('supported', false), result('unsupported', false), result('unsupported', true), result('distorted', true)], 1, none);
    expect(report.perLabel).toEqual({ supported: { items: 3, correct: 2, recall: 2 / 3 }, unsupported: { items: 2, correct: 1, recall: 0.5 }, distorted: { items: 1, correct: 0, recall: 0 } });
    // Cleared: 4 (two supported, one unsupported, one distorted). Flagged: 2 (one supported, one unsupported).
    expect(report.cleared).toEqual({ precision: 2 / 4, recall: 2 / 3 });
    expect(report.flagged).toEqual({ precision: 1 / 2, recall: 1 / 3 });
    expect(report.accuracy).toBe(3 / 6);
    expect(report.results).toHaveLength(6);
  });
});

describe('floorFailures', () => {
  const perfect = scoreOf(SET.items.map((item) => ({ id: item.id, label: item.label, cleared: item.label === 'supported' })), 9, { inputTokens: 0, outputTokens: 0 });
  const lazy = scoreOf(SET.items.map((item) => ({ id: item.id, label: item.label, cleared: true })), 9, { inputTokens: 0, outputTokens: 0 });

  it('finds nothing wrong with no floor, with a floor of 0, and with a perfect report under the highest floor', () => {
    expect(floorFailures(lazy, {})).toEqual([]);
    expect(floorFailures(lazy, { precision: 0, recall: 0 })).toEqual([]);
    expect(floorFailures(perfect, { precision: 1, recall: 1 })).toEqual([]);
  });

  it('names each recall that is below the recall floor, label by label', () => {
    expect(floorFailures(lazy, { recall: 0.9 })).toEqual([
      'the recall for unsupported sentences is 0.00, below the floor of 0.90',
      'the recall for distorted sentences is 0.00, below the floor of 0.90',
    ]);
  });

  it('names a precision that is below the precision floor, and a precision that does not exist as below it', () => {
    expect(floorFailures(lazy, { precision: 0.9 })).toEqual([
      'the precision of the sentences it cleared is 0.33, below the floor of 0.90',
      'the precision of the sentences it flagged is n/a, below the floor of 0.90',
    ]);
  });

  it('accepts a score that is exactly the floor', () => {
    expect(floorFailures(lazy, { precision: 30 / 90 }).filter((line) => line.includes('cleared'))).toEqual([]);
    expect(floorFailures(lazy, { recall: 1 / 3 }).filter((line) => line.includes('for supported'))).toEqual([]);
  });
});

describe('formatReport', () => {
  it('prints a table by label, the scores of the two classes, the accuracy and the cost', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: MODEL });
    const lines = formatReport({ ...report, usage: { inputTokens: 1200, outputTokens: 340 } }, MODEL);
    expect(lines).toEqual([
      'verifier evaluation: 90 sentences in 9 calls, model model-v',
      'label        items correct  recall',
      'supported       30      30    1.00',
      'unsupported     30      30    1.00',
      'distorted       30      30    1.00',
      'cleared (supported):          precision 1.00, recall 1.00',
      'flagged (not supported):      precision 1.00, recall 1.00',
      'accuracy 1.00',
      'tokens: 1200 in, 340 out',
    ]);
  });

  it('prints n/a for a score that does not exist', async () => {
    const report: EvalReport = await evaluateVerifier(lazyVerifier(SET), SET, { model: MODEL });
    expect(formatReport(report, MODEL)).toContain('flagged (not supported):      precision n/a, recall 0.00');
    expect(formatReport(report, MODEL)).toContain('cleared (supported):          precision 0.33, recall 1.00');
  });
});

describe('main', () => {
  function run(argv: string[], overrides: { client?: ModelClient; env?: Record<string, string>; spent?: () => { calls: number; inputTokens: number; outputTokens: number } } = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const deps = { out: (line: string) => void out.push(line), err: (line: string) => void err.push(line), env: overrides.env ?? {}, ...(overrides.client === undefined ? {} : { client: overrides.client }), ...(overrides.spent === undefined ? {} : { spent: overrides.spent }) };
    return main(argv, deps).then((code) => ({ code, out, err }));
  }

  it('proves the wiring with the fake verifier that knows the answers: exit 0 and a perfect report', async () => {
    const { code, out, err } = await run([]);
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toMatch(/^verifier evaluation: 90 sentences in 9 calls, model \S+$/);
    expect(out).toContain('accuracy 1.00');
    expect(out.some((line) => line.startsWith('below the floor'))).toBe(false);
  });

  it('uses the model that it is given, and the batch size that it is given', async () => {
    const { out } = await run(['--client', 'fake', '--model', 'model-z', '--batch', '12']);
    expect(out[0]).toBe('verifier evaluation: 90 sentences in 8 calls, model model-z');
  });

  it('exits with 0 for a lazy verifier when no floor is set, because no floor is frozen', async () => {
    const { code, out } = await run([], { client: lazyVerifier(SET) });
    expect(code).toBe(0);
    expect(out).toContain('accuracy 0.33');
  });

  it('exits with 1 and says which score is below the floor when a floor is set', async () => {
    const { code, out } = await run(['--min-recall', '0.9'], { client: lazyVerifier(SET) });
    expect(code).toBe(1);
    expect(out).toContain('below the floor: the recall for unsupported sentences is 0.00, below the floor of 0.90');
    expect(out).toContain('below the floor: the recall for distorted sentences is 0.00, below the floor of 0.90');
    const precision = await run(['--min-precision', '0.5', '--min-recall', '0.2'], { client: strictVerifier(SET) });
    expect(precision.code).toBe(1);
    expect(precision.out).toContain('below the floor: the recall for supported sentences is 0.00, below the floor of 0.20');
    expect(precision.out).toContain('below the floor: the precision of the sentences it cleared is n/a, below the floor of 0.50');
  });

  it('exits with 0 for the verifier that knows the answers under the highest floors', async () => {
    expect((await run(['--min-precision', '1', '--min-recall', '1'])).code).toBe(0);
  });

  it('refuses --client api without a key in the environment it was given, with exit 2 and no call', async () => {
    for (const env of [{} as Record<string, string>, { ANTHROPIC_API_KEY: ' ' }]) {
      const { code, out, err } = await run(['--client', 'api'], { env });
      expect(code).toBe(2);
      expect(out).toEqual([]);
      expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
    }
  });

  it('refuses mistakes in the arguments with exit 2, the message and the usage, and runs nothing', async () => {
    const cases: [string[], string][] = [
      [['--verbose', 'x'], 'unknown option --verbose'],
      [['--client'], '--client needs a value'],
      [['--client', '--model'], '--client needs a value'],
      [['--client', 'gpt'], '--client is fake or api, not "gpt"'],
      [['--batch', '0'], '--batch is a whole number of at least 1, not "0"'],
      [['--batch', '2.5'], '--batch is a whole number of at least 1, not "2.5"'],
      [['--batch', 'ten'], '--batch is a whole number of at least 1, not "ten"'],
      [['--min-recall', '1.5'], '--min-recall is a number from 0 to 1, not "1.5"'],
      [['--min-precision', '-0.1'], '--min-precision is a number from 0 to 1, not "-0.1"'],
      [['--min-precision', 'high'], '--min-precision is a number from 0 to 1, not "high"'],
      [['--min-recall', ''], '--min-recall is a number from 0 to 1, not ""'],
      [['--min-recall', ' '], '--min-recall is a number from 0 to 1, not " "'],
      [['--batch', '5', '--batch', '6'], '--batch is given twice'],
    ];
    for (const [argv, message] of cases) {
      const { code, out, err } = await run(argv);
      expect(code, argv.join(' ')).toBe(2);
      expect(out).toEqual([]);
      expect(err[0]).toBe(`evals:verifier: ${message}`);
      expect(err[1]).toContain('Usage: evals:verifier');
    }
  });

  it('accepts a batch of 1, the least there is', async () => {
    const { code, out } = await run(['--batch', '1']);
    expect(code).toBe(0);
    expect(out[0]).toBe(`verifier evaluation: 90 sentences in 90 calls, model ${out[0]?.split('model ')[1]}`);
  });

  it('exits with 1 and says so when the labelled set cannot be used, before any call', async () => {
    const file = path.join(scratch(), 'set.json');
    writeFileSync(file, '{"about": ');
    const out: string[] = [];
    const err: string[] = [];
    const calls: string[] = [];
    const client: ModelClient = {
      async json(request) {
        calls.push(request.role);
        return perfectVerifier(SET).json(request);
      },
    };
    const code = await main([], { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, client, setFile: file });
    expect(code).toBe(1);
    expect(err[0]).toContain(`the verifier set ${file} cannot be read`);
    expect(out).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('accepts floors of 0 and 1, which are the ends of the range', async () => {
    expect((await run(['--min-recall', '0', '--min-precision', '1'], { client: perfectVerifier(SET) })).code).toBe(0);
  });

  it('exits with 1 and says so when the evaluation fails', async () => {
    const failing: ModelClient = {
      async json() {
        throw new ModelError('refused', 'the model declined');
      },
    };
    const { code, err } = await run([], { client: failing });
    expect(code).toBe(1);
    expect(err).toEqual(['the evaluation failed: the model declined']);
  });

  it('says what the calls cost before the evaluation failed, when the client counts it, because those calls were paid for', async () => {
    const failing: ModelClient = {
      async json() {
        throw new ModelError('refused', 'the reply was cut off at the output limit');
      },
    };
    const { code, err } = await run([], { client: failing, spent: () => ({ calls: 4, inputTokens: 31000, outputTokens: 12500 }) });
    expect(code).toBe(1);
    expect(err).toEqual(['the evaluation failed: the reply was cut off at the output limit', 'spent before the failure: 4 model calls, 31000 input tokens, 12500 output tokens']);
  });
});

describe('the scripted verifiers', () => {
  it('refuse a sentence that is not in the set, because they find the answer by the sentence', async () => {
    const client = perfectVerifier(SET);
    await expect(
      client.json({ role: 'verify', model: MODEL, system: 's', user: '<source id="s0">\nA sentence that no item has.\n</source>', schema: (await import('../../src/stages/verify-model')).VerifyReply, maxOutputTokens: 100 }),
    ).rejects.toThrow('the scripted verifier was asked about a sentence that is not in the set');
  });
});

describe('the program', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));

  it('runs when it is started as a program, prints the report of the verifier that knows the answers and exits with 0', () => {
    const run = spawnSync('npx', ['tsx', 'desk/evals/run-verifier.ts', '--batch', '30'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('verifier evaluation: 90 sentences in 3 calls');
    expect(run.stdout).toContain('accuracy 1.00');
  }, 60_000);

  it('exits with 2 for a mistake in the arguments, as `main` does', () => {
    const run = spawnSync('npx', ['tsx', 'desk/evals/run-verifier.ts', '--batch', '0'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--batch is a whole number of at least 1, not "0"');
  }, 60_000);

  it('does nothing when it is only imported: importing it printed no report', () => {
    const run = spawnSync('npx', ['tsx', '--eval', "import('./desk/evals/run-verifier.ts').then((module) => console.log(typeof module.main))"], { cwd: root, encoding: 'utf8' });
    expect(run.stdout.trim()).toBe('function');
  }, 60_000);
});
