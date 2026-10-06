// The same page has many spellings: a tracking parameter, a fragment, a capital in the host name. The
// Desk compares addresses to find a story it has already seen, so every address it keeps is first
// written in one canonical form.

/**
 * The canonical form of an address, or `null` if it is not the address of a web page. Relative addresses are
 * resolved against `base`. The canonical form is an http or https address with the host in lowercase, no fragment,
 * no user name or password, no default port, and none of the tracking parameters whose names start with `utm_`
 * (the others are left alone: they may say which page it is). An address with no tracking parameter keeps its
 * query exactly as it was written.
 */
export function canonicalUrl(address: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(address, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.username = '';
  url.password = '';
  const tracking = [...url.searchParams.keys()].filter((key) => key.toLowerCase().startsWith('utm_'));
  // Deleting a parameter writes the whole query again, so it is only done when there is something to delete.
  for (const key of tracking) url.searchParams.delete(key);
  return url.href;
}
