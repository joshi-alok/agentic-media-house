import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';

// A safety net under every test of the Desk. The tests run with no network and no key, and each of them gives the code that it tests a stand-in for the web
// (a transport, a fetcher of fixture files, a client that answers from a script). This file, which vitest runs before each test file (desk/vitest.config.ts),
// makes the ways onto the network throw, so that a test that forgets to give the stand-in fails at once and says what it tried to do. It is a net and not a proof:
// a test that started a child process that connects, or loaded a native module, could still get through. A test that needs a stand-in for one of these
// replaces it itself (`vi.stubGlobal('fetch', ...)`), which is put back when the test is done.

type Anything = (...args: never[]) => unknown;

const refuse =
  (what: string): Anything =>
  () => {
    throw new Error(`network is not available in tests: ${what}`);
  };

globalThis.fetch = refuse('fetch') as unknown as typeof fetch;
(net as { connect: unknown }).connect = refuse('net.connect');
(net as { createConnection: unknown }).createConnection = refuse('net.createConnection');
(http as { request: unknown }).request = refuse('http.request');
(http as { get: unknown }).get = refuse('http.get');
(https as { request: unknown }).request = refuse('https.request');
(https as { get: unknown }).get = refuse('https.get');
(dns as { lookup: unknown }).lookup = refuse('dns.lookup');
(dns.promises as { lookup: unknown }).lookup = refuse('dns.promises.lookup');

// The names that a test imports from these modules (`import { request } from 'node:http'`) are bindings that follow the module only when it is told to.
syncBuiltinESMExports();
