import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// A small static server for the built site, used by the Lighthouse run. It
// serves a folder the way a static host does: a folder address is its
// index.html, a missing file is a 404 with the site's own 404 page, and nothing
// outside the folder is ever served.

export const MIME_TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
});

/**
 * The file inside `root` that the path of a request names, or undefined if the path is not valid or would leave `root`.
 * The path is the raw one from the request line, without its query string: it is decoded here, once. A path that ends
 * in a slash names the index.html of that folder. A ".." that would climb above the root is refused, not clamped.
 *
 * @param {string} root
 * @param {string} requestPath
 * @returns {string | undefined}
 */
export function resolveRequestPath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return undefined;

  /** @type {string[]} */
  const segments = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  if (decoded.endsWith('/') || segments.length === 0) segments.push('index.html');
  return path.join(root, ...segments);
}

/**
 * @param {string} root
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
async function handle(root, request, response) {
  const head = request.method === 'HEAD';
  if (request.method !== 'GET' && !head) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': MIME_TYPES['.txt'] });
    response.end(head ? undefined : 'Method not allowed');
    return;
  }

  const target = request.url ?? '/';
  const requestPath = target.split(/[?#]/, 1)[0];
  const file = resolveRequestPath(root, requestPath);
  const info = file === undefined ? undefined : await stat(file).catch(() => undefined);

  if (file !== undefined && info?.isDirectory()) {
    response.writeHead(308, { Location: `${requestPath}/${target.slice(requestPath.length)}` });
    response.end();
    return;
  }
  if (file === undefined || info === undefined || !info.isFile()) {
    const page = await readFile(path.join(root, '404.html')).catch(() => undefined);
    response.writeHead(404, { 'Content-Type': page === undefined ? MIME_TYPES['.txt'] : MIME_TYPES['.html'] });
    response.end(head ? undefined : (page ?? 'Not found'));
    return;
  }

  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size });
  response.end(head ? undefined : await readFile(file));
}

/**
 * Serve the folder `dir` on a free port of the local address.
 *
 * @param {string} dir
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serve(dir) {
  const root = path.resolve(dir);
  const info = await stat(root).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) throw new Error(`${root} is not a folder`);

  const server = createServer((request, response) => {
    handle(root, request, response).catch(() => {
      response.writeHead(500, { 'Content-Type': MIME_TYPES['.txt'] });
      response.end('Server error');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve(undefined) : reject(error)));
        server.closeAllConnections();
      }),
  };
}
