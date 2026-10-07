import { describe, expect, it } from 'vitest';
import { CLIENT_KINDS, SOURCES_KINDS } from '../../src/run/artifacts';
import { refuseApiOnFixtures } from '../../src/run/spending';

// The model of the Anthropic API costs money for every call, and the pages of the made-up world are fictional: a paid answer about them is worth nothing,
// and there is no case in which it is wanted. `refuseApiOnFixtures` is the one place that says so, for every command that picks a client and a world.

const MESSAGE =
  '--client api with --sources fixtures would spend money on the answers of a model about made-up pages, which are worth nothing: use --client fake for the scripted story or --client recorded with --cassettes, or use --sources live for real pages';

describe('refuseApiOnFixtures', () => {
  it('refuses the api client on the made-up world, and says why and what to use instead', () => {
    expect(refuseApiOnFixtures('api', 'fixtures')).toBe(MESSAGE);
  });

  it('refuses nothing else: every other pair of a client and a world is allowed', () => {
    const allowed = CLIENT_KINDS.flatMap((client) => SOURCES_KINDS.map((sources) => [client, sources] as const)).filter(([client, sources]) => !(client === 'api' && sources === 'fixtures'));
    expect(allowed).toHaveLength(5);
    for (const [client, sources] of allowed) expect(refuseApiOnFixtures(client, sources), `${client} on ${sources}`).toBeUndefined();
  });
});
