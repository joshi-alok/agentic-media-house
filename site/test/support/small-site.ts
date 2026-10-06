// A small site that passes every check of the audit, in the form the audit
// reads it: files as text, keyed by their path inside dist/. The tests of the
// runner and of the command line change it to break one thing at a time.

const ORIGIN = 'https://agenticmediahouse.example';

/** A page that passes the checks on pages. */
function page(route: string, title: string, body: string, head = ''): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${title}</title>`,
    `<meta name="description" content="About ${title}.">`,
    `<link rel="canonical" href="${ORIGIN}${route}">`,
    '<link rel="stylesheet" href="/_astro/a.css">',
    head,
    '</head><body>',
    '<a class="skip-link" href="#main">Skip</a>',
    `<main id="main"><h1>${title}</h1>${body}</main>`,
    '</body></html>',
  ].join('');
}

export const SMALL_SITE: Readonly<Record<string, string>> = {
  'index.html': page('/', 'Home', '<p><a href="/status/">Status</a></p>'),
  'status/index.html': page('/status/', 'Status', '<p><a href="/">Home</a></p>'),
  '404.html': page('/404.html', 'Not found', '<p><a href="/">Home</a></p>'),
  '_astro/a.css': 'a{color:#14181d;border-bottom:1px solid #e4e7ea}',
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap-index.xml\n`,
  'sitemap-index.xml': `<?xml version="1.0" encoding="UTF-8"?><sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap></sitemapindex>`,
  'sitemap-0.xml': `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/status/</loc></url></urlset>`,
  'rss.xml': '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Robywire</title></channel></rss>',
};

/** The small site with `changes` applied. A value of null removes a file. */
export function smallSite(changes: Record<string, string | null> = {}): Record<string, string> {
  const files: Record<string, string> = { ...SMALL_SITE };
  for (const [file, text] of Object.entries(changes)) {
    if (text === null) delete files[file];
    else files[file] = text;
  }
  return files;
}

export { page as smallPage };
