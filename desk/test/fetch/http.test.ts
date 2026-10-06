import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError, FixtureFetcher, HttpFetcher, MAX_REDIRECTS } from '../../src/fetch/http';
import type { HttpFetcherOptions } from '../../src/fetch/http';
import { PUBLIC_ADDRESS, publicLookup, tableLookup } from '../support/lookup';
import { scriptedTransport } from '../support/transport';
import type { Route } from '../support/transport';

// The fetcher is the only code of the Desk that touches the web, and every rule of good manners is
// in it: robots.txt first and never worked around, one request a second to a host, a limit on the
// size of a page, a limit on redirects, and a pause before trying again. The tests give it a
// transport that answers from a script, so no test opens a connection.

const UA = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)';
const NOW = new Date('2026-10-05T04:31:00.000Z');
const HOST = 'https://www.fixture-robotics.example';
const PAGE = `${HOST}/news/fx-1-ships`;
const ROBOTS = `${HOST}/robots.txt`;
const OTHER_HOST = 'https://www.mercer-wire.example';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The routes of a site that has no robots.txt, plus the given ones. */
const site = (routes: Record<string, Route> = {}): Record<string, Route> => ({ [ROBOTS]: { status: 404, type: 'text/plain', body: 'Not found' }, ...routes });

/** A fetcher on a script, with a record of what it sent and of every pause it made. */
function setup(routes: Record<string, Route>, options: Partial<HttpFetcherOptions> = {}) {
  const { transport, sent } = scriptedTransport(routes);
  const sleeps: number[] = [];
  const fetcher = new HttpFetcher({
    userAgent: UA,
    maxBytes: 10_000,
    requestIntervalMs: 0,
    transport,
    now: () => NOW,
    sleep: async (ms) => void sleeps.push(ms),
    lookup: publicLookup,
    ...options,
  });
  return { fetcher, sent, sleeps };
}

/** The error that a promise must reject with, or a failure of the test if it does not reject. */
async function failure(promise: Promise<unknown>): Promise<FetchError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FetchError);
    return error as FetchError;
  }
  throw new Error('the fetch succeeded');
}

/** The addresses that were requested, in order. */
const urlsOf = (sent: { url: string }[]): string[] => sent.map((request) => request.url);

/** A stream of text chunks that says when it is cancelled. */
function streamOf(chunks: string[], cancelled: { value: boolean } = { value: false }): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let next = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(encoder.encode(chunks[next++]));
      else controller.close();
    },
    cancel() {
      cancelled.value = true;
    },
  });
}

describe('FetchError', () => {
  it('names its kind and its address, and puts the address first in its message', () => {
    const error = new FetchError('status', PAGE, 'answered 404', { status: 404 });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FetchError');
    expect(error.kind).toBe('status');
    expect(error.url).toBe(PAGE);
    expect(error.status).toBe(404);
    expect(error.message).toBe(`${PAGE}: answered 404`);
  });

  it('has no status and no cause unless given them', () => {
    const error = new FetchError('network', PAGE, 'no answer');
    expect(error.status).toBeUndefined();
    expect('cause' in error).toBe(false);
  });

  it('keeps the cause it is given', () => {
    const cause = new Error('socket hang up');
    expect(new FetchError('network', PAGE, 'no answer', { cause }).cause).toBe(cause);
  });
});

describe('HttpFetcher: a page', () => {
  it('returns the page, with where it came from, what it said it was, and when it was fetched', async () => {
    const { fetcher } = setup(site({ [PAGE]: { body: '<p>Hello</p>', type: 'text/html; charset=utf-8' } }));
    expect(await fetcher.get(PAGE)).toEqual({
      url: PAGE,
      finalUrl: PAGE,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<p>Hello</p>',
      retrievedAt: '2026-10-05T04:31:00.000Z',
    });
  });

  it('reads the body as UTF-8, without a byte order mark', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`caf${String.fromCharCode(0xe9)}`, 'utf8')]);
    const { fetcher } = setup(site({ [PAGE]: { body: bytes } }));
    expect((await fetcher.get(PAGE)).body).toBe(`caf${String.fromCharCode(0xe9)}`);
  });

  it('sends the configured user agent and an Accept header, and nothing else, on every request', async () => {
    const { fetcher, sent } = setup(site({ [PAGE]: { body: 'x' } }));
    await fetcher.get(PAGE);
    expect(urlsOf(sent)).toEqual([ROBOTS, PAGE]);
    for (const request of sent) {
      expect(Object.keys(request.headers).sort()).toEqual(['Accept', 'User-Agent']);
      expect(request.headers['User-Agent']).toBe(UA);
      expect(request.headers.Accept).toBe('text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.9,text/plain;q=0.5');
    }
  });

  it('does not follow redirects by itself: it asks the transport to hand them back', async () => {
    const { fetcher, sent } = setup(site({ [PAGE]: { body: 'x' } }));
    await fetcher.get(PAGE);
    expect(sent.map((request) => request.redirect)).toEqual(['manual', 'manual']);
  });

  it('refuses an address that is not an http or https address', async () => {
    const { fetcher, sent } = setup(site());
    for (const address of ['not a url', 'ftp://www.fixture-robotics.example/a', 'file:///etc/passwd', '']) {
      const error = await failure(fetcher.get(address));
      expect(error.kind).toBe('network');
      expect(error.message).toContain('is not an http or https address');
    }
    expect(sent).toEqual([]);
  });

  it('uses the global fetch when it is given no transport', async () => {
    const stub = vi.fn(async (url: string) => {
      const robots = url.endsWith('/robots.txt');
      return new Response(robots ? 'User-agent: *\nAllow: /' : 'hello', { status: 200, headers: { 'content-type': robots ? 'text/plain' : 'text/html' } });
    });
    vi.stubGlobal('fetch', stub);
    const fetcher = new HttpFetcher({ userAgent: UA, maxBytes: 1000, requestIntervalMs: 0, now: () => NOW, lookup: publicLookup });
    expect((await fetcher.get(PAGE)).body).toBe('hello');
    expect(stub.mock.calls.map((call) => call[0])).toEqual([ROBOTS, PAGE]);
  });
});

describe('HttpFetcher: robots.txt comes first', () => {
  it('asks for the robots.txt of a host before the first page of the host, and only then for the page', async () => {
    const { fetcher, sent } = setup(site({ [PAGE]: { body: 'x' } }));
    await fetcher.get(PAGE);
    expect(urlsOf(sent)).toEqual([ROBOTS, PAGE]);
  });

  it('asks only once for a host, however many pages it fetches, and once for each host', async () => {
    const { fetcher, sent } = setup(
      site({
        [PAGE]: { body: 'x' },
        [`${HOST}/news/other`]: { body: 'y' },
        [`${OTHER_HOST}/robots.txt`]: { status: 404 },
        [`${OTHER_HOST}/a`]: { body: 'z' },
      }),
    );
    await fetcher.get(PAGE);
    await fetcher.get(`${HOST}/news/other`);
    await fetcher.get(`${OTHER_HOST}/a`);
    expect(urlsOf(sent)).toEqual([ROBOTS, PAGE, `${HOST}/news/other`, `${OTHER_HOST}/robots.txt`, `${OTHER_HOST}/a`]);
  });

  it('asks once when two pages of a host are fetched at the same time', async () => {
    const { fetcher, sent } = setup(site({ [PAGE]: { body: 'x' }, [`${HOST}/news/other`]: { body: 'y' } }));
    await Promise.all([fetcher.get(PAGE), fetcher.get(`${HOST}/news/other`)]);
    expect(urlsOf(sent).filter((url) => url === ROBOTS)).toHaveLength(1);
  });

  it('treats http and https, and a port, as different hosts, each with its own robots.txt', async () => {
    const { fetcher, sent } = setup({
      'http://www.fixture-robotics.example/robots.txt': { status: 404 },
      'http://www.fixture-robotics.example/a': { body: 'x' },
      [ROBOTS]: { status: 404 },
      [`${HOST}/a`]: { body: 'y' },
      'https://www.fixture-robotics.example:8443/robots.txt': { status: 404 },
      'https://www.fixture-robotics.example:8443/a': { body: 'z' },
    });
    await fetcher.get('http://www.fixture-robotics.example/a');
    await fetcher.get(`${HOST}/a`);
    await fetcher.get('https://www.fixture-robotics.example:8443/a');
    expect(urlsOf(sent).filter((url) => url.endsWith('/robots.txt'))).toHaveLength(3);
  });

  it('does not fetch a page that robots.txt does not allow, and says so', async () => {
    const { fetcher, sent } = setup(site({ [ROBOTS]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /news/' }, [PAGE]: { body: 'x' } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('robots');
    expect(error.url).toBe(PAGE);
    expect(error.message).toBe(`${PAGE}: ${HOST}/robots.txt does not allow AgenticMediaHouseDesk to fetch /news/fx-1-ships`);
    expect(urlsOf(sent)).toEqual([ROBOTS]);
  });

  it('reads the robots.txt as the Desk: the group that names it applies, and the group for everyone does not', async () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: AgenticMediaHouseDesk\nDisallow: /private';
    const { fetcher } = setup(site({ [ROBOTS]: { type: 'text/plain', body: robots }, [PAGE]: { body: 'x' }, [`${HOST}/private/a`]: { body: 'y' } }));
    expect((await fetcher.get(PAGE)).body).toBe('x');
    expect((await failure(fetcher.get(`${HOST}/private/a`))).kind).toBe('robots');
  });

  it('matches the path with its query string', async () => {
    const { fetcher, sent } = setup(site({ [ROBOTS]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /*?session=' }, [`${HOST}/a?x=1`]: { body: 'x' }, [`${HOST}/a?session=1`]: { body: 'y' } }));
    await fetcher.get(`${HOST}/a?x=1`);
    expect((await failure(fetcher.get(`${HOST}/a?session=1`))).kind).toBe('robots');
    expect(urlsOf(sent)).not.toContain(`${HOST}/a?session=1`);
  });

  it('stays blocked: asking again does not ask robots.txt again, and no other way is tried', async () => {
    const { fetcher, sent } = setup(site({ [ROBOTS]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /' }, [PAGE]: { body: 'x' } }));
    await failure(fetcher.get(PAGE));
    await failure(fetcher.get(PAGE));
    expect(urlsOf(sent)).toEqual([ROBOTS]);
    expect(new Set(sent.map((request) => request.headers['User-Agent']))).toEqual(new Set([UA]));
  });

  it.each([404, 410])('allows everything when the site has no robots.txt (%i)', async (status) => {
    const { fetcher } = setup(site({ [ROBOTS]: { status }, [PAGE]: { body: 'x' } }));
    expect((await fetcher.get(PAGE)).body).toBe('x');
  });

  it('allows everything, and notes the problem, when the file is not a robots.txt (a page served in its place)', async () => {
    const { fetcher } = setup(site({ [ROBOTS]: { type: 'text/html', body: '<html><body>Welcome</body></html>' }, [PAGE]: { body: 'x' } }));
    expect((await fetcher.get(PAGE)).body).toBe('x');
    expect(fetcher.notes).toContain(`${ROBOTS}: line 1 is not a directive and is ignored: "<html><body>Welcome</body></html>"`);
    expect(fetcher.notes).toContain(`${ROBOTS}: the file has no robots.txt directive in it, so everything is allowed`);
  });

  it('does not fetch from a host whose robots.txt answers with a server error, and says why', async () => {
    const { fetcher, sent } = setup(site({ [ROBOTS]: { status: 503 }, [PAGE]: { body: 'x' } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('robots');
    expect(error.message).toBe(`${PAGE}: ${HOST}/robots.txt could not be read (status 503), so the Desk does not fetch from www.fixture-robotics.example`);
    expect(urlsOf(sent)).toEqual([ROBOTS, ROBOTS, ROBOTS]);
    expect(fetcher.notes).toEqual([`${HOST}/robots.txt could not be read (status 503), so the Desk does not fetch from www.fixture-robotics.example`]);
  });

  it('remembers that robots.txt could not be read: the next page of the host is refused without asking again', async () => {
    const { fetcher, sent } = setup(site({ [ROBOTS]: { status: 500 }, [PAGE]: { body: 'x' } }));
    await failure(fetcher.get(PAGE));
    const asked = sent.length;
    expect((await failure(fetcher.get(PAGE))).kind).toBe('robots');
    expect(sent).toHaveLength(asked);
    expect(fetcher.notes).toHaveLength(1);
  });

  it.each([401, 403])('does not fetch from a host that refuses the Desk its robots.txt (%i)', async (status) => {
    const { fetcher, sent } = setup(site({ [ROBOTS]: { status }, [PAGE]: { body: 'x' } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('robots');
    expect(error.message).toContain(`could not be read (status ${status})`);
    expect(urlsOf(sent)).toEqual([ROBOTS]);
  });

  it('does not fetch from a host whose robots.txt cannot be reached', async () => {
    const { fetcher } = setup({ [PAGE]: { body: 'x' } });
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('robots');
    expect(error.message).toContain('could not be read (network)');
  });

  it('does not fetch from a host whose robots.txt is not text', async () => {
    const { fetcher } = setup(site({ [ROBOTS]: { type: 'application/octet-stream', body: 'x' }, [PAGE]: { body: 'x' } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('robots');
    expect(error.message).toContain('could not be read (type)');
  });

  it('follows a redirect of the robots.txt', async () => {
    const { fetcher, sent } = setup({
      [ROBOTS]: { status: 301, headers: { location: `${HOST}/policy/robots.txt` } },
      [`${HOST}/policy/robots.txt`]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /news/' },
      [PAGE]: { body: 'x' },
    });
    expect((await failure(fetcher.get(PAGE))).kind).toBe('robots');
    expect(urlsOf(sent)).toEqual([ROBOTS, `${HOST}/policy/robots.txt`]);
  });

  it('checks robots.txt again at every redirect, and does not follow one into a path that is not allowed', async () => {
    const { fetcher, sent } = setup(
      site({
        [ROBOTS]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /private' },
        [PAGE]: { status: 302, headers: { location: '/private/x' } },
        [`${HOST}/private/x`]: { body: 'secret' },
      }),
    );
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('robots');
    expect(error.url).toBe(`${HOST}/private/x`);
    expect(urlsOf(sent)).toEqual([ROBOTS, PAGE]);
  });

  it('asks the robots.txt of the other host when a redirect leads to one', async () => {
    const { fetcher, sent } = setup(
      site({
        [PAGE]: { status: 301, headers: { location: `${OTHER_HOST}/moved` } },
        [`${OTHER_HOST}/robots.txt`]: { status: 404 },
        [`${OTHER_HOST}/moved`]: { body: 'moved' },
      }),
    );
    const page = await fetcher.get(PAGE);
    expect(page.finalUrl).toBe(`${OTHER_HOST}/moved`);
    expect(urlsOf(sent)).toEqual([ROBOTS, PAGE, `${OTHER_HOST}/robots.txt`, `${OTHER_HOST}/moved`]);
  });
});

describe('HttpFetcher: redirects', () => {
  it.each([301, 302, 303, 307, 308])('follows a %i, and says where the page ended up', async (status) => {
    const { fetcher } = setup(site({ [PAGE]: { status, headers: { location: `${HOST}/news/new` } }, [`${HOST}/news/new`]: { body: 'moved' } }));
    const page = await fetcher.get(PAGE);
    expect(page.url).toBe(PAGE);
    expect(page.finalUrl).toBe(`${HOST}/news/new`);
    expect(page.body).toBe('moved');
  });

  it('resolves a relative address against the page that sent it', async () => {
    const { fetcher } = setup(site({ [PAGE]: { status: 301, headers: { location: 'fx-2-ships' } }, [`${HOST}/news/fx-2-ships`]: { body: 'two' } }));
    expect((await fetcher.get(PAGE)).finalUrl).toBe(`${HOST}/news/fx-2-ships`);
  });

  it(`follows ${MAX_REDIRECTS} redirects`, async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i < MAX_REDIRECTS; i++) routes[`${HOST}/r${i}`] = { status: 302, headers: { location: `/r${i + 1}` } };
    routes[`${HOST}/r${MAX_REDIRECTS}`] = { body: 'there' };
    const { fetcher } = setup(site(routes));
    expect((await fetcher.get(`${HOST}/r0`)).body).toBe('there');
  });

  it(`stops at the redirect after ${MAX_REDIRECTS}`, async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i <= MAX_REDIRECTS; i++) routes[`${HOST}/r${i}`] = { status: 302, headers: { location: `/r${i + 1}` } };
    routes[`${HOST}/r${MAX_REDIRECTS + 1}`] = { body: 'too far' };
    const { fetcher, sent } = setup(site(routes));
    const error = await failure(fetcher.get(`${HOST}/r0`));
    expect(error.kind).toBe('redirects');
    expect(error.url).toBe(`${HOST}/r0`);
    expect(error.message).toContain(`more than ${MAX_REDIRECTS} redirects`);
    expect(urlsOf(sent)).not.toContain(`${HOST}/r${MAX_REDIRECTS + 1}`);
  });

  it('stops a redirect that leads back to itself', async () => {
    const { fetcher } = setup(site({ [`${HOST}/a`]: { status: 302, headers: { location: '/b' } }, [`${HOST}/b`]: { status: 302, headers: { location: '/a' } } }));
    expect((await failure(fetcher.get(`${HOST}/a`))).kind).toBe('redirects');
  });

  it('refuses a redirect with no address to go to', async () => {
    const { fetcher } = setup(site({ [PAGE]: { status: 302 } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('status');
    expect(error.status).toBe(302);
    expect(error.message).toContain('with no Location');
  });

  it.each(['ftp://www.fixture-robotics.example/file', 'javascript:alert(1)', 'http://'])('refuses a redirect to %s', async (location) => {
    const { fetcher } = setup(site({ [PAGE]: { status: 301, headers: { location } } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('redirects');
    expect(error.message).toContain('which is not an http or https address');
  });
});

describe('HttpFetcher: addresses that are not public', () => {
  // The Desk fetches the address that a feed item or a redirect names, and what comes back is stored and shown to a model. A name that leads to
  // the machine itself, to the network behind it or to the metadata service of a cloud (169.254.169.254) must not be fetched: not at the
  // first request, and not at any hop of a redirect. The check is made on the name's own addresses (every one of them), and an address that is
  // written as a number is refused whatever it is. FixtureFetcher is not checked: it serves files.
  const HOSTNAME = 'www.fixture-robotics.example';

  /** A fetcher whose names resolve as the table says; it also records what happens, in order, to show that a name is looked up before anything is sent. */
  function guarded(routes: Record<string, Route>, table: Record<string, string[]>) {
    const events: string[] = [];
    const { lookup, asked } = tableLookup(table);
    const { transport, sent } = scriptedTransport(routes);
    const fetcher = new HttpFetcher({
      userAgent: UA,
      maxBytes: 10_000,
      requestIntervalMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      lookup: async (host) => {
        events.push(`lookup ${host}`);
        return lookup(host);
      },
      transport: async (url, init) => {
        events.push(`send ${url}`);
        return transport(url, init);
      },
    });
    return { fetcher, sent, asked, events };
  }

  it('asks for the addresses of a name before it sends anything, and fetches from a host whose addresses are all public', async () => {
    const { fetcher, sent, events } = guarded(site({ [PAGE]: { body: 'there' } }), { [HOSTNAME]: [PUBLIC_ADDRESS, '5.6.7.8', '2345:6789::1'] });
    expect((await fetcher.get(PAGE)).body).toBe('there');
    expect(events[0]).toBe(`lookup ${HOSTNAME}`);
    expect(events.indexOf(`send ${ROBOTS}`)).toBeGreaterThan(0);
    expect(urlsOf(sent)).toEqual([ROBOTS, PAGE]);
  });

  it.each([
    ['a private address', ['10.1.2.3']],
    ['a loopback address', ['127.0.0.1']],
    ['the address of the metadata service of a cloud', ['169.254.169.254']],
    ['a private IPv6 address', ['fd00::1']],
    ['a link-local IPv6 address', ['fe80::1']],
    ['an IPv4 private address mapped into IPv6', ['::ffff:192.168.0.1']],
    ['one public address and one private address, in either order', [PUBLIC_ADDRESS, '192.168.1.1']],
    ['one private address and one public address', ['192.168.1.1', PUBLIC_ADDRESS]],
    ['an address that is no address', ['not-an-address']],
  ])('refuses a name that resolves to %s, and sends nothing', async (_what, addresses) => {
    const { fetcher, sent } = guarded(site({ [PAGE]: { body: 'there' } }), { [HOSTNAME]: addresses });
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('address');
    expect(error.url).toBe(PAGE);
    expect(error.message).toContain(`${HOSTNAME} resolves to `);
    expect(error.message).toContain('which is not a public address');
    expect(sent).toEqual([]);
  });

  it('names the address that it refused', async () => {
    const { fetcher } = guarded(site({}), { [HOSTNAME]: [PUBLIC_ADDRESS, '10.9.8.7'] });
    expect((await failure(fetcher.get(PAGE))).message).toBe(`${PAGE}: ${HOSTNAME} resolves to 10.9.8.7, which is not a public address, so the Desk does not fetch from it`);
  });

  it.each([
    'http://127.0.0.1/x',
    'http://8.8.8.8/x',
    'http://[::1]/x',
    'http://[2345:6789::1]/x',
    'http://2130706433/x',
    'http://0x7f.0.0.1/x',
    'http://169.254.169.254/latest/meta-data/',
  ])('refuses the address %s, which is written as a number, without asking a name server', async (address) => {
    const { fetcher, sent, asked } = guarded(site({}), {});
    const error = await failure(fetcher.get(address));
    expect(error.kind).toBe('address');
    expect(error.message).toContain('the host is an IP address and not a name');
    expect(sent).toEqual([]);
    expect(asked).toEqual([]);
  });

  it.each(['http://localhost/x', 'http://LOCALHOST:8080/x', 'http://localhost./x', 'http://admin.localhost/x'])('refuses %s, without asking a name server', async (address) => {
    const { fetcher, sent, asked } = guarded(site({}), {});
    const error = await failure(fetcher.get(address));
    expect(error.kind).toBe('address');
    expect(error.message).toContain('the host is localhost');
    expect(sent).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('refuses an address with a user name or a password', async () => {
    const { fetcher, sent } = guarded(site({}), { [HOSTNAME]: [PUBLIC_ADDRESS] });
    for (const address of [`https://user:secret@${HOSTNAME}/x`, `https://user@${HOSTNAME}/x`]) {
      const error = await failure(fetcher.get(address));
      expect(error.kind).toBe('address');
      expect(error.message).toContain('the address has a user name or a password');
    }
    expect(sent).toEqual([]);
  });

  it('refuses a name that cannot be resolved, as a network error, and a name that has no address', async () => {
    const { fetcher } = guarded(site({}), { [HOSTNAME]: [] });
    const none = await failure(fetcher.get(PAGE));
    expect(none.kind).toBe('network');
    expect(none.message).toContain(`the name ${HOSTNAME} has no address`);
    const unknown = await failure(guarded(site({}), {}).fetcher.get(PAGE));
    expect(unknown.kind).toBe('network');
    expect(unknown.message).toContain(`the name ${HOSTNAME} could not be resolved: getaddrinfo ENOTFOUND ${HOSTNAME}`);
  });

  describe('at every hop of a redirect', () => {
    const INTERNAL = 'https://internal.fixture-robotics.example';

    it('refuses a redirect to a name that resolves to a private address, and never sends the request to it, nor asks its robots.txt', async () => {
      const { fetcher, sent } = guarded(site({ [PAGE]: { status: 302, headers: { location: `${INTERNAL}/admin` } } }), { [HOSTNAME]: [PUBLIC_ADDRESS], 'internal.fixture-robotics.example': ['10.0.0.8'] });
      const error = await failure(fetcher.get(PAGE));
      expect(error.kind).toBe('address');
      expect(error.url).toBe(`${INTERNAL}/admin`);
      expect(urlsOf(sent)).toEqual([ROBOTS, PAGE]);
    });

    it('refuses a redirect in the middle of a chain, after hops that were allowed', async () => {
      const routes = site({
        [`${HOST}/a`]: { status: 302, headers: { location: '/b' } },
        [`${HOST}/b`]: { status: 302, headers: { location: `${OTHER_HOST}/c` } },
        [`${OTHER_HOST}/robots.txt`]: { status: 404 },
        [`${OTHER_HOST}/c`]: { status: 302, headers: { location: 'https://metadata.mercer-wire.example/d' } },
      });
      const { fetcher, sent } = guarded(routes, { [HOSTNAME]: [PUBLIC_ADDRESS], 'www.mercer-wire.example': [PUBLIC_ADDRESS], 'metadata.mercer-wire.example': ['169.254.169.254'] });
      const error = await failure(fetcher.get(`${HOST}/a`));
      expect(error.kind).toBe('address');
      expect(error.url).toBe('https://metadata.mercer-wire.example/d');
      expect(urlsOf(sent)).toEqual([ROBOTS, `${HOST}/a`, `${HOST}/b`, `${OTHER_HOST}/robots.txt`, `${OTHER_HOST}/c`]);
    });

    it.each(['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:8080/', 'http://[::1]/', 'http://localhost:3000/', 'http://2130706433/', 'https://user:pw@www.mercer-wire.example/x'])(
      'refuses a redirect to %s',
      async (location) => {
        const { fetcher, sent } = guarded(site({ [PAGE]: { status: 301, headers: { location } } }), { [HOSTNAME]: [PUBLIC_ADDRESS], 'www.mercer-wire.example': [PUBLIC_ADDRESS] });
        const error = await failure(fetcher.get(PAGE));
        expect(error.kind).toBe('address');
        expect(urlsOf(sent)).toEqual([ROBOTS, PAGE]);
      },
    );

    it('follows a redirect to another host whose addresses are public, and asks for its addresses first', async () => {
      const routes = site({ [PAGE]: { status: 302, headers: { location: `${OTHER_HOST}/moved` } }, [`${OTHER_HOST}/robots.txt`]: { status: 404 }, [`${OTHER_HOST}/moved`]: { body: 'moved here' } });
      const { fetcher, events } = guarded(routes, { [HOSTNAME]: [PUBLIC_ADDRESS], 'www.mercer-wire.example': ['5.6.7.8'] });
      const page = await fetcher.get(PAGE);
      expect(page.finalUrl).toBe(`${OTHER_HOST}/moved`);
      expect(events.indexOf('lookup www.mercer-wire.example')).toBeGreaterThan(-1);
      expect(events.indexOf('lookup www.mercer-wire.example')).toBeLessThan(events.indexOf(`send ${OTHER_HOST}/robots.txt`));
    });

    it('refuses a robots.txt that redirects to a private address, and so fetches nothing from the host: the robots.txt could not be read', async () => {
      const { fetcher, sent } = guarded({ [ROBOTS]: { status: 301, headers: { location: 'http://10.0.0.1/robots.txt' } }, [PAGE]: { body: 'there' } }, { [HOSTNAME]: [PUBLIC_ADDRESS] });
      const error = await failure(fetcher.get(PAGE));
      expect(error.kind).toBe('robots');
      expect(error.message).toContain('could not be read (address)');
      expect(urlsOf(sent)).toEqual([ROBOTS]);
    });
  });
});

describe('HttpFetcher: what it will not take', () => {
  it.each([404, 403, 410, 400])('refuses a page that answers %i, and does not try again', async (status) => {
    const { fetcher, sent, sleeps } = setup(site({ [PAGE]: { status } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('status');
    expect(error.status).toBe(status);
    expect(error.message).toBe(`${PAGE}: answered ${status}`);
    expect(urlsOf(sent).filter((url) => url === PAGE)).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it.each(['text/html', 'text/html; charset=utf-8', 'TEXT/HTML', 'application/xhtml+xml', 'application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml', 'text/plain'])(
    'takes a page of type %s',
    async (type) => {
      const { fetcher } = setup(site({ [PAGE]: { type, body: 'x' } }));
      expect((await fetcher.get(PAGE)).contentType).toBe(type);
    },
  );

  it('takes a type that has white space before its parameters', async () => {
    const { fetcher } = setup(site({ [PAGE]: { type: 'application/xml ; charset=utf-8', body: 'x' } }));
    expect((await fetcher.get(PAGE)).body).toBe('x');
  });

  it.each(['application/pdf', 'image/png', 'application/json', 'application/octet-stream', 'video/mp4'])('refuses a page of type %s', async (type) => {
    const { fetcher } = setup(site({ [PAGE]: { type, body: 'x' } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('type');
    expect(error.message).toBe(`${PAGE}: the page is of type ${type}, and the Desk reads only html, xml and text`);
  });

  it('refuses a page that does not say what it is', async () => {
    // A text body would be given the type text/plain by Response itself, so the body is bytes.
    const { fetcher } = setup(site({ [PAGE]: { type: null, body: new TextEncoder().encode('x') } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('type');
    expect(error.message).toContain('of type unknown');
  });

  it.each([300, 404, 410])('goes by the status before the type or the size: a %i with a body that is a file or is too large is a status error', async (status) => {
    const { fetcher } = setup(site({ [PAGE]: { status, type: 'application/pdf', body: 'a'.repeat(500) } }), { maxBytes: 100 });
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('status');
    expect(error.status).toBe(status);
  });

  it('follows a redirect whose body is a file or is too large, and tries again after a server error with such a body', async () => {
    const big = { type: 'application/pdf', body: 'a'.repeat(500) };
    const { fetcher } = setup(
      site({
        [PAGE]: [{ ...big, status: 503 }, { ...big, status: 302, headers: { location: `${HOST}/moved` } }],
        [`${HOST}/moved`]: { body: 'moved' },
      }),
      { maxBytes: 100 },
    );
    expect((await fetcher.get(PAGE)).body).toBe('moved');
  });

  it('takes a page of exactly the size limit', async () => {
    const { fetcher } = setup(site({ [PAGE]: { body: 'a'.repeat(100) } }), { maxBytes: 100 });
    expect((await fetcher.get(PAGE)).body).toHaveLength(100);
  });

  it('refuses a page one byte over the size limit', async () => {
    const { fetcher } = setup(site({ [PAGE]: { body: 'a'.repeat(101) } }), { maxBytes: 100 });
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('too-large');
    expect(error.message).toBe(`${PAGE}: the page is larger than the limit of 100 bytes`);
  });

  it('counts bytes, not characters', async () => {
    const text = String.fromCharCode(0xe9).repeat(60);
    const { fetcher } = setup(site({ [PAGE]: { body: text } }), { maxBytes: 100 });
    expect((await failure(fetcher.get(PAGE))).kind).toBe('too-large');
  });

  it('stops reading as soon as a page is over the limit, and closes the stream', async () => {
    const cancelled = { value: false };
    const { fetcher } = setup(site({ [PAGE]: { body: streamOf(['aaaaaa', 'bbbbbb', 'cccccc'], cancelled) } }), { maxBytes: 10 });
    expect((await failure(fetcher.get(PAGE))).kind).toBe('too-large');
    expect(cancelled.value).toBe(true);
  });

  it('refuses a page that says it is over the limit without reading it', async () => {
    const cancelled = { value: false };
    const { fetcher } = setup(site({ [PAGE]: { headers: { 'content-length': '101' }, body: streamOf(['a'], cancelled) } }), { maxBytes: 100 });
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('too-large');
    expect(error.message).toBe(`${PAGE}: the page says it is 101 bytes, more than the limit of 100`);
    expect(cancelled.value).toBe(true);
  });

  it('believes what a page says about its size only when it is over the limit', async () => {
    const { fetcher } = setup(site({ [PAGE]: { headers: { 'content-length': '100' }, body: 'a'.repeat(100) } }), { maxBytes: 100 });
    expect((await fetcher.get(PAGE)).body).toHaveLength(100);
  });
});

describe('HttpFetcher: trying again', () => {
  it.each([429, 500, 502, 503, 504])('tries again after a %i, after one second and then two, and returns the page that comes', async (status) => {
    const { fetcher, sent, sleeps } = setup(site({ [PAGE]: [{ status }, { status }, { body: 'at last' }] }));
    expect((await fetcher.get(PAGE)).body).toBe('at last');
    expect(urlsOf(sent).filter((url) => url === PAGE)).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('gives up after the retries, and says how many there were', async () => {
    const { fetcher, sent, sleeps } = setup(site({ [PAGE]: { status: 503 } }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('status');
    expect(error.status).toBe(503);
    expect(error.message).toBe(`${PAGE}: answered 503 after 2 retries`);
    expect(urlsOf(sent).filter((url) => url === PAGE)).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('does not try again when it is allowed no retries, and then does not mention them', async () => {
    const { fetcher, sent, sleeps } = setup(site({ [PAGE]: { status: 503 } }), { retries: 0 });
    const error = await failure(fetcher.get(PAGE));
    expect(error.message).toBe(`${PAGE}: answered 503`);
    expect(urlsOf(sent).filter((url) => url === PAGE)).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('says "1 retry" in the singular', async () => {
    const { fetcher } = setup(site({ [PAGE]: { status: 503 } }), { retries: 1 });
    expect((await failure(fetcher.get(PAGE))).message).toBe(`${PAGE}: answered 503 after 1 retry`);
  });

  it('doubles the wait each time and never waits longer than the cap', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: { status: 503 } }), { retries: 4, baseDelayMs: 100, maxDelayMs: 250 });
    await failure(fetcher.get(PAGE));
    expect(sleeps).toEqual([100, 200, 250, 250]);
  });

  it('does not wait at all between tries when the wait is set to nothing', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: { status: 503 } }), { baseDelayMs: 0 });
    await failure(fetcher.get(PAGE));
    expect(sleeps).toEqual([0, 0]);
  });

  it('waits as long as the site asks, in seconds, when that is longer than its own wait', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: [{ status: 429, headers: { 'retry-after': '5' } }, { body: 'ok' }] }));
    await fetcher.get(PAGE);
    expect(sleeps).toEqual([5000]);
  });

  it('never waits longer than the cap, whatever the site asks', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: [{ status: 429, headers: { 'retry-after': '100000' } }, { body: 'ok' }] }));
    await fetcher.get(PAGE);
    expect(sleeps).toEqual([30_000]);
  });

  it('keeps its own wait when the site asks for less', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: [{ status: 429, headers: { 'retry-after': '0' } }, { body: 'ok' }] }));
    await fetcher.get(PAGE);
    expect(sleeps).toEqual([1000]);
  });

  it('ignores a request to wait that is a date, not a number of seconds', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: [{ status: 503, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } }, { body: 'ok' }] }));
    await fetcher.get(PAGE);
    expect(sleeps).toEqual([1000]);
  });

  it('does not try again after a network failure, because it cannot tell whether the site got the request', async () => {
    const { fetcher, sent, sleeps } = setup(site({ [PAGE]: new Error('socket hang up') }));
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('network');
    expect(error.message).toBe(`${PAGE}: could not be fetched: socket hang up`);
    expect((error.cause as Error).message).toBe('socket hang up');
    expect(urlsOf(sent).filter((url) => url === PAGE)).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('reports an address that nothing answers as a network failure', async () => {
    const { fetcher } = setup(site());
    expect((await failure(fetcher.get(PAGE))).kind).toBe('network');
  });
});

describe('HttpFetcher: time', () => {
  /** A route that never answers until the request is cancelled. */
  const hangs: Route = (init) => new Promise<Response>((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('cancelled'))));

  it('gives up on a site that does not answer in time', async () => {
    vi.useFakeTimers();
    const { fetcher } = setup(site({ [PAGE]: hangs }), { timeoutMs: 1000 });
    const pending = failure(fetcher.get(PAGE));
    await vi.advanceTimersByTimeAsync(1000);
    const error = await pending;
    expect(error.kind).toBe('timeout');
    expect(error.message).toBe(`${PAGE}: no answer within 1000 ms`);
  });

  it('does not give up early', async () => {
    vi.useFakeTimers();
    const { fetcher } = setup(site({ [PAGE]: hangs }), { timeoutMs: 1000 });
    let settled = false;
    const pending = failure(fetcher.get(PAGE)).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it('gives up on a page that starts to arrive and does not finish', async () => {
    vi.useFakeTimers();
    const stalled: Route = async (init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal.addEventListener('abort', () => controller.error(new Error('cancelled')));
          },
        }),
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    const { fetcher } = setup(site({ [PAGE]: stalled }), { timeoutMs: 1000 });
    const pending = failure(fetcher.get(PAGE));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).kind).toBe('timeout');
  });

  it('reports a timeout that the transport itself raises', async () => {
    const { fetcher } = setup(site({ [PAGE]: new DOMException('The operation timed out', 'TimeoutError') }));
    expect((await failure(fetcher.get(PAGE))).kind).toBe('timeout');
  });

  it('does not leave a timer running after a page has been fetched', async () => {
    vi.useFakeTimers();
    const { fetcher } = setup(site({ [PAGE]: { body: 'x' } }), { timeoutMs: 1000 });
    await fetcher.get(PAGE);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not leave a timer running after a failure either', async () => {
    vi.useFakeTimers();
    const { fetcher } = setup(site({ [PAGE]: { status: 404 } }), { timeoutMs: 1000 });
    await failure(fetcher.get(PAGE));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('HttpFetcher: one request in a while to a host', () => {
  it('spaces the requests to one host by the interval, robots.txt included, and does not make another host wait', async () => {
    const { fetcher, sleeps } = setup(
      site({
        [PAGE]: { body: 'x' },
        [`${HOST}/news/other`]: { body: 'y' },
        [`${OTHER_HOST}/robots.txt`]: { status: 404 },
        [`${OTHER_HOST}/a`]: { body: 'z' },
      }),
      { requestIntervalMs: 1000 },
    );
    await fetcher.get(PAGE);
    await fetcher.get(`${HOST}/news/other`);
    await fetcher.get(`${OTHER_HOST}/a`);
    // The clock stands still, so each request to a host waits one interval more than the one before:
    // robots.txt (no wait), the page (1000), the second page (2000); then the other host's robots.txt (no wait) and its page (1000).
    expect(sleeps).toEqual([1000, 2000, 1000]);
  });

  it('makes a retry wait for its interval too', async () => {
    const { fetcher, sleeps } = setup(site({ [PAGE]: [{ status: 503 }, { body: 'ok' }] }), { requestIntervalMs: 1000 });
    await fetcher.get(PAGE);
    // robots.txt (no wait); the page (1000); the pause before the retry (1000); the retry (the interval from the page is 2000, from the clock's standstill).
    expect(sleeps).toEqual([1000, 1000, 2000]);
  });
});

describe('FixtureFetcher', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'desk-fixture-fetcher-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));
  mkdirSync(path.join(scratch, 'pages'));
  writeFileSync(path.join(scratch, 'pages', 'a.html'), '<p>A</p>');
  writeFileSync(path.join(scratch, 'pages', 'feed.xml'), '<rss/>');
  writeFileSync(path.join(scratch, 'pages', 'notes.txt'), 'notes');
  writeFileSync(path.join(scratch, 'pages', 'data.bin'), 'data');

  const now = () => NOW;

  it('does not check the addresses it serves: a fixture is a file and not a connection', async () => {
    const fetcher = new FixtureFetcher(scratch, { 'http://localhost/a': 'pages/a.html', 'http://127.0.0.1/b': 'pages/a.html' }, now);
    expect((await fetcher.get('http://localhost/a')).body).toBe('<p>A</p>');
    expect((await fetcher.get('http://127.0.0.1/b')).body).toBe('<p>A</p>');
  });

  it('serves the file that an address is mapped to, as a page fetched at the time it is given', async () => {
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: 'pages/a.html' }, now);
    expect(await fetcher.get(PAGE)).toEqual({ url: PAGE, finalUrl: PAGE, status: 200, contentType: 'text/html; charset=utf-8', body: '<p>A</p>', retrievedAt: '2026-10-05T04:31:00.000Z' });
  });

  it.each([
    ['pages/a.html', 'text/html; charset=utf-8'],
    ['pages/feed.xml', 'application/xml'],
    ['pages/notes.txt', 'text/plain'],
    ['pages/data.bin', 'text/plain'],
  ])('says that %s is %s', async (file, contentType) => {
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: file }, now);
    expect((await fetcher.get(PAGE)).contentType).toBe(contentType);
  });

  it('can be told another content type and another final address', async () => {
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: { file: 'pages/a.html', contentType: 'application/xhtml+xml', finalUrl: `${HOST}/moved` } }, now);
    const page = await fetcher.get(PAGE);
    expect(page.contentType).toBe('application/xhtml+xml');
    expect(page.finalUrl).toBe(`${HOST}/moved`);
    expect(page.url).toBe(PAGE);
  });

  it('throws the error that an address is mapped to, as it is', async () => {
    const error = new FetchError('robots', PAGE, 'robots.txt does not allow AgenticMediaHouseDesk to fetch /news/fx-1-ships');
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: error }, now);
    await expect(fetcher.get(PAGE)).rejects.toBe(error);
  });

  it('fails like a site that cannot be reached for an address it has no fixture for', async () => {
    const fetcher = new FixtureFetcher(scratch, {}, now);
    const error = await failure(fetcher.get(PAGE));
    expect(error.kind).toBe('network');
    expect(error.message).toBe(`${PAGE}: no fixture is registered for this address`);
  });

  it('does not take the name of something every object has for an address', async () => {
    const fetcher = new FixtureFetcher(scratch, {}, now);
    expect((await failure(fetcher.get('constructor'))).kind).toBe('network');
  });

  it('records every address it was asked for, in order, including the ones it failed', async () => {
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: 'pages/a.html' }, now);
    await fetcher.get(PAGE);
    await failure(fetcher.get(`${HOST}/missing`));
    expect(fetcher.requests).toEqual([PAGE, `${HOST}/missing`]);
  });

  it('uses the clock when it is not given one', async () => {
    const before = Date.now();
    const page = await new FixtureFetcher(scratch, { [PAGE]: 'pages/a.html' }).get(PAGE);
    const at = Date.parse(page.retrievedAt);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('fails with the error of the file system when a mapped file is missing, which is a mistake in the test', async () => {
    const fetcher = new FixtureFetcher(scratch, { [PAGE]: 'pages/missing.html' }, now);
    await expect(fetcher.get(PAGE)).rejects.toThrow('ENOENT');
  });
});
