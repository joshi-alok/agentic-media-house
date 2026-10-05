import { BEATS } from '@robywire/gate';
import { beatLabel } from './format';

// What the header and footer link to. The wordmark is the link home, so the
// header lists the seven beats and Method. What the footer says is in copy.ts.

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

/** True when `pathname` is the page `href` or a page below it. The home page matches only itself. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}
