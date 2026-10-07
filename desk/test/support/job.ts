import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job, Step, Workflow } from './workflow';
import { stepsOf } from './workflow';

// A job of a workflow, run as the order of its steps and the conditions that they have, and nothing else. GitHub decides which step runs next from the `if:` of each step and from
// how the steps before it ended; this file does the same for the part of the language of conditions that the workflows of this repository use (`!cancelled()`, `success()`,
// `failure()`, `always()`, `steps.<id>.outcome`, `steps.<id>.outputs.<name>`, `inputs.<name>`, `github.event_name`, `vars.<name>`, `==`, `!=`, `&&`, `||`, `!` and brackets, and the values of the `env`
// of a step, in which `secrets.<name>` and `github.token` are made-up values), so that a test can say what the whole
// sequence does when one step fails: which steps run, which are skipped, how the job ends. What each step does is given by the test, as a function of the step. It is not GitHub:
// a step that has a context or a function that is not listed here is an error, and so is a condition that does not parse, so that a change of the workflow into a language that this
// file does not know fails loudly instead of being run wrongly.

export type StepOutcome = 'success' | 'failure' | 'skipped';

export interface StepRun {
  name: string;
  id: string | undefined;
  outcome: StepOutcome;
  outputs: Record<string, string>;
}

export interface JobRun {
  steps: StepRun[];
  /** `success` when every step that ran succeeded; `failure` when one did not; `skipped` when the condition of the job was false. */
  conclusion: 'success' | 'failure' | 'skipped';
  /** The outcome of the step with this name. */
  outcomeOf(name: string): StepOutcome;
}

/** What a step does: it is given the step and its environment (with `GITHUB_OUTPUT`, a file that it may add `name=value` lines to), and says how it ended: the exit code. */
export type Executor = (step: Step, env: Record<string, string>) => Promise<number>;

export interface JobOptions {
  /** A folder for the files of the outputs of the steps. */
  dir: string;
  /** The inputs of a start by hand (`inputs.<name>`). */
  inputs?: Record<string, string | boolean>;
  /** Whether the workflow was cancelled before the first step. */
  cancelled?: boolean;
  /** What started the workflow (`schedule`, `workflow_dispatch`, `push`): `github.event_name`. */
  event?: string;
  /** The variables of the repository (`vars.<name>`); one that is not here is the empty string, as on GitHub. */
  vars?: Record<string, string>;
  /** Other variables of the environment that every step is given. */
  env?: Record<string, string>;
}

type Value = string | boolean | number | undefined;

/** The tokens of a condition. */
function tokenise(text: string): string[] {
  const tokens: string[] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^\s+/.exec(rest);
    if (space !== null) {
      at += space[0].length;
      continue;
    }
    const word = /^(?:'(?:[^']|'')*'|&&|\|\||==|!=|[()!]|[A-Za-z_][A-Za-z0-9_.-]*(?:\(\))?|\d+)/.exec(rest);
    if (word === null) throw new Error(`the condition ${JSON.stringify(text)} has something that this file does not read, at ${JSON.stringify(rest.slice(0, 12))}`);
    tokens.push(word[0]);
    at += word[0].length;
  }
  return tokens;
}

interface Scope {
  steps: Record<string, { outcome: StepOutcome; conclusion: StepOutcome; outputs: Record<string, string> }>;
  inputs: Record<string, string | boolean>;
  event: string;
  vars: Record<string, string>;
  temp: string;
  failed: boolean;
  cancelled: boolean;
}

const truthy = (value: Value): boolean => !(value === undefined || value === false || value === 0 || value === '');

/** The value of an expression, as GitHub gives it: `||` is below `&&`, which is below `==` and `!=`, which are below `!`, and `&&` and `||` give the operand that decides, not a boolean. */
export function valueOf(text: string, scope: Scope): Value {
  const tokens = tokenise(text.replace(/^\s*\$\{\{/, '').replace(/\}\}\s*$/, ''));
  let at = 0;
  const peek = (): string | undefined => tokens[at];
  const take = (): string => {
    const token = tokens[at];
    if (token === undefined) throw new Error(`the condition ${JSON.stringify(text)} ends too soon`);
    at += 1;
    return token;
  };
  const lookup = (name: string): Value => {
    const parts = name.split('.');
    if (parts[0] === 'steps' && parts.length === 3 && (parts[2] === 'outcome' || parts[2] === 'conclusion')) return scope.steps[parts[1] as string]?.[parts[2]];
    if (parts[0] === 'steps' && parts.length === 4 && parts[2] === 'outputs') return scope.steps[parts[1] as string]?.outputs[parts[3] as string];
    if (parts[0] === 'inputs' && parts.length === 2) return scope.inputs[parts[1] as string];
    if (name === 'github.event_name') return scope.event;
    if (name === 'github.token') return 'made-up-token-of-the-workflow';
    if (name === 'runner.temp') return scope.temp;
    if (parts[0] === 'vars' && parts.length === 2) return scope.vars[parts[1] as string] ?? '';
    if (parts[0] === 'secrets' && parts.length === 2) return `made-up-secret-${parts[1]}`;
    throw new Error(`the condition ${JSON.stringify(text)} reads ${name}, which this file does not know`);
  };
  const primary = (): Value => {
    const token = take();
    if (token === '(') {
      const inner = or();
      if (take() !== ')') throw new Error(`the condition ${JSON.stringify(text)} has a bracket that is not closed`);
      return inner;
    }
    if (token === '!') return !truthy(primary());
    if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
    if (token === 'true' || token === 'false') return token === 'true';
    if (/^\d+$/.test(token)) return Number(token);
    if (token === 'success()') return !scope.failed && !scope.cancelled;
    if (token === 'failure()') return scope.failed;
    if (token === 'always()') return true;
    if (token === 'cancelled()') return scope.cancelled;
    if (token.endsWith('()')) throw new Error(`the condition ${JSON.stringify(text)} calls ${token}, which this file does not know`);
    return lookup(token);
  };
  const same = (a: Value, b: Value): boolean => String(a).toLowerCase() === String(b).toLowerCase();
  const equality = (): Value => {
    let left = primary();
    while (peek() === '==' || peek() === '!=') {
      const operator = take();
      const right = primary();
      left = operator === '==' ? same(left, right) : !same(left, right);
    }
    return left;
  };
  const and = (): Value => {
    let left = equality();
    while (peek() === '&&') {
      take();
      const right = equality();
      left = truthy(left) ? right : left;
    }
    return left;
  };
  const or = (): Value => {
    let left = and();
    while (peek() === '||') {
      take();
      const right = and();
      left = truthy(left) ? left : right;
    }
    return left;
  };
  const result = or();
  if (at !== tokens.length) throw new Error(`the condition ${JSON.stringify(text)} has more after ${JSON.stringify(tokens[at - 1])}`);
  return result;
}

/** Evaluate a condition. */
const evaluate = (text: string, scope: Scope): boolean => truthy(valueOf(text, scope));

/** The `env` of a step with its expressions worked out (`${{ inputs.dry && '--dry' || '--skip-if-done' }}` is one word), as the step sees it. */
function environmentOf(env: Record<string, string> | undefined, scope: Scope): Record<string, string> {
  const given: Record<string, string> = {};
  for (const [name, value] of Object.entries(env ?? {})) {
    const whole = /^\$\{\{(.*)\}\}$/s.exec(value.trim());
    given[name] = whole === null ? value : String(valueOf(whole[1] as string, scope) ?? '');
  }
  return given;
}

/** Whether a condition names a function that checks the status of the job: with none, GitHub runs the step only if every step before it succeeded. */
const hasStatusCheck = (text: string): boolean => /\b(?:success|failure|always|cancelled)\(\)/.test(text);

/** Run the only job of `workflow`: each step in order, with the condition that GitHub would give it, and `execute` for what it does. */
export async function runJob(workflow: Workflow, execute: Executor, options: JobOptions): Promise<JobRun> {
  mkdirSync(options.dir, { recursive: true });
  const scope: Scope = { steps: {}, inputs: options.inputs ?? {}, event: options.event ?? 'workflow_dispatch', vars: options.vars ?? {}, temp: options.dir, failed: false, cancelled: options.cancelled === true };
  const ran: StepRun[] = [];
  // The condition of the job: when it is false no step runs, and the job is skipped.
  const job = Object.values(workflow.jobs)[0] as Job;
  const jobRuns = job.if === undefined || evaluate(job.if, scope);
  for (const [index, step] of stepsOf(workflow).entries()) {
    const condition = step.if === undefined ? 'success()' : hasStatusCheck(step.if) ? step.if : `success() && (${step.if.replace(/^\s*\$\{\{/, '').replace(/\}\}\s*$/, '')})`;
    let outcome: StepOutcome = 'skipped';
    const outputs: Record<string, string> = {};
    if (jobRuns && evaluate(condition, scope)) {
      const file = path.join(options.dir, `output-${index}`);
      writeFileSync(file, '');
      const code = await execute(step, { ...options.env, ...environmentOf(step.env, scope), GITHUB_OUTPUT: file, RUNNER_TEMP: options.dir });
      outcome = code === 0 ? 'success' : 'failure';
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const found = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
        if (found !== null) outputs[found[1] as string] = found[2] as string;
      }
    }
    if (outcome === 'failure') scope.failed = true;
    if (step.id !== undefined) scope.steps[step.id] = { outcome, conclusion: outcome, outputs };
    ran.push({ name: step.name ?? `step ${index}`, id: step.id, outcome, outputs });
  }
  return {
    steps: ran,
    conclusion: !jobRuns ? 'skipped' : scope.failed ? 'failure' : 'success',
    outcomeOf: (name) => {
      const found = ran.find((step) => step.name === name);
      if (found === undefined) throw new Error(`no step is named "${name}"`);
      return found.outcome;
    },
  };
}

/** The words of a command line as the shell would make them, for the one kind of line that the workflows have: words, double quotes, and `$NAME` or `${NAME}` that `env` gives. */
export function wordsOf(commandLine: string, env: Record<string, string>): string[] {
  const expanded = commandLine.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (_all, braced: string | undefined, bare: string | undefined) => {
    const name = (braced ?? bare) as string;
    const value = env[name];
    if (value === undefined) throw new Error(`the command ${JSON.stringify(commandLine)} reads ${name}, which the test did not give`);
    return value;
  });
  return [...expanded.matchAll(/"([^"]*)"|(\S+)/g)].map((found) => (found[1] ?? found[2]) as string);
}
