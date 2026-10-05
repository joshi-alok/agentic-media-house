import { describe, expect, it } from 'vitest';
import { checkHtmlParses, checkMetadata, checkNoImages, checkOneHeading, checkSkipLink } from '../scripts/audit/checks-markup.mjs';
import { checkCrawlFiles, checkNoFixtureLeakage, checkXmlWellFormed } from '../scripts/audit/checks-files.mjs';
import { checkArticlePages, checkClaimMarkers, checkInternalLinks, checkUnconfirmedLabel } from '../scripts/audit/checks-links.mjs';
import { checkColourLaw, checkHairlines, checkNoItalics, checkNoWebFonts } from '../scripts/audit/checks-style.mjs';
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

describe('A5 checkNoItalics', () => {
  it('accepts pages and CSS without italics', () => {
    expect(checkNoItalics(site({ 'index.html': page('<p>x <strong>y</strong></p>'), '_astro/a.css': '.a{font-style:normal}' }))).toEqual(ok('A5'));
  });

  it.each([
    ['an <em> element', '<p>a <em>b</em></p>', 'index.html: has an <em> element'],
    ['an <i> element', '<p>a <i>b</i></p>', 'index.html: has an <i> element'],
    ['a <cite> element, which browsers set in italics', '<p><cite>b</cite></p>', 'index.html: has a <cite> element, which browsers set in italics'],
    ['a <dfn> element', '<p><dfn>b</dfn></p>', 'index.html: has a <dfn> element, which browsers set in italics'],
    ['a style attribute', '<p style="font-style: italic">b</p>', 'index.html (style attribute): uses font-style: italic'],
  ])('rejects %s', (_name, body, problem) => {
    expect(checkNoItalics(site({ 'index.html': page(body) })).problems).toEqual([problem]);
  });

  it('rejects italics in a CSS file, in minified form too', () => {
    expect(checkNoItalics(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{font-style:italic}' })).problems).toEqual(['_astro/a.css: uses font-style: italic']);
  });

  it('rejects italics in a style element', () => {
    const html = page('<h1>x</h1>', { head: '<style>.a{font-style:italic}</style>' });
    expect(checkNoItalics(site({ 'index.html': html })).problems).toEqual(['index.html (style element): uses font-style: italic']);
  });
});

describe('A6 checkNoWebFonts', () => {
  it('accepts pages that use system fonts only', () => {
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': 'body{font-family:-apple-system,Arial,sans-serif}' }))).toEqual(ok('A6'));
  });

  it('rejects @font-face', () => {
    const css = '@font-face{font-family:X;src:local(X)}';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css })).problems).toEqual(['_astro/a.css: declares a web font with @font-face']);
  });

  it('rejects a stylesheet from Google Fonts', () => {
    const head = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>', { head }) })).problems).toEqual(['index.html: loads from fonts.googleapis.com']);
  });

  it('rejects a font host named in CSS', () => {
    const css = '@import "https://fonts.gstatic.com/x.css";';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css })).problems).toEqual(['_astro/a.css: loads from fonts.gstatic.com']);
  });

  it('rejects a link that preloads a font', () => {
    const head = '<link rel="preload" href="/f.woff2" as="font" type="font/woff2" crossorigin>';
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>', { head }) })).problems).toContain('index.html: preloads a font');
  });

  it('rejects a font file in the build', () => {
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>') }, ['fonts/inter.woff2'])).problems).toEqual(['fonts/inter.woff2: is a font file']);
  });

  it('lists font files in order of their path', () => {
    expect(checkNoWebFonts(site({ 'index.html': page('<h1>x</h1>') }, ['fonts/b.woff2', 'fonts/a.ttf'])).problems).toEqual(['fonts/a.ttf: is a font file', 'fonts/b.woff2: is a font file']);
  });
});

describe('A7 checkHairlines', () => {
  it('accepts one-pixel borders and square corners', () => {
    const css = '*{border-radius:0}.a{border:1px solid var(--line);outline:2px solid red}';
    expect(checkHairlines(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css }))).toEqual(ok('A7'));
  });

  it('rejects a border wider than a pixel', () => {
    const css = '.a{border-top:2px solid var(--line)}';
    expect(checkHairlines(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css })).problems).toEqual([
      '_astro/a.css: has a border wider than 1px: border-top:2px solid var(--line)',
    ]);
  });

  it('rejects a rounded corner in a style element', () => {
    const html = page('<h1>x</h1>', { head: '<style>.a{border-radius:4px}</style>' });
    expect(checkHairlines(site({ 'index.html': html })).problems).toEqual(['index.html (style element): has a rounded corner: border-radius:4px']);
  });

  it('does not report italics, which are A5\'s', () => {
    expect(checkHairlines(site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': '.a{font-style:italic}' }))).toEqual(ok('A7'));
  });
});

describe('A12 checkColourLaw', () => {
  const tokens = ':root{--bg:#FFFFFF;--t1:#14181D;--link:#1B66DF}@media (prefers-color-scheme:dark){:root{--bg:#0F1216}}/* once #123456 */';
  const withCss = (css: string, others: Record<string, string> = {}) => site({ 'index.html': page('<h1>x</h1>'), '_astro/a.css': css, ...others });

  it('accepts the colours of the tokens, in any case and in short form', () => {
    expect(checkColourLaw(withCss('a{color:#14181d;background:#fff;border-color:#0F1216}.b{fill:#1B66DF}'), tokens)).toEqual(ok('A12'));
  });

  it('accepts a page with no colour at all', () => {
    expect(checkColourLaw(withCss('a{color:var(--link);margin:0}'), tokens)).toEqual(ok('A12'));
  });

  it('rejects a colour that is not a token', () => {
    expect(checkColourLaw(withCss('a{color:#ff0000}'), tokens).problems).toEqual(['_astro/a.css: #ff0000 is not a colour of the design tokens']);
  });

  it('expands short colours before it compares: #f00 is #ff0000', () => {
    expect(checkColourLaw(withCss('a{color:#f00}'), tokens).problems).toEqual(['_astro/a.css: #ff0000 is not a colour of the design tokens']);
  });

  it('does not count a colour that is only mentioned in a comment of the tokens file', () => {
    expect(checkColourLaw(withCss('a{color:#123456}'), tokens).problems).toEqual(['_astro/a.css: #123456 is not a colour of the design tokens']);
  });

  it('rejects a colour with an alpha channel, which is a different colour', () => {
    expect(checkColourLaw(withCss('a{color:#14181dcc}'), tokens).problems).toEqual(['_astro/a.css: #14181dcc is not a colour of the design tokens']);
  });

  it('reads colours of four and eight digits, which have an alpha channel and are never a token', () => {
    expect(checkColourLaw(withCss('a{color:#f00f}.b{color:#00000000}'), tokens).problems).toEqual([
      '_astro/a.css: #ff0000ff is not a colour of the design tokens',
      '_astro/a.css: #00000000 is not a colour of the design tokens',
    ]);
  });

  it('reads a function colour written in capitals', () => {
    expect(checkColourLaw(withCss('a{color:RGB(0 0 0)}'), tokens).problems).toEqual(['_astro/a.css: rgb() is not a colour of the design tokens']);
  });

  it('rejects colours written as functions', () => {
    expect(checkColourLaw(withCss('a{color:rgb(20 24 29)}.b{color:hsla(0,0%,0%,.5)}'), tokens).problems).toEqual([
      '_astro/a.css: rgb() is not a colour of the design tokens',
      '_astro/a.css: hsla() is not a colour of the design tokens',
    ]);
  });

  it('reads style elements and style attributes too', () => {
    const html = page('<p style="color:#00ff00">x</p>', { head: '<style>.a{color:#ff00ff}</style>' });
    expect(checkColourLaw(site({ 'index.html': html }), tokens).problems).toEqual([
      'index.html (style element): #ff00ff is not a colour of the design tokens',
      'index.html (style attribute): #00ff00 is not a colour of the design tokens',
    ]);
  });

  it('reads SVG files, such as the fact cards', () => {
    expect(checkColourLaw(withCss('a{margin:0}', { 'news/a/card.svg': '<svg><rect fill="#FFFFFF" stroke="#1B66DF"/></svg>' }), tokens)).toEqual(ok('A12'));
    expect(checkColourLaw(withCss('a{margin:0}', { 'news/a/card.svg': '<svg><rect fill="#ABCDEF"/></svg>' }), tokens).problems).toEqual([
      'news/a/card.svg: #abcdef is not a colour of the design tokens',
    ]);
  });

  it('does not take an id selector for a colour', () => {
    expect(checkColourLaw(withCss('#add{margin:0}#bad .x{margin:0}'), tokens)).toEqual(ok('A12'));
  });

  it('reports a colour once for each place, however often it appears there', () => {
    expect(checkColourLaw(withCss('a{color:#ff0000}b{color:#FF0000}'), tokens).problems).toHaveLength(1);
  });

  it('refuses a tokens file that defines no colour, because every colour would then be wrong', () => {
    expect(() => checkColourLaw(withCss('a{margin:0}'), '/* nothing */')).toThrow('defines no colour');
  });
});

describe('A8 checkInternalLinks', () => {
  const home = (body: string, head = '') => page(body, { head: `<link rel="canonical" href="https://news.example/">${head}` });

  it('accepts links to pages, to files and to ids that exist', () => {
    const files = {
      'index.html': home('<a href="/status/">s</a><a href="/status/#facts">f</a><a href="#main">m</a><a href="/rss.xml">r</a>', '<link rel="stylesheet" href="/_astro/a.css">'),
      'status/index.html': page('<h1 id="facts">x</h1>'),
      '_astro/a.css': 'a{margin:0}',
      'rss.xml': '<rss/>',
    };
    expect(checkInternalLinks(site(files))).toEqual(ok('A8'));
  });

  it('ignores addresses that point away from the site', () => {
    const body = '<a href="https://other.example/x">a</a><a href="mailto:me@example.org">m</a><a href="//cdn.example/x.js">c</a><a href="data:,">d</a><a href="javascript:void(0)">j</a>';
    expect(checkInternalLinks(site({ 'index.html': home(body) }))).toEqual(ok('A8'));
  });

  it('rejects a link to a page that does not exist', () => {
    expect(checkInternalLinks(site({ 'index.html': home('<a href="/missing/">m</a>') }))).toEqual({
      id: 'A8',
      ok: false,
      problems: ['index.html: <a href="/missing/"> does not match any file in the build'],
    });
  });

  it('rejects a link to a folder written without its trailing slash, and says so', () => {
    const files = { 'index.html': home('<a href="/status">s</a>'), 'status/index.html': page('<h1>x</h1>') };
    expect(checkInternalLinks(site(files)).problems).toEqual(['index.html: <a href="/status"> does not match any file in the build; the folder needs a trailing slash']);
  });

  it('rejects a link to an id that is not on the page it points at', () => {
    const files = { 'index.html': home('<a href="/status/#nope">s</a>'), 'status/index.html': page('<h1 id="facts">x</h1>') };
    expect(checkInternalLinks(site(files)).problems).toEqual(['index.html: <a href="/status/#nope"> points at #nope, which is not an id on that page']);
  });

  it('rejects a link to an id on its own page that does not exist', () => {
    expect(checkInternalLinks(site({ 'index.html': home('<a href="#nope">s</a>') })).problems).toEqual(['index.html: <a href="#nope"> points at #nope, which is not an id on that page']);
  });

  it('rejects a link with a fragment into a file that is not a page', () => {
    const files = { 'index.html': home('<a href="/rss.xml#x">r</a>'), 'rss.xml': '<rss/>' };
    expect(checkInternalLinks(site(files)).problems).toEqual(['index.html: <a href="/rss.xml#x"> points at #x in a file that is not a page']);
  });

  it('rejects a stylesheet, script or image address that does not exist', () => {
    const head = '<link rel="stylesheet" href="/_astro/gone.css"><script src="/gone.js"></script>';
    expect(checkInternalLinks(site({ 'index.html': home('<h1>x</h1>', head) })).problems).toEqual([
      'index.html: <link href="/_astro/gone.css"> does not match any file in the build',
      'index.html: <script src="/gone.js"> does not match any file in the build',
    ]);
  });

  it('follows an absolute address on the same origin, such as a canonical link or a share image', () => {
    const head = '<meta property="og:image" content="https://news.example/news/a/card.png"><meta property="og:url" content="https://news.example/gone/">';
    const result = checkInternalLinks(site({ 'index.html': home('<h1>x</h1>', head) }, ['news/a/card.png']));
    expect(result.problems).toEqual(['index.html: <meta og:url content="https://news.example/gone/"> does not match any file in the build']);
  });

  it('works for a site whose origin is http as well as https', () => {
    const html = page('<a href="/gone/">g</a><a href="/">h</a><a href="https://news.example/">https</a>', { head: '<link rel="canonical" href="http://news.example/">' });
    expect(checkInternalLinks(site({ 'index.html': html })).problems).toEqual(['index.html: <a href="/gone/"> does not match any file in the build']);
  });

  it('ignores a query string and resolves a relative address against the page', () => {
    const files = { 'index.html': home('<a href="/status/?q=1">s</a>'), 'status/index.html': page('<a href="../">up</a><a href="missing/">m</a>') };
    expect(checkInternalLinks(site(files)).problems).toEqual(['status/index.html: <a href="missing/"> does not match any file in the build']);
  });

  it('reports the same problem once for a page, however often it occurs', () => {
    expect(checkInternalLinks(site({ 'index.html': home('<a href="/m/">1</a><a href="/m/">2</a>') })).problems).toHaveLength(1);
  });
});

describe('A9 checkArticlePages', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const RECEIPTS = `news/${SLUG}/receipts/index.html`;
  const ldJson = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const canonical = (route: string) => `<link rel="canonical" href="https://news.example${route}">`;
  const goodArticle = (head = `${canonical(`/news/${SLUG}/`)}${ldJson({ '@type': 'NewsArticle', headline: 'H' })}`, body = `<h1>x</h1><a href="/news/${SLUG}/receipts/">receipts</a>`) =>
    page(body, { head });
  const good = () => ({ [ARTICLE]: goodArticle(), [RECEIPTS]: page('<h1>r</h1>', { head: canonical(`/news/${SLUG}/receipts/`) }) });

  it('accepts an article that links to its receipts, has a canonical link and has NewsArticle data', () => {
    expect(checkArticlePages(site(good()))).toEqual(ok('A9'));
  });

  it('accepts a site with no article, such as a production build with no pieces', () => {
    expect(checkArticlePages(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A9'));
  });

  it('rejects an article that does not link to its receipts page', () => {
    const files = { ...good(), [ARTICLE]: goodArticle(undefined, '<h1>x</h1>') };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: does not link to its receipts page`]);
  });

  it('rejects an article whose receipts page is missing', () => {
    const files = good();
    delete (files as Record<string, string>)[RECEIPTS];
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: its receipts page ${RECEIPTS} does not exist`]);
  });

  it('rejects an article with no canonical link', () => {
    const files = { ...good(), [ARTICLE]: goodArticle(ldJson({ '@type': 'NewsArticle' })) };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: has no canonical link`]);
  });

  it('rejects a canonical link that points at another page', () => {
    const files = { ...good(), [ARTICLE]: goodArticle(`${canonical('/news/other/')}${ldJson({ '@type': 'NewsArticle' })}`) };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: the canonical link points at /news/other/, not at /news/${SLUG}/`]);
  });

  it('rejects an article with no structured data, or data of another type', () => {
    const none = { ...good(), [ARTICLE]: goodArticle(canonical(`/news/${SLUG}/`)) };
    expect(checkArticlePages(site(none)).problems).toEqual([`${ARTICLE}: has no NewsArticle structured data`]);
    const other = { ...good(), [ARTICLE]: goodArticle(`${canonical(`/news/${SLUG}/`)}${ldJson({ '@type': 'WebPage' })}`) };
    expect(checkArticlePages(site(other)).problems).toEqual([`${ARTICLE}: has no NewsArticle structured data`]);
  });

  it('rejects structured data that is not valid JSON', () => {
    const head = `${canonical(`/news/${SLUG}/`)}<script type="application/ld+json">{not json</script>`;
    const files = { ...good(), [ARTICLE]: goodArticle(head) };
    expect(checkArticlePages(site(files)).problems).toEqual([`${ARTICLE}: its structured data is not valid JSON`, `${ARTICLE}: has no NewsArticle structured data`]);
  });

  it('rejects a receipts page with no canonical link', () => {
    const files = { ...good(), [RECEIPTS]: page('<h1>r</h1>') };
    expect(checkArticlePages(site(files)).problems).toEqual([`${RECEIPTS}: has no canonical link`]);
  });
});

describe('A11 checkClaimMarkers', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const RECEIPTS = `news/${SLUG}/receipts/index.html`;
  const marker = (n: number, slug = SLUG, claim = `c-${n}`) => `<a href="/news/${slug}/receipts/#${claim}">${n}</a>`;
  const receipts = (...ids: string[]) => page(`<h1>r</h1>${ids.map((id) => `<article class="receipt" id="${id}">x</article>`).join('')}`);
  const files = (body: string, ...ids: string[]) => ({ [ARTICLE]: page(`<h1>x</h1><div class="prose"><p>${body}</p></div>`), [RECEIPTS]: receipts(...ids) });

  it('accepts markers that point at claims on the receipts page of the same article', () => {
    expect(checkClaimMarkers(site(files(`One${marker(1)}${marker(2)}. Two${marker(1)}.`, 'c-1', 'c-2')))).toEqual(ok('A11'));
  });

  it('accepts a site with no article', () => {
    expect(checkClaimMarkers(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A11'));
  });

  it('rejects a marker whose claim is not on the receipts page', () => {
    expect(checkClaimMarkers(site(files(`One${marker(1)}${marker(9)}.`, 'c-1'))).problems).toEqual([
      `${ARTICLE}: the marker "/news/${SLUG}/receipts/#c-9" has no claim with that id on the receipts page`,
    ]);
  });

  it('rejects a marker that points at the receipts of another piece', () => {
    const both = { ...files(`One${marker(1)}${marker(2, 'other')}.`, 'c-1', 'c-2'), 'news/other/receipts/index.html': receipts('c-2') };
    expect(checkClaimMarkers(site(both)).problems).toEqual([`${ARTICLE}: the marker "/news/other/receipts/#c-2" points at another piece's receipts`]);
  });

  it('rejects a marker that does not point at a claim anchor', () => {
    expect(checkClaimMarkers(site(files(`One${marker(1)}<a href="/news/${SLUG}/receipts/#gate-heading">g</a>.`, 'c-1', 'gate-heading'))).problems).toEqual([
      `${ARTICLE}: the marker "/news/${SLUG}/receipts/#gate-heading" is not a claim anchor like #c-1`,
    ]);
  });

  it('rejects an article with no marker at all', () => {
    expect(checkClaimMarkers(site(files('No markers here.', 'c-1'))).problems).toEqual([`${ARTICLE}: has no claim markers`]);
  });

  it('does not take the plain link to the receipts page for a marker', () => {
    const body = `One${marker(1)}.</p><p><a href="/news/${SLUG}/receipts/">see the receipts</a>`;
    expect(checkClaimMarkers(site(files(body, 'c-1')))).toEqual(ok('A11'));
  });
});

describe('A16 checkUnconfirmedLabel', () => {
  const SLUG = 'a-story';
  const ARTICLE = `news/${SLUG}/index.html`;
  const RECEIPTS = `news/${SLUG}/receipts/index.html`;
  const TIER1 = '<span class="chip chip--tier1">Tier 1 source</span>';
  const TIER2 = '<span class="chip chip--tier2">Tier 2 source</span><span class="chip">Unconfirmed</span>';
  const receipts = (...chips: string[]) => page(`<h1>r</h1>${chips.map((chip, at) => `<article class="receipt" id="c-${at + 1}"><p class="receipt__chips">${chip}</p></article>`).join('')}`);
  const article = (sentence: string) => page(`<h1>x</h1><div class="prose"><p>${sentence}</p></div>`);
  const files = (sentence: string, ...chips: string[]) => ({ [ARTICLE]: article(sentence), [RECEIPTS]: receipts(...chips) });

  it('accepts an article that labels its sentences when its receipts page lists a tier-2 claim', () => {
    expect(checkUnconfirmedLabel(site(files('<strong>Unconfirmed.</strong> Mercer Wire reports that 7 investors took part.', TIER1, TIER2)))).toEqual(ok('A16'));
  });

  it('accepts the label with space or a line break around its text, as formatted HTML may have it', () => {
    expect(checkUnconfirmedLabel(site(files('<strong>\n  Unconfirmed. </strong> Mercer Wire reports it.', TIER2)))).toEqual(ok('A16'));
  });

  it('accepts an article with only tier-1 claims, with or without the label', () => {
    expect(checkUnconfirmedLabel(site(files('A plain sentence.', TIER1, TIER1)))).toEqual(ok('A16'));
    expect(checkUnconfirmedLabel(site(files('<strong>Unconfirmed.</strong> A sentence.', TIER1)))).toEqual(ok('A16'));
  });

  it('accepts a site with no article', () => {
    expect(checkUnconfirmedLabel(site({ 'index.html': page('<h1>x</h1>') }))).toEqual(ok('A16'));
  });

  it('rejects an article that cites a tier-2 claim and has no Unconfirmed. label, naming the article and the number of claims', () => {
    expect(checkUnconfirmedLabel(site(files('Mercer Wire reports that 7 investors took part.', TIER1, TIER2)))).toEqual({
      id: 'A16',
      ok: false,
      problems: [`${ARTICLE}: its receipts page lists 1 claim from a tier-2 source, but the article has no "Unconfirmed." label`],
    });
    expect(checkUnconfirmedLabel(site(files('Plain.', TIER2, TIER2))).problems).toEqual([
      `${ARTICLE}: its receipts page lists 2 claims from a tier-2 source, but the article has no "Unconfirmed." label`,
    ]);
  });

  it('does not take the word in running text for the label: it must be the bold label at the start of a sentence', () => {
    expect(checkUnconfirmedLabel(site(files('The claim is Unconfirmed. Really.', TIER2))).problems).toHaveLength(1);
    expect(checkUnconfirmedLabel(site(files('<strong>Analysis.</strong> Not that label.', TIER2))).problems).toHaveLength(1);
  });

  it('leaves a missing receipts page to A9', () => {
    expect(checkUnconfirmedLabel(site({ [ARTICLE]: article('Plain.') }))).toEqual(ok('A16'));
  });
});

describe('A13 checkNoFixtureLeakage', () => {
  it('accepts a build with no trace of the fixtures', () => {
    expect(checkNoFixtureLeakage(site({ 'index.html': page('<h1>Robotics news</h1>'), 'rss.xml': '<rss/>', '_astro/a.css': 'a{margin:0}' }, ['x/card.png']))).toEqual(ok('A13'));
  });

  it('rejects the fixture ribbon', () => {
    const html = page('<div class="ribbon">FIXTURE DATA &mdash; not real reporting</div><h1>x</h1>');
    expect(checkNoFixtureLeakage(site({ 'index.html': html })).problems).toEqual(['index.html: contains the fixture ribbon text']);
  });

  it('rejects the fictional company, in any case', () => {
    expect(checkNoFixtureLeakage(site({ 'a/index.html': page('<h1>fixture ROBOTICS ships</h1>') })).problems).toEqual(['a/index.html: contains "Fixture Robotics"']);
  });

  it('rejects the company in a feed, a stylesheet and a card as well as in a page', () => {
    const files = { 'index.html': page('<h1>x</h1>'), 'rss.xml': '<title>Fixture Robotics ships</title>', '_astro/a.css': '/* Fixture Robotics */', 'n/card.svg': '<title>Fixture Robotics</title>' };
    expect(checkNoFixtureLeakage(site(files)).problems).toEqual(['_astro/a.css: contains "Fixture Robotics"', 'n/card.svg: contains "Fixture Robotics"', 'rss.xml: contains "Fixture Robotics"']);
  });

  it('rejects a fixture slug in an address or in a file name', () => {
    const files = { 'index.html': page('<a href="/news/fixture-robotics-ships-fx-1/">x</a><h1>x</h1>') };
    expect(checkNoFixtureLeakage(site(files, ['news/fixture-robotics-ships-fx-1/card.png'])).problems).toEqual([
      'index.html: contains "fixture-robotics"',
      'news/fixture-robotics-ships-fx-1/card.png: is named after a fixture',
    ]);
  });
});

describe('A14 checkXmlWellFormed', () => {
  it('accepts a feed, a sitemap and a card that are well-formed', () => {
    const files = {
      'index.html': page('<h1>x</h1>'),
      'rss.xml': '<?xml version="1.0"?><rss version="2.0"><channel><title>A &amp; B</title></channel></rss>',
      'sitemap-0.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://a.example/</loc></url></urlset>',
      'n/card.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>x</text></svg>',
    };
    expect(checkXmlWellFormed(site(files))).toEqual(ok('A14'));
  });

  it('does not read HTML as XML', () => {
    expect(checkXmlWellFormed(site({ 'index.html': '<!doctype html><br><p>x' }))).toEqual(ok('A14'));
  });

  it('rejects a feed with a tag closed by the wrong name, with the position', () => {
    expect(checkXmlWellFormed(site({ 'rss.xml': '<rss><channel></rss>' }))).toEqual({
      id: 'A14',
      ok: false,
      problems: ["rss.xml: Expected closing tag 'channel' (opened in line 1, col 6) instead of closing tag 'rss'. (line 1, column 15)"],
    });
  });

  it('rejects a card with a bare ampersand', () => {
    expect(checkXmlWellFormed(site({ 'n/card.svg': '<svg><text>A & B</text></svg>' })).problems).toEqual(["n/card.svg: char '&' is not expected. (line 1, column 14)"]);
  });
});

describe('A15 checkCrawlFiles', () => {
  const sitemapIndex = '<sitemapindex><sitemap><loc>https://news.example/sitemap-0.xml</loc></sitemap></sitemapindex>';
  const urlset = (...paths: string[]) => `<urlset>${paths.map((path) => `<url><loc>https://news.example${path}</loc></url>`).join('')}</urlset>`;
  /** A small site with every crawl file in order; a value of null removes a file. */
  const crawl = (changes: Record<string, string | null> = {}, others: string[] = []) => {
    const files: Record<string, string | null> = {
      'index.html': page('<h1>x</h1>', { head: '<link rel="canonical" href="https://news.example/">' }),
      'status/index.html': page('<h1>s</h1>'),
      '404.html': page('<h1>n</h1>'),
      'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://news.example/sitemap-index.xml\n',
      'sitemap-index.xml': sitemapIndex,
      'sitemap-0.xml': urlset('/', '/status/'),
      'rss.xml': '<rss version="2.0"><channel><title>T</title></channel></rss>',
      ...changes,
    };
    return site(Object.fromEntries(Object.entries(files).filter((entry): entry is [string, string] => entry[1] !== null)), others);
  };

  it('accepts a build with robots.txt, a sitemap that lists every page but the 404 page, a feed and a 404 page', () => {
    expect(checkCrawlFiles(crawl())).toEqual(ok('A15'));
  });

  it.each(['robots.txt', 'sitemap-index.xml', 'rss.xml', '404.html'])('rejects a build with no %s', (file) => {
    expect(checkCrawlFiles(crawl({ [file]: null })).problems[0]).toBe(`${file}: is missing`);
  });

  it('rejects a robots.txt that does not allow every crawler', () => {
    const robots = 'User-agent: *\nDisallow: /\nSitemap: https://news.example/sitemap-index.xml\n';
    expect(checkCrawlFiles(crawl({ 'robots.txt': robots })).problems).toEqual(['robots.txt: has no "Allow: /" line']);
  });

  it('rejects a robots.txt with no Sitemap line', () => {
    expect(checkCrawlFiles(crawl({ 'robots.txt': 'User-agent: *\nAllow: /\n' })).problems).toEqual(['robots.txt: has no Sitemap line']);
  });

  it('rejects a Sitemap line that points at a file that is not in the build, or at another site', () => {
    const missing = 'User-agent: *\nAllow: /\nSitemap: https://news.example/other.xml\n';
    expect(checkCrawlFiles(crawl({ 'robots.txt': missing })).problems).toEqual(['robots.txt: the Sitemap line points at https://news.example/other.xml, which is not a file in the build']);
    const elsewhere = 'User-agent: *\nAllow: /\nSitemap: https://elsewhere.example/sitemap-index.xml\n';
    expect(checkCrawlFiles(crawl({ 'robots.txt': elsewhere })).problems).toEqual([
      'robots.txt: the Sitemap line points at https://elsewhere.example/sitemap-index.xml, which is not on https://news.example',
    ]);
  });

  it('rejects a sitemap index that lists a sitemap that is not in the build', () => {
    const index = '<sitemapindex><sitemap><loc>https://news.example/sitemap-1.xml</loc></sitemap></sitemapindex>';
    expect(checkCrawlFiles(crawl({ 'sitemap-index.xml': index })).problems).toContain('sitemap-index.xml: lists https://news.example/sitemap-1.xml, which is not a file in the build');
  });

  it('rejects a sitemap that lists a page that does not exist', () => {
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': urlset('/', '/status/', '/gone/') })).problems).toEqual(['sitemap-0.xml: lists https://news.example/gone/, which is not a page in the build']);
  });

  it('reads an address with spaces or a line break around it in <loc>', () => {
    const spaced = '<urlset><url><loc>\n  https://news.example/\n</loc></url><url><loc> https://news.example/status/ </loc></url></urlset>';
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': spaced }))).toEqual(ok('A15'));
    const gone = '<urlset><url><loc>https://news.example/</loc></url><url><loc>https://news.example/status/</loc></url><url><loc>\n https://news.example/gone/ \n</loc></url></urlset>';
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': gone })).problems).toEqual(['sitemap-0.xml: lists https://news.example/gone/, which is not a page in the build']);
  });

  it('rejects a sitemap index that lists a sitemap on another site or an address that is not one', () => {
    const elsewhere = '<sitemapindex><sitemap><loc>https://elsewhere.example/sitemap-0.xml</loc></sitemap><sitemap><loc>not an address</loc></sitemap></sitemapindex>';
    const problems = checkCrawlFiles(crawl({ 'sitemap-index.xml': elsewhere })).problems;
    expect(problems).toContain('sitemap-index.xml: lists https://elsewhere.example/sitemap-0.xml, which is not a file in the build');
    expect(problems).toContain('sitemap-index.xml: lists not an address, which is not a file in the build');
  });

  it('rejects a sitemap that lists the 404 page, or an address on another site', () => {
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': urlset('/', '/status/', '/404.html') })).problems).toEqual(['sitemap-0.xml: lists https://news.example/404.html, which is the 404 page']);
    const other = '<urlset><url><loc>https://elsewhere.example/</loc></url><url><loc>https://news.example/</loc></url><url><loc>https://news.example/status/</loc></url></urlset>';
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': other })).problems).toEqual(['sitemap-0.xml: lists https://elsewhere.example/, which is not on https://news.example']);
  });

  it('rejects a page that is missing from the sitemap, and says which', () => {
    expect(checkCrawlFiles(crawl({ 'sitemap-0.xml': urlset('/') })).problems).toEqual(['status/index.html: is not in the sitemap']);
  });

  it('does not ask for the 404 page in the sitemap', () => {
    expect(checkCrawlFiles(crawl()).problems).toEqual([]);
  });
});
