import type { DeskConfig } from '../config';
import { AnthropicClient } from './anthropic';
import { BudgetedClient } from './budgeted';
import type { Spent } from './budgeted';
import type { FakeClient } from './fake';
import { RecordedClient } from './recorded';
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
 */
export function clientFromConfig(config: DeskConfig, choice: ClientChoice, env: Environment, retry: RetryOptions = {}): BuiltClient {
  const budgeted = new BudgetedClient(chosenClient(choice, env), config.budget);
  return { client: new RetryClient(budgeted, retry), spent: () => budgeted.spent() };
}
