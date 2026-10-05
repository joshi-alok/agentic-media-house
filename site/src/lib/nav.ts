import { BEATS } from '@robywire/gate';
import { beatLabel } from './format';

// What the header and footer link to, and what the footer says. The wordmark
// is the link home, so the header lists the seven beats and Method.

export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  ...BEATS.map((beat) => ({ label: beatLabel(beat), href: `/topics/${beat}/` })),
  { label: 'Method', href: '/method/' },
];

export const FOOTER_LINKS: readonly NavItem[] = [
  { label: 'Method', href: '/method/' },
  { label: 'Status', href: '/status/' },
  { label: 'Holds', href: '/holds/' },
  { label: 'Corrections', href: '/corrections/' },
  { label: 'RSS', href: '/rss.xml' },
];

/**
 * The disclosure shown on every page. It says only what is true of the
 * design: it does not mention a second model or a human, because the page for
 * the method describes those, as plans, where they belong.
 */
export const DISCLOSURE =
  'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

/** True when `pathname` is the page `href` or a page below it. The home page matches only itself. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}
