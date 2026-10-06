import { lookup } from 'node:dns/promises';
import { describe, expect, it, vi } from 'vitest';
import { FetchError, HttpFetcher } from '../../src/fetch/http';
import { scriptedTransport } from '../support/transport';

// When a fetcher is given no lookup it asks the system for the addresses of a name, all of them, IPv4 and IPv6. The name server is
// replaced here by a stand-in, so that no test asks a real one.

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => (host.startsWith('private.') ? [{ address: '10.0.0.7', family: 4 }] : [{ address: '1.2.3.4', family: 4 }, { address: '2345:6789::1', family: 6 }])),
}));

const UA = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)';

describe('HttpFetcher: the lookup that it uses when it is given none', () => {
  const fetcherOf = (routes: Parameters<typeof scriptedTransport>[0]) => {
    const { transport, sent } = scriptedTransport(routes);
    return { fetcher: new HttpFetcher({ userAgent: UA, maxBytes: 1000, requestIntervalMs: 0, transport }), sent };
  };

  it('asks the system for all the addresses of the host, and goes on when every one is public', async () => {
    const { fetcher } = fetcherOf({ 'https://www.fixture-robotics.example/robots.txt': { status: 404 }, 'https://www.fixture-robotics.example/x': { body: 'there' } });
    expect((await fetcher.get('https://www.fixture-robotics.example/x')).body).toBe('there');
    expect(lookup).toHaveBeenCalledWith('www.fixture-robotics.example', { all: true, verbatim: true });
  });

  it('refuses a host that the system says has a private address', async () => {
    const { fetcher, sent } = fetcherOf({ 'https://private.fixture-robotics.example/x': { body: 'secret' } });
    const error = await fetcher.get('https://private.fixture-robotics.example/x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FetchError);
    expect((error as FetchError).kind).toBe('address');
    expect((error as FetchError).message).toContain('resolves to 10.0.0.7');
    expect(sent).toEqual([]);
  });
});
