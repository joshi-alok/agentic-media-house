import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import { request as namedRequest } from 'node:http';
import { lookup as namedLookup } from 'node:dns/promises';
import { describe, expect, it, vi } from 'vitest';
import config from '../vitest.config';

// The tests of the Desk run with no network and no key, and every one of them gives the code that it tests a stand-in for the web. As a safety net, the
// setup file `test/setup/no-network.ts` makes the ways onto the network throw "network is not available in tests". It is a net and not a proof: a test that
// started a child process or loaded a native module could still reach out. These tests show that the net is there.

const MESSAGE = 'network is not available in tests';

describe('the guard against the network', () => {
  it('is a setup file of vitest, which runs it before every test file', () => {
    expect(config.test?.setupFiles).toEqual(['./test/setup/no-network.ts']);
  });

  it('makes fetch throw', () => {
    expect(() => fetch('https://www.fixture-robotics.example/')).toThrow(MESSAGE);
    expect(() => globalThis.fetch('https://www.fixture-robotics.example/')).toThrow(MESSAGE);
  });

  it('makes a connection throw, as net.connect and net.createConnection', () => {
    expect(() => net.connect(80, 'www.fixture-robotics.example')).toThrow(MESSAGE);
    expect(() => net.createConnection(80, 'www.fixture-robotics.example')).toThrow(MESSAGE);
  });

  it('makes an http or https request throw, whichever way it is imported', () => {
    expect(() => http.request('http://www.fixture-robotics.example/')).toThrow(MESSAGE);
    expect(() => http.get('http://www.fixture-robotics.example/')).toThrow(MESSAGE);
    expect(() => https.request('https://www.fixture-robotics.example/')).toThrow(MESSAGE);
    expect(() => https.get('https://www.fixture-robotics.example/')).toThrow(MESSAGE);
    expect(() => namedRequest('http://www.fixture-robotics.example/')).toThrow(MESSAGE);
  });

  it('makes a lookup of a name throw, in both forms', () => {
    expect(() => dns.lookup('www.fixture-robotics.example', () => undefined)).toThrow(MESSAGE);
    expect(() => dns.promises.lookup('www.fixture-robotics.example')).toThrow(MESSAGE);
    expect(() => namedLookup('www.fixture-robotics.example')).toThrow(MESSAGE);
  });

  it('names the call that was refused, so a test that fails says what it tried to do', () => {
    expect(() => fetch('https://www.fixture-robotics.example/')).toThrow(`${MESSAGE}: fetch`);
    expect(() => http.request('http://www.fixture-robotics.example/')).toThrow(`${MESSAGE}: http.request`);
    expect(() => net.connect(80)).toThrow(`${MESSAGE}: net.connect`);
  });

  it('does not stop a test that gives the code a stand-in of its own', async () => {
    const stub = vi.fn(async () => new Response('hello'));
    vi.stubGlobal('fetch', stub);
    try {
      expect(await (await fetch('https://www.fixture-robotics.example/')).text()).toBe('hello');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(() => fetch('https://www.fixture-robotics.example/')).toThrow(MESSAGE);
  });
});
