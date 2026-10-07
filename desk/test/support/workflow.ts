import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// The workflows of the repository (`.github/workflows/`) as data, for the tests that say what each of them does. A workflow cannot be run on any machine but GitHub's, so
// what these tests can do is read the file with a YAML parser and check every property that matters: when it starts, what it may do, which steps it has in which order,
// where its secrets go. The first real run (docs/runbook.md) is the proof that the steps do what they say.

/** The root of the repository, with a slash at the end. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
  'continue-on-error'?: unknown;
  'working-directory'?: string;
  shell?: string;
}

export interface Job {
  'runs-on': string;
  'timeout-minutes'?: number;
  steps: Step[];
  [key: string]: unknown;
}

export interface Workflow {
  name: string;
  on: Record<string, unknown>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
  [key: string]: unknown;
}

/** The text of a workflow file: `workflowText('desk.yml')`. */
export const workflowText = (file: string): string => readFileSync(`${ROOT}.github/workflows/${file}`, 'utf8');

/** A workflow file, parsed. */
export const loadWorkflow = (file: string): Workflow => parse(workflowText(file)) as Workflow;

/** The steps of the only job of a workflow; throws when it has more than one. */
export function stepsOf(workflow: Workflow): Step[] {
  const jobs = Object.values(workflow.jobs);
  if (jobs.length !== 1) throw new Error(`expected one job, found ${jobs.length}`);
  return (jobs[0] as Job).steps;
}

/** The step with this name; throws when there is none, so that a renamed step fails the test that looks for it. */
export function stepNamed(workflow: Workflow, name: string): Step {
  const found = stepsOf(workflow).find((step) => step.name === name);
  if (found === undefined) throw new Error(`no step is named "${name}"`);
  return found;
}

/** Every string in `tree` that contains `needle`, with where it is (`jobs.desk.steps.4.env.ANTHROPIC_API_KEY`). */
export function stringsWith(tree: unknown, needle: string, where = ''): { path: string; value: string }[] {
  if (typeof tree === 'string') return tree.includes(needle) ? [{ path: where, value: tree }] : [];
  if (typeof tree !== 'object' || tree === null) return [];
  return Object.entries(tree).flatMap(([key, inner]) => stringsWith(inner, needle, where === '' ? key : `${where}.${key}`));
}

/** The names of the actions that a workflow uses, with their tag: `actions/checkout@v7`, in order, each once. */
export function actionsOf(workflow: Workflow): string[] {
  return [...new Set(Object.values(workflow.jobs).flatMap((job) => job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]))))];
}
