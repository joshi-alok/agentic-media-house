import { SHARED_HOSTS } from './constants';

/** The host and the path of an http or https address, or null for anything else. The host is in lowercase, without a port, a final dot or one leading `www.`. */
export function addressParts(address: string): { host: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return { host: url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, ''), path: url.pathname };
}

/** Is this host (as `addressParts` gives it) one where many people publish (`SHARED_HOSTS`)? A subdomain is another host: only those in the list count. */
export function isSharedHost(host: string): boolean {
  return (SHARED_HOSTS as readonly string[]).includes(host);
}

/** Is this the address of a host where many people publish (`SHARED_HOSTS`) with no path, which would make the whole host one source? A path of slashes alone is no path. */
export function isBareSharedHost(address: string): boolean {
  const parts = addressParts(address);
  return parts !== null && isSharedHost(parts.host) && parts.path.replace(/\/+$/, '') === '';
}
