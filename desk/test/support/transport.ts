import type { Transport, TransportRequest } from '../../src/fetch/http';

// A stand-in for the network. It answers each address from a script and records what it was asked,
// so a test can check what the fetcher sent and in what order, and nothing ever leaves the machine.

/**
 * One answer. The body is text, bytes or a stream. The content type is html unless `type` says another; `type: null`
 * leaves it out, but a text body is then given text/plain by `Response` itself, so use bytes for an answer with no type.
 */
export interface Reply {
  status?: number;
  type?: string | null;
  headers?: Record<string, string>;
  body?: string | Uint8Array | ReadableStream<Uint8Array>;
}

/**
 * What an address answers: a reply, an error to throw (a refused connection, say), a function that decides,
 * or a list of replies for the first call, the second call and so on (the last one answers every call after).
 */
export type Route = Reply | Error | ((request: TransportRequest) => Promise<Response>) | (Reply | Error)[];

/** One request as the transport saw it. */
export interface Sent {
  url: string;
  headers: Record<string, string>;
  redirect: string;
}

/** The answer for an address that nobody scripted: the connection is refused. */
export class Refused extends Error {
  constructor(url: string) {
    super(`connect ECONNREFUSED ${url}`);
  }
}

function responseOf(reply: Reply): Response {
  const headers: Record<string, string> = { ...reply.headers };
  if (reply.type !== null) headers['content-type'] = reply.type ?? 'text/html; charset=utf-8';
  return new Response(reply.body ?? '', { status: reply.status ?? 200, headers });
}

export function scriptedTransport(routes: Record<string, Route>): { transport: Transport; sent: Sent[] } {
  const sent: Sent[] = [];
  const calls = new Map<string, number>();
  const transport: Transport = async (url, init) => {
    sent.push({ url, headers: { ...init.headers }, redirect: init.redirect });
    const route = routes[url];
    if (route === undefined) throw new Refused(url);
    if (typeof route === 'function') return route(init);
    const call = calls.get(url) ?? 0;
    calls.set(url, call + 1);
    const step = Array.isArray(route) ? (route[Math.min(call, route.length - 1)] as Reply | Error) : route;
    if (step instanceof Error) throw step;
    return responseOf(step);
  };
  return { transport, sent };
}
