import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as entry from '../../src/index';
import type {
  AnthropicClientOptions,
  Budget,
  BuiltClient,
  ClientChoice,
  CreateMessage,
  Environment,
  MessageParams,
  MessageReply,
  ModelClient,
  ModelErrorKind,
  ModelRequest,
  ModelResponse,
  ModelRole,
  ModelUsage,
  RetryOptions,
  Spent,
} from '../../src/index';

// The stages of the pipeline import the model layer from the package entry point, never from a file
// inside it. These tests say what the entry point offers.

const VALUES = [
  'DESK_PACKAGE',
  'DeskConfig',
  'defaultConfig',
  'loadConfig',
  'describeIssues',
  'MODEL_ROLES',
  'ModelError',
  'canonicalJson',
  'sha256Hex',
  'jsonSchemaOf',
  'requestKey',
  'FakeClient',
  'Cassette',
  'cassettePath',
  'RecordedClient',
  'RecordingClient',
  'BudgetedClient',
  'RetryClient',
  'AnthropicClient',
  'replyFormat',
  'clientFromConfig',
  'wrapSource',
  'UNTRUSTED_PREAMBLE',
  'systemPrompt',
];

describe('the package entry point', () => {
  it.each(VALUES)('exports %s', (name) => {
    expect(entry).toHaveProperty(name);
  });

  it('exports the types of the model layer', () => {
    // `npm run typecheck` fails on this line if any of these types is not exported by the entry point.
    type Exported = [
      ModelClient,
      ModelRequest<string>,
      ModelResponse<string>,
      ModelUsage,
      ModelRole,
      ModelErrorKind,
      Budget,
      Spent,
      RetryOptions,
      CreateMessage,
      MessageParams,
      MessageReply,
      AnthropicClientOptions,
      ClientChoice,
      Environment,
      BuiltClient,
    ];
    const nothing: Exported | undefined = undefined;
    expect(nothing).toBeUndefined();
  });

  it('builds a working stack from the names it exports alone', async () => {
    const fake = new entry.FakeClient().script('select', { answer: 'hello' });
    const built = entry.clientFromConfig(entry.defaultConfig(), { kind: 'fake', fake }, {});
    const reply = await built.client.json({
      role: 'select',
      model: 'model-a',
      system: entry.systemPrompt('Reply.'),
      user: entry.wrapSource('s-1', 'Text.'),
      schema: z.strictObject({ answer: z.string() }),
      maxOutputTokens: 10,
    });
    expect(reply.value).toEqual({ answer: 'hello' });
  });
});
