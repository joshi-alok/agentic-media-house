import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIME_TYPES, resolveRequestPath, serve } from '../scripts/serve-dist.mjs';

const ROOT = path.join(path.sep, 'srv', 'dist');

describe('resolveRequestPath', () => {
  it.each([
    ['/', ['index.html']],
    ['/status/', ['status', 'index.html']],
    ['/news/a-b/receipts/', ['news', 'a-b', 'receipts', 'index.html']],
    ['/_astro/Base.abc.css', ['_astro', 'Base.abc.css']],
    ['/rss.xml', ['rss.xml']],
    ['/a/./b/../c.txt', ['a', 'c.txt']],
    ['//double//slash.txt', ['double', 'slash.txt']],
    ['/with%20space.txt', ['with space.txt']],
  ])('maps %s to a file inside the folder', (requestPath, parts) => {
    expect(resolveRequestPath(ROOT, requestPath)).toBe(path.join(ROOT, ...parts));
  });

  it.each([
    ['/../secret.txt'],
    ['/a/../../secret.txt'],
    ['/%2e%2e/secret.txt'],
    ['/%2E%2E%2Fsecret.txt'],
    ['/a/%2e%2e/%2e%2e/secret.txt'],
    ['/..%2fsecret.txt'],
    ['/a%00b.txt'],
    ['/%E0%A4%A'],
    ['/..\\secret.txt'],
  ])('refuses %s, which would leave the folder or is not a valid path', (requestPath) => {
    expect(resolveRequestPath(ROOT, requestPath)).toBeUndefined();
  });

  it('refuses a path that starts with a backslash escape, whatever the platform', () => {
    expect(resolveRequestPath(ROOT, '/a\\..\\..\\secret.txt')).toBeUndefined();
  });

  it('stays inside a folder whose name is the start of a sibling name', () => {
    expect(resolveRequestPath(path.join(path.sep, 'srv', 'dist'), '/../dist-other/x.txt')).toBeUndefined();
  });
});

describe('MIME_TYPES', () => {
  it.each([
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.xml', 'application/xml; charset=utf-8'],
    ['.txt', 'text/plain; charset=utf-8'],
  ])('serves %s as %s', (extension, type) => {
    expect(MIME_TYPES[extension]).toBe(type);
  });
});

describe('serve', () => {
  let parent: string;
  let dist: string;
  let server: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    parent = mkdtempSync(path.join(tmpdir(), 'robywire-serve-'));
    dist = path.join(parent, 'dist');
    for (const [file, content] of Object.entries({
      'index.html': '<h1>home</h1>',
      'status/index.html': '<h1>status</h1>',
      '404.html': '<h1>missing</h1>',
      '_astro/a.css': 'a{margin:0}',
      'app.js': 'export {};',
      'data.json': '{"a":1}',
      'card.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'rss.xml': '<rss/>',
      'robots.txt': 'User-agent: *',
      'blob.bin': 'x',
    })) {
      mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
      writeFileSync(path.join(dist, file), content);
    }
    writeFileSync(path.join(dist, 'card.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(parent, 'secret.txt'), 'TOP SECRET');
    server = await serve(dist);
  });

  afterAll(async () => {
    await server.close();
    rmSync(parent, { recursive: true, force: true });
  });

  it('listens on a local address with a port of its own', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('serves a folder address as its index.html', async () => {
    for (const [route, body] of [['/', '<h1>home</h1>'], ['/status/', '<h1>status</h1>']]) {
      const response = await fetch(server.url + route);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toBe(body);
    }
  });

  it.each([
    ['/_astro/a.css', 'text/css; charset=utf-8'],
    ['/app.js', 'text/javascript; charset=utf-8'],
    ['/data.json', 'application/json; charset=utf-8'],
    ['/card.svg', 'image/svg+xml'],
    ['/card.png', 'image/png'],
    ['/rss.xml', 'application/xml; charset=utf-8'],
    ['/robots.txt', 'text/plain; charset=utf-8'],
    ['/blob.bin', 'application/octet-stream'],
  ])('serves %s as %s', async (route, type) => {
    const response = await fetch(server.url + route);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(type);
  });

  it('serves the bytes of a file exactly', async () => {
    const bytes = new Uint8Array(await (await fetch(`${server.url}/card.png`)).arrayBuffer());
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('answers 404, with the 404 page, for a file that is not there', async () => {
    const response = await fetch(`${server.url}/nothing/`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe('<h1>missing</h1>');
  });

  it('answers 404 with a plain text message when the site has no 404 page', async () => {
    const bare = path.join(parent, 'bare');
    mkdirSync(bare);
    writeFileSync(path.join(bare, 'index.html'), '<h1>bare</h1>');
    const other = await serve(bare);
    try {
      const response = await fetch(`${other.url}/nothing/`);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe('Not found');
    } finally {
      await other.close();
    }
  });

  it('ignores a query string and a fragment', async () => {
    expect(await (await fetch(`${server.url}/status/?a=1`)).text()).toBe('<h1>status</h1>');
  });

  it('redirects a folder written without its trailing slash, as a static host does', async () => {
    const response = await fetch(`${server.url}/status`, { redirect: 'manual' });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/status/');
  });

  it('answers HEAD without a body, and refuses other methods', async () => {
    const head = await fetch(`${server.url}/`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await head.text()).toBe('');
    expect((await fetch(`${server.url}/`, { method: 'POST' })).status).toBe(405);
  });

  /** A raw request, because fetch tidies `..` out of an address before it is sent. */
  function raw(requestPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const { port } = new URL(server.url);
      const req = request({ host: '127.0.0.1', port, path: requestPath, method: 'GET' }, (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it.each(['/../secret.txt', '/%2e%2e/secret.txt', '/a/../../secret.txt', '/..%2fsecret.txt'])('does not serve a file outside the folder: %s', async (requestPath) => {
    const { status, body } = await raw(requestPath);
    expect(status).toBe(404);
    expect(body).not.toContain('TOP SECRET');
  });

  it('stops listening when it is closed', async () => {
    const other = await serve(dist);
    expect((await fetch(`${other.url}/`)).status).toBe(200);
    await other.close();
    await expect(fetch(`${other.url}/`)).rejects.toThrow();
  });

  it('refuses a folder that does not exist', async () => {
    await expect(serve(path.join(parent, 'nope'))).rejects.toThrow('is not a folder');
  });
});
