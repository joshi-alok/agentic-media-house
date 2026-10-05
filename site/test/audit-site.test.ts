import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attr, elements, parseHtml, textOf } from '../scripts/audit/dom.mjs';
import { idsOf, loadSite, routeOf, siteFromFiles } from '../scripts/audit/site.mjs';

const PAGE = (body: string, head = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`;

describe('parseHtml', () => {
  it('parses a page with no problems', () => {
    expect(parseHtml(PAGE('<p>hi</p>')).errors).toEqual([]);
  });

  it('reports a missing doctype', () => {
    expect(parseHtml('<html><head><title>T</title></head><body></body></html>').errors[0]).toContain('missing-doctype');
  });

  it('reports a repeated attribute, with the position', () => {
    expect(parseHtml(PAGE('<a href="x" href="y">l</a>')).errors).toEqual(['duplicate-attribute (line 1, column 105)']);
  });

  it('reports an element that is opened and never closed', () => {
    expect(parseHtml(PAGE('<div><p>x</p>')).errors).toEqual(['unclosed-element <div> (line 1, column 89)']);
  });

  it('reports the inner element when a closing tag closes the outer one over it', () => {
    expect(parseHtml(PAGE('<div><span>x</div>')).errors).toEqual(['unclosed-element <span> (line 1, column 94)']);
  });

  it('does not report the elements that never have an end tag, or that may leave it out', () => {
    const body = '<br><img src="a" alt=""><input><ul><li>a<li>b</ul><p>one<p>two<table><tr><td>a<td>b</table><select><option>a<option>b</select>';
    expect(parseHtml(PAGE(body)).errors).toEqual([]);
  });

  it('does not report a self-closing element of an inline SVG', () => {
    expect(parseHtml(PAGE('<svg><path d="M0 0"/><g></g></svg>')).errors).toEqual([]);
  });
});

describe('the DOM helpers', () => {
  const { document } = parseHtml(PAGE('<div class="a b"><p id="x" title="t">one <b>two</b></p><p>three</p></div><template><p>hidden</p></template>'));

  it('finds elements by tag name, in document order, and not inside a template', () => {
    expect(elements(document, 'p').map((p) => textOf(p))).toEqual(['one two', 'three']);
  });

  it('reads an attribute, or undefined', () => {
    const [first] = elements(document, 'p');
    expect(attr(first, 'id')).toBe('x');
    expect(attr(first, 'title')).toBe('t');
    expect(attr(first, 'lang')).toBeUndefined();
  });

  it('joins the text of an element and its children', () => {
    expect(textOf(elements(document, 'div')[0])).toBe('one twothree');
  });

  it('leaves out comments', () => {
    const { document: other } = parseHtml(PAGE('<p>a<!-- hidden -->b</p>'));
    expect(textOf(elements(other, 'p')[0])).toBe('ab');
  });
});

describe('routeOf', () => {
  it.each([
    ['index.html', '/'],
    ['status/index.html', '/status/'],
    ['news/a-b/receipts/index.html', '/news/a-b/receipts/'],
    ['404.html', '/404.html'],
  ])('%s is the page at %s', (file, route) => {
    expect(routeOf(file)).toBe(route);
  });
});

describe('siteFromFiles', () => {
  const site = siteFromFiles(
    {
      'status/index.html': PAGE('<p id="a">x</p>', '<style>.a{color:red}</style>'),
      'index.html': PAGE('<p style="color: blue">x</p>', '<link rel="canonical" href="https://news.example/">'),
      '_astro/Base.css': '.b{margin:0}',
      'robots.txt': 'User-agent: *',
    },
    ['news/x/card.png'],
  );

  it('lists the pages sorted by file, each with its route and its parse errors', () => {
    expect(site.pages.map((page) => [page.file, page.route, page.errors])).toEqual([
      ['index.html', '/', []],
      ['status/index.html', '/status/', []],
    ]);
  });

  it('lists every file, text or not, in paths, and keeps the text of the text files', () => {
    expect([...site.paths].sort()).toEqual(['_astro/Base.css', 'index.html', 'news/x/card.png', 'robots.txt', 'status/index.html']);
    expect(site.files.get('robots.txt')).toBe('User-agent: *');
    expect(site.files.has('news/x/card.png')).toBe(false);
  });

  it('collects stylesheets from CSS files, style elements and style attributes', () => {
    expect(site.stylesheets).toEqual([
      { where: '_astro/Base.css', css: '.b{margin:0}' },
      { where: 'index.html (style attribute)', css: 'x{color: blue}' },
      { where: 'status/index.html (style element)', css: '.a{color:red}' },
    ]);
  });

  it('lists CSS files sorted by path', () => {
    const sorted = siteFromFiles({ 'index.html': PAGE(''), 'b.css': '.b{}', 'a.css': '.a{}' });
    expect(sorted.stylesheets.map((sheet) => sheet.where)).toEqual(['a.css', 'b.css']);
  });

  it('takes the origin of the site from the canonical link of a page', () => {
    expect(site.origin).toBe('https://news.example');
  });

  it('falls back to a made-up origin when no page has a canonical link', () => {
    expect(siteFromFiles({ 'index.html': PAGE('') }).origin).toBe('https://site.invalid');
  });

  it('skips a canonical link that is not a full address', () => {
    const pages = { 'index.html': PAGE('', '<link rel="canonical" href="/relative/">'), 'a/index.html': PAGE('', '<link rel="canonical" href="https://later.example/a/">') };
    expect(siteFromFiles(pages).origin).toBe('https://later.example');
    expect(siteFromFiles({ 'index.html': pages['index.html'] }).origin).toBe('https://site.invalid');
  });

  it('collects the ids of a page', () => {
    expect([...idsOf(site.pages[1])]).toEqual(['a']);
  });
});

describe('loadSite', () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it('reads a folder into the same model', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'robywire-audit-'));
    folders.push(dir);
    mkdirSync(path.join(dir, 'news', 'x'), { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), PAGE('<p>x</p>'));
    writeFileSync(path.join(dir, 'news', 'x', 'card.png'), Buffer.from([0x89, 0x50]));
    writeFileSync(path.join(dir, 'style.css'), '.a{margin:0}');
    const site = loadSite(dir);
    expect(site.pages.map((page) => page.file)).toEqual(['index.html']);
    expect([...site.paths].sort()).toEqual(['index.html', 'news/x/card.png', 'style.css']);
    expect(site.stylesheets).toEqual([{ where: 'style.css', css: '.a{margin:0}' }]);
  });

  it('says to build the site first when the folder is missing', () => {
    expect(() => loadSite(path.join(tmpdir(), 'robywire-no-such-folder'))).toThrow('Build the site first');
  });

  it('says so when the folder holds no page', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'robywire-audit-'));
    folders.push(dir);
    expect(() => loadSite(dir)).toThrow('contains no HTML page');
  });
});
