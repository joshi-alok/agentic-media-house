// robots.txt: every crawler may read every page, and the sitemap is named. A
// Sitemap line must be a full address, so the file is written from the site
// address of the build and cannot point at the wrong domain.

/** The text of robots.txt for the site at `site`. */
export function robotsTxt(site: URL | string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`;
}
