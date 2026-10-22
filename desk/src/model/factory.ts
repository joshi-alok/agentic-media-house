import type { DeskConfig } from '../config';
import { AnthropicClient } from './anthropic';
import { BudgetedClient } from './budgeted';
import type { Spent } from './budgeted';
import type { FakeClient } from './fake';
import { RecordedClient, RecordingClient } from './recorded';
import { RetryClient } from './retry';
import type { RetryOptions } from './retry';
import type { ModelClient } from './types';

/** Which client a run uses. The caller chooses; nothing here reads a setting or the process environment. */
export type ClientChoice =
  /** A client that answers from a script: tests, and the dry-run demo. */
  | { kind: 'fake'; fake: FakeClient }
  /** Replays the recorded responses in a folder; asks no model. */
  | { kind: 'recorded'; cassetteDir: string }
  /** The Anthropic API, with the key in `ANTHROPIC_API_KEY`. */
  | { kind: 'api' };

/** Environment variables as name and value: `process.env` in a real run, a plain object in a test. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** The client that a stage uses, and what it has spent so far. */
export interface BuiltClient {
  client: ModelClient;
  spent(): Spent;
  /**
   * Hand over the function that is told, in a line, each time a call is tried again (see `RetryClient`). A run gives it its log, so that a retry is in the record of the run
   * as the lines of the stages are. Optional so that a client made by hand, for a test, need not have it.
   */
  onRetry?(listener: (line: string) => void): void;
}

function chosenClient(choice: ClientChoice, env: Environment): ModelClient {
  switch (choice.kind) {
    case 'fake':
      return choice.fake;
    case 'recorded':
      return new RecordedClient(choice.cassetteDir);
    case 'api': {
      const apiKey = env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set: the api client needs it in the environment');
      return new AnthropicClient({ apiKey });
    }
    default:
      throw new Error(`unknown client kind ${JSON.stringify((choice as { kind: unknown }).kind)}: use fake, recorded or api`);
  }
}

/**
 * The client for a run: the chosen client, inside a budget (`config.budget`), inside retrying.
 * Retrying is the outer layer, so every try counts against the budget, and a budget that runs
 * out stops the retrying. The key is read from `env`, the environment the caller hands over,
 * and a missing or blank key is refused before anything is built. `retry` changes how retrying
 * waits, which a test needs.
 *
 * With `record`, a folder, every call that the chosen client answers is kept in it as a cassette
 * (see `RecordingClient`), so that the run can be replayed later with no model and no network.
 * Recording is the innermost layer: a call that fails is not recorded, and a retry that succeeds is.
 *
 * With `wrap`, a function, the chosen client is put inside what it returns before anything else is built around it: the layer that sees exactly the calls that reach the
 * model, each retry included, which `desk tune` uses to count them against the budget of a whole invocation, whatever the budget of one run says.
 */
export function clientFromConfig(
  config: DeskConfig,
  choice: ClientChoice,
  env: Environment,
  retry: RetryOptions = {},
  record?: string,
  wrap?: (client: ModelClient) => ModelClient,
): BuiltClient {
  const chosen = wrap === undefined ? chosenClient(choice, env) : wrap(chosenClient(choice, env));
  const budgeted = new BudgetedClient(record === undefined ? chosen : new RecordingClient(chosen, record), config.budget);
  const retrying = new RetryClient(budgeted, retry);
  return { client: retrying, spent: () => budgeted.spent(), onRetry: (listener) => retrying.onRetry(listener) };
}
