// What a program that the Desk starts is allowed to see of the environment. The Desk runs `git` and `gh`, and the process that starts them has, in its environment, the key of the
// model and the keys of the bucket (the one step of a workflow that runs the Desk is given them, and nowhere else). A child does not need them, and a program that is told nothing
// cannot leak what it was not told: a `git` that is run with a hook, a `gh` that is started with a debugging switch that prints its environment, a failure that dumps the environment
// of the child into a log. So a child is given an allow-list, built from the environment of this process, and nothing else.

/** The variables that every child is given: where programs are (`PATH`), where its settings are (`HOME`), the language and the folder for temporary files. */
export const CHILD_VARIABLES = ['PATH', 'HOME', 'LANG', 'TMPDIR'] as const;

/** The variables of git (`GIT_CONFIG_COUNT` and the two that follow it, which carry the credential of a workflow into every `git`, `GIT_TERMINAL_PROMPT`, `GIT_AUTHOR_NAME`, and so on): every child is given them. */
const GIT_VARIABLE = /^GIT_[A-Z0-9_]+$/;

/** The variables that carry the token of GitHub, which `gh` reads. A child is given them only when the caller asks. */
export const TOKEN_VARIABLES = ['GH_TOKEN', 'GITHUB_TOKEN'] as const;

export interface ChildEnvironmentOptions {
  /** Give the child the token of GitHub too (`gh` needs it; `git` is given the credential by `GIT_CONFIG_*`, which is a git variable). */
  tokens?: boolean;
}

/**
 * The environment of a child of the Desk: `PATH`, `HOME`, `LANG` and `TMPDIR`, every variable of git (`GIT_...`), and `GH_TOKEN` and `GITHUB_TOKEN` when `tokens` is true, taken from
 * `source` (the environment of this process), and nothing else: not the key of the model, not a variable of the bucket, not a token of Cloudflare, not any other variable that a
 * workflow or a machine happens to have. A variable that `source` does not have is not in the answer.
 */
export function childEnvironment(source: Readonly<Record<string, string | undefined>>, options: ChildEnvironmentOptions = {}): Record<string, string> {
  const allowed = new Set<string>([...CHILD_VARIABLES, ...(options.tokens === true ? TOKEN_VARIABLES : [])]);
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && (allowed.has(name) || GIT_VARIABLE.test(name))) kept[name] = value;
  }
  return kept;
}
