import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { siteFromFiles } from '../scripts/audit/site.mjs';

// Every check of the audit is tested twice: with a snippet it must accept and
// with a snippet it must reject, and the rejection must say which file and
// what is wrong. The snippets are small pages built here.

interface PageOptions {
  title?: string;
  lang?: string | null;
  description?: string | null;
  head?: string;
  skip?: boolean;
}

/** A page that passes every check, with the changes in `options`. */
function page(body: string, options: PageOptions = {}): string {
  const { title = 'A page', lang = 'en', description = 'About the page.', head = '', skip = true } = options;
  return [
    '<!doctype html>',
    `<html${lang === null ? '' : ` lang="${lang}"`}>`,
    '<head><meta charset="utf-8">',
    `<title>${title}</title>`,
    description === null ? '' : `<meta name="description" content="${description}">`,
    head,
    '</head>',
    `<body>${skip ? '<a class="skip-link" href="#main">Skip</a>' : ''}<main id="main">${body}</main></body></html>`,
  ].join('');
}

const site = (files: Record<string, string>, others: string[] = []) => siteFromFiles(files, others);
const ok = (id: string) => ({ id, ok: true, problems: [] });

describe('A1 checkHtmlParses', () => {
  it('accepts pages that parse with no problems', () => {
    expect(checkHtmlParses(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A1'));
  });

  it('rejects a page with a repeated attribute, naming the file and the position', () => {
    const result = checkHtmlParses(site({ 'index.html': page('<h1>x</h1>'), 'a/index.html': page('<a href="x" href="y">l</a>') }));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([expect.stringMatching(/^a\/index\.html: duplicate-attribute \(line 1, column \d+\)$/)]);
  });

  it('rejects an element that is never closed', () => {
    const result = checkHtmlParses(site({ 'index.html': page('<div><h1>x</h1>') }));
    expect(result.problems).toEqual([expect.stringMatching(/^index\.html: unclosed-element <div> /)]);
  });

  it('rejects a page with no doctype', () => {
    const result = checkHtmlParses(site({ 'index.html': '<html lang="en"><head><title>T</title></head><body></body></html>' }));
    expect(result.problems[0]).toContain('missing-doctype');
  });
});

describe('A2 checkOneHeading', () => {
  it('accepts a page with exactly one h1', () => {
    expect(checkOneHeading(site({ 'index.html': page('<h1>x</h1><h2>y</h2>') }))).toEqual(ok('A2'));
  });

  it('rejects a page with no h1', () => {
    expect(checkOneHeading(site({ 'index.html': page('<h2>y</h2>') }))).toEqual({
      id: 'A2',
      ok: false,
      problems: ['index.html: has 0 <h1> elements; a page needs exactly 1'],
    });
  });

  it('rejects a page with two', () => {
    expect(checkOneHeading(site({ 'a/index.html': page('<h1>x</h1><h1>y</h1>') })).problems).toEqual(['a/index.html: has 2 <h1> elements; a page needs exactly 1']);
  });
});

describe('A3 checkMetadata', () => {
  it('accepts a page with a language, a title and a description', () => {
    expect(checkMetadata(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A3'));
  });

  it.each([
    ['no lang', { lang: null }, 'index.html: <html> has no lang attribute'],
    ['an empty lang', { lang: '' }, 'index.html: <html> has no lang attribute'],
    ['a blank lang', { lang: '  ' }, 'index.html: <html> has no lang attribute'],
    ['an empty title', { title: '  ' }, 'index.html: the <title> is empty'],
    ['no description', { description: null }, 'index.html: has no meta description'],
    ['an empty description', { description: '' }, 'index.html: has no meta description'],
    ['a blank description', { description: '   ' }, 'index.html: has no meta description'],
  ])('rejects a page with %s', (_name, options, problem) => {
    expect(checkMetadata(site({ 'index.html': page('<h1>x</h1>', options) })).problems).toEqual([problem]);
  });

  it('rejects a page with no title element at all', () => {
    const html = '<!doctype html><html lang="en"><head><meta name="description" content="d"></head><body></body></html>';
    expect(checkMetadata(site({ 'index.html': html })).problems).toEqual(['index.html: the <title> is empty']);
  });

  it('does not ask the 404 page for a description, but does ask it for a language and a title', () => {
    expect(checkMetadata(site({ '404.html': page('<h1>x</h1>', { description: null }) }))).toEqual(ok('A3'));
    expect(checkMetadata(site({ '404.html': page('<h1>x</h1>', { description: null, lang: null, title: '' }) })).problems).toEqual([
      '404.html: <html> has no lang attribute',
      '404.html: the <title> is empty',
    ]);
  });
});

describe('A4 checkNoImages', () => {
  it('accepts pages with inline SVG and no image element', () => {
    expect(checkNoImages(site({ 'index.html': page('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>') }))).toEqual(ok('A4'));
  });

  it('rejects an <img> element, and says which file it is in', () => {
    expect(checkNoImages(site({ 'a/index.html': page('<p><img src="/x.png" alt=""></p>') }))).toEqual({
      id: 'A4',
      ok: false,
      problems: ['a/index.html: has an <img> element'],
    });
  });

  it('rejects a CSS rule that loads a file with url()', () => {
    const result = checkNoImages(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{background-image:url(/x.png)}' }));
    expect(result.problems).toEqual(['_astro/a.css: loads a file with url()']);
  });

  it('accepts CSS that has no url()', () => {
    expect(checkNoImages(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{background:var(--paper)}' }))).toEqual(ok('A4'));
  });
});

describe('A10 checkSkipLink', () => {
  it('accepts a page whose first link is the skip link to #main', () => {
    expect(checkSkipLink(site({ 'index.html': page('<h1>x</h1><a href="/">home</a>') }))).toEqual(ok('A10'));
  });

  it('rejects a page with no skip link', () => {
    expect(checkSkipLink(site({ 'index.html': page('<h1>x</h1><a href="/">home</a>', { skip: false }) })).problems).toEqual([
      'index.html: the first link in <body> is "/", not the skip link to #main',
    ]);
  });

  it('rejects a page where another link comes first', () => {
    const html = page('<h1>x</h1>', { skip: false }).replace('<body>', '<body><a href="/">home</a><a class="skip-link" href="#main">Skip</a>');
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: the first link in <body> is "/", not the skip link to #main']);
  });

  it('rejects a skip link that does not point at #main', () => {
    const html = page('<h1>x</h1>', { skip: false }).replace('<body>', '<body><a class="skip-link" href="#content">Skip</a>');
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: the first link in <body> is "#content", not the skip link to #main']);
  });

  it('rejects a link to #main that is not marked as the skip link', () => {
    const html = page('<h1>x</h1>', { skip: false }).replace('<body>', '<body><a href="#main">Skip</a>');
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: the first link in <body> is "#main", not the skip link to #main']);
  });

  it('rejects a page with no link at all', () => {
    const html = '<!doctype html><html lang="en"><head><title>T</title></head><body><p>x</p></body></html>';
    expect(checkSkipLink(site({ 'index.html': html })).problems).toEqual(['index.html: has no links, so no skip link']);
  });
});
