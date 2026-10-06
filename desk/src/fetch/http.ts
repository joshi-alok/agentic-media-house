import { lookup as systemLookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeskConfig } from '../config';
import { addressProblem, isPublicAddress } from './address';
import { RateLimiter } from './rate-limit';
import { parseRobots, productToken, robotsAllows } from './robots';
import type { ParsedRobots } from './robots';

// The Desk's only way onto the web. A `Fetcher` turns an address into a page or fails with a
// `FetchError`. `HttpFetcher` does it over HTTP, with every rule of good manners in code: it asks a
// host's robots.txt before anything else and never works around an answer of no, it makes at most one
// request in a while to a host, it follows at most 5 redirects (and checks robots.txt at each), it
// refuses a page over the size limit while still reading it, it accepts only html, xml and text, and it
// tries again, a bounded number of times and after a pause, when a site says 429 or answers with a
// server error. It also never goes to a non-public address: before the first request and before every hop of
// a redirect, the host is looked up, and a name that has any address that is not public (loopback, private,
// link-local, the metadata service of a cloud) is refused, as is a host written as a number, `localhost`
// and an address with a user name in it. `FixtureFetcher` is the stand-in that tests and the dry-run demo
// use: it serves files, and nothing is checked.
//
// One limit remains, and the README says it: the name is looked up by the check and again by the transport, so
// a name server that answers differently the second time (DNS rebinding) could lead the transport to an address
// that the check did not see. Closing that needs the transport to connect to the address that was checked.

/** A page that was fetched. `url` is what was asked for and `finalUrl` is where the redirects ended. */
export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  /** The Content-Type header as the site sent it. */
  contentType: string;
  body: string;
  /** When it was fetched, as an ISO time. */
  retrievedAt: string;
}

export interface Fetcher {
  /** Fetch a page, or fail with a `FetchError`. */
  get(url: string): Promise<FetchedPage>;
}

/**
 * Why a page could not be fetched.
 * - `robots`: the site's robots.txt does not allow it, or could not be read (so the Desk does not guess).
 * - `status`: the site answered with a status that is not a success (after retries, for 429 and 5xx).
 * - `too-large`: the page is over the size limit.
 * - `timeout`: no answer, or no end of the page, in time.
 * - `redirects`: too many redirects, or one that leads somewhere that is not an http or https address.
 * - `network`: the site could not be reached, its name could not be looked up, or the address is not one.
 * - `type`: the page is not html, xml or text.
 * - `address`: the address is one that the Desk never fetches: it has a user name or a password, its host is `localhost` or is written
 *   as a number, or its name has an address that is not public (on the first request or at a hop of a redirect).
 */
export type FetchErrorKind = 'robots' | 'status' | 'too-large' | 'timeout' | 'redirects' | 'network' | 'type' | 'address';

export class FetchError extends Error {
  readonly kind: FetchErrorKind;
  /** The address that was being fetched. The message begins with it. */
  readonly url: string;
  /** The HTTP status, when the error is about one. */
  readonly status: number | undefined;

  constructor(kind: FetchErrorKind, url: string, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(`${url}: ${message}`, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'FetchError';
    this.kind = kind;
    this.url = url;
    this.status = options.status;
  }
}

/** What the fetcher hands to the transport with the address. It is what `fetch` accepts. */
export interface TransportRequest {
  headers: Record<string, string>;
  /** Always `manual`: redirects are followed by the fetcher, which checks robots.txt at each. */
  redirect: 'manual';
  signal: AbortSignal;
}

/** A function like `fetch`. The default is the global `fetch`; a test passes a script. */
export type Transport = (url: string, init: TransportRequest) => Promise<Response>;

/** The addresses of a host name, IPv4 and IPv6, as text; it throws when the name cannot be looked up. The default asks the system. */
export type Lookup = (host: string) => Promise<string[]>;

const lookupOfSystem: Lookup = async (host) => (await systemLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

export interface HttpFetcherOptions extends Pick<DeskConfig, 'userAgent' | 'maxBytes' | 'requestIntervalMs'> {
  transport?: Transport;
  /** How names are looked up, to check that none of their addresses is a private one. The default asks the system; a test passes a table. */
  lookup?: Lookup;
  /** The clock. A test passes its own. */
  now?: () => Date;
  /** How to wait, for the pause between requests to a host and the pause before a retry. A test passes its own. */
  sleep?: (ms: number) => Promise<void>;
  /** Tries after the first, for a 429 or a 5xx. Default 2. */
  retries?: number;
  /** The pause before the first retry; it doubles each time. Default 1000. */
  baseDelayMs?: number;
  /** The longest pause before a retry, whatever the site asks for. Default 30000. */
  maxDelayMs?: number;
  /** The longest the Desk waits for an answer and then for the end of the page. Default 20000. */
  timeoutMs?: number;
}

/** The most redirects that are followed. The one after that is an error. */
export const MAX_REDIRECTS = 5;

const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.9,text/plain;q=0.5';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** An address as a URL, if it is an http or https address. */
function httpUrl(address: string, base?: string): URL | undefined {
  try {
    const url = new URL(address, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The media type of a Content-Type header, in lowercase and without parameters; empty when there is none. */
const mediaTypeOf = (contentType: string): string => contentType.split(';')[0]!.trim().toLowerCase();

/** A status of the 2xx kind: the page is there. Whatever else a response says, its status is read first. */
const isSuccess = (status: number): boolean => status >= 200 && status < 300;

/** The Desk reads html, xml and text, and nothing else. */
function readable(mediaType: string): boolean {
  return mediaType.startsWith('text/') || mediaType === 'application/xml' || mediaType.endsWith('+xml');
}

/** What the Desk knows about a host's robots.txt: its rules, or that it cannot be read and so nothing is fetched. */
type RobotsState = { kind: 'rules'; parsed: ParsedRobots } | { kind: 'blocked'; why: string };

/** What one request came back with. The body is read only when the status is a success. */
interface Outcome {
  status: number;
  headers: Headers;
  /** The Content-Type header as the site sent it; empty when the response is not a success. */
  contentType: string;
  body: string;
}

export class HttpFetcher implements Fetcher {
  /** What the fetcher noticed about robots.txt files: problems in them, and the ones it could not read. */
  readonly notes: string[] = [];

  private readonly userAgent: string;
  private readonly token: string;
  private readonly maxBytes: number;
  private readonly transport: Transport;
  private readonly lookup: Lookup;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly timeoutMs: number;
  private readonly limiter: RateLimiter;
  /** One answer to "may we?" for each host (scheme, name and port), asked once. The promise is kept, so hosts asked at the same time are asked once. */
  private readonly robots = new Map<string, Promise<RobotsState>>();

  constructor(options: HttpFetcherOptions) {
    this.userAgent = options.userAgent;
    this.token = productToken(options.userAgent);
    this.maxBytes = options.maxBytes;
    this.transport = options.transport ?? ((url, init) => fetch(url, init));
    this.lookup = options.lookup ?? lookupOfSystem;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retries = options.retries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.limiter = new RateLimiter({ intervalMs: options.requestIntervalMs, now: () => this.now().getTime(), sleep: this.sleep });
  }

  async get(url: string): Promise<FetchedPage> {
    const start = httpUrl(url);
    if (start === undefined) throw new FetchError('network', url, 'the address is not an http or https address');
    return this.follow(url, start, true);
  }

  /**
   * Fetch `start` and follow its redirects. Before each request, the first and every hop of a redirect, the address is checked to be one that
   * the Desk may fetch (`assertPublic`); robots.txt is checked as well unless this is the fetch of a robots.txt itself.
   */
  private async follow(asked: string, start: URL, checkRobots: boolean): Promise<FetchedPage> {
    let current = start;
    for (let followed = 0; ; followed++) {
      await this.assertPublic(current);
      if (checkRobots) await this.assertAllowed(current);
      const outcome = await this.send(current);
      if (REDIRECTS.has(outcome.status)) {
        if (followed >= MAX_REDIRECTS) throw new FetchError('redirects', asked, `more than ${MAX_REDIRECTS} redirects`);
        const location = outcome.headers.get('location');
        if (location === null || location === '') {
          throw new FetchError('status', current.href, `answered ${outcome.status} with no Location`, { status: outcome.status });
        }
        const next = httpUrl(location, current.href);
        if (next === undefined) {
          throw new FetchError('redirects', asked, `redirected to ${JSON.stringify(location)}, which is not an http or https address`);
        }
        current = next;
        continue;
      }
      if (!isSuccess(outcome.status)) {
        throw new FetchError('status', current.href, `answered ${outcome.status}`, { status: outcome.status });
      }
      return {
        url: asked,
        finalUrl: current.href,
        status: outcome.status,
        contentType: outcome.contentType,
        body: outcome.body,
        retrievedAt: this.now().toISOString(),
      };
    }
  }

  /**
   * Refuse, with an `address` error, an address that the Desk never fetches (`addressProblem`: credentials, `localhost`, a host written as a number), and
   * a name that has any address that is not public (`isPublicAddress`), however many it has: a name with one public and one private address is
   * refused. A name that cannot be looked up, or has no address, is a `network` error.
   */
  private async assertPublic(url: URL): Promise<void> {
    const problem = addressProblem(url);
    if (problem !== undefined) throw new FetchError('address', url.href, problem);
    let addresses: string[];
    try {
      addresses = await this.lookup(url.hostname);
    } catch (error) {
      throw new FetchError('network', url.href, `the name ${url.hostname} could not be resolved: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (addresses.length === 0) throw new FetchError('network', url.href, `the name ${url.hostname} has no address`);
    const refused = addresses.find((address) => !isPublicAddress(address));
    if (refused !== undefined) {
      throw new FetchError('address', url.href, `${url.hostname} resolves to ${refused}, which is not a public address, so the Desk does not fetch from it`);
    }
  }

  /** One request, tried again after a pause while the site says 429 or answers with a server error, up to the retries allowed. */
  private async send(url: URL): Promise<Outcome> {
    for (let retry = 0; ; retry++) {
      await this.limiter.wait(url.host);
      const outcome = await this.attempt(url);
      if (outcome.status !== 429 && outcome.status < 500) return outcome;
      if (retry >= this.retries) {
        const after = retry === 0 ? '' : ` after ${retry} ${retry === 1 ? 'retry' : 'retries'}`;
        throw new FetchError('status', url.href, `answered ${outcome.status}${after}`, { status: outcome.status });
      }
      await this.sleep(this.pauseBefore(retry, outcome.headers.get('retry-after')));
    }
  }

  /** The pause before retry number `retry` (0 is the first): the doubling wait, or what the site asked for in seconds if that is longer, never over the cap. */
  private pauseBefore(retry: number, retryAfter: string | null): number {
    const doubling = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** retry);
    // A header value comes without the white space round it, so a number of seconds is the whole value.
    const asked = retryAfter !== null && /^\d{1,7}$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
    return Math.min(this.maxDelayMs, Math.max(doubling, asked));
  }

  /** One request, with a time limit that covers the answer and the whole page. */
  private async attempt(url: URL): Promise<Outcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.transport(url.href, {
        headers: { 'User-Agent': this.userAgent, Accept: ACCEPT },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!isSuccess(response.status)) {
        await response.body?.cancel();
        return { status: response.status, headers: response.headers, contentType: '', body: '' };
      }
      const contentType = response.headers.get('content-type') ?? '';
      const mediaType = mediaTypeOf(contentType);
      if (!readable(mediaType)) {
        await response.body?.cancel();
        throw new FetchError('type', url.href, `the page is of type ${mediaType === '' ? 'unknown' : mediaType}, and the Desk reads only html, xml and text`);
      }
      return { status: response.status, headers: response.headers, contentType, body: await this.readBody(url, response) };
    } catch (error) {
      if (error instanceof FetchError) throw error;
      if (controller.signal.aborted || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
        throw new FetchError('timeout', url.href, `no answer within ${this.timeoutMs} ms`, { cause: error });
      }
      throw new FetchError('network', url.href, `could not be fetched: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  /** The text of a page, read as UTF-8, up to the size limit: a page over it is refused as soon as that is known, and the rest is not read. */
  private async readBody(url: URL, response: Response): Promise<string> {
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > this.maxBytes) {
      await response.body?.cancel();
      throw new FetchError('too-large', url.href, `the page says it is ${declared} bytes, more than the limit of ${this.maxBytes}`);
    }
    if (response.body === null) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel();
        throw new FetchError('too-large', url.href, `the page is larger than the limit of ${this.maxBytes} bytes`);
      }
      chunks.push(value);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }

  /** Refuse, with a `robots` error, a request that its host's robots.txt does not allow, or that cannot be checked. */
  private async assertAllowed(url: URL): Promise<void> {
    const state = await this.robotsOf(url);
    if (state.kind === 'blocked') throw new FetchError('robots', url.href, state.why);
    const target = url.pathname + url.search;
    if (!robotsAllows(state.parsed, this.token, target)) {
      throw new FetchError('robots', url.href, `${url.origin}/robots.txt does not allow ${this.token} to fetch ${target}`);
    }
  }

  private robotsOf(url: URL): Promise<RobotsState> {
    let state = this.robots.get(url.origin);
    if (state === undefined) {
      state = this.loadRobots(url);
      this.robots.set(url.origin, state);
    }
    return state;
  }

  /**
   * Fetch and read a host's robots.txt. A site with none (404 or 410) allows everything. A file that is there is
   * read, and its problems are noted. Any other outcome, a server error, a refusal, a timeout, a file that is not
   * text, means the Desk cannot know what the site allows, so it fetches nothing from the host, and says why.
   */
  private async loadRobots(url: URL): Promise<RobotsState> {
    const address = `${url.origin}/robots.txt`;
    try {
      const page = await this.follow(address, new URL(address), false);
      const parsed = parseRobots(page.body);
      for (const warning of parsed.warnings) this.notes.push(`${address}: ${warning}`);
      return { kind: 'rules', parsed };
    } catch (error) {
      if (!(error instanceof FetchError)) throw error;
      if (error.kind === 'status' && (error.status === 404 || error.status === 410)) return { kind: 'rules', parsed: { groups: [], warnings: [] } };
      const why = `${address} could not be read (${error.status === undefined ? error.kind : `status ${error.status}`}), so the Desk does not fetch from ${url.host}`;
      this.notes.push(why);
      return { kind: 'blocked', why };
    }
  }
}

/** What a `FixtureFetcher` serves for an address: a file, a file with its content type and final address, or the error to throw. */
export type FixtureEntry = string | { file: string; contentType?: string; finalUrl?: string } | FetchError;

/** The content type of a fixture file, from its name. */
function typeOfFile(file: string): string {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.xml')) return 'application/xml';
  return 'text/plain';
}

/**
 * A fetcher that serves files, so that the stages can be tested, and the Desk demonstrated, with no network.
 * `map` says which file (a path under `dir`) answers which address, or which `FetchError` to throw for it,
 * and an address that is not in it fails like a site that cannot be reached. `requests` lists every address
 * that was asked for, in order.
 */
export class FixtureFetcher implements Fetcher {
  readonly requests: string[] = [];
  private readonly entries: Map<string, FixtureEntry>;

  constructor(
    private readonly dir: string,
    map: Readonly<Record<string, FixtureEntry>>,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.entries = new Map(Object.entries(map));
  }

  async get(url: string): Promise<FetchedPage> {
    this.requests.push(url);
    const entry = this.entries.get(url);
    if (entry === undefined) throw new FetchError('network', url, 'no fixture is registered for this address');
    if (entry instanceof FetchError) throw entry;
    const { file, contentType, finalUrl } = typeof entry === 'string' ? { file: entry, contentType: undefined, finalUrl: undefined } : entry;
    const body = await readFile(path.join(this.dir, file), 'utf8');
    return { url, finalUrl: finalUrl ?? url, status: 200, contentType: contentType ?? typeOfFile(file), body, retrievedAt: this.now().toISOString() };
  }
}
