import { isIP } from 'node:net';

// Which addresses the Desk may connect to. The Desk fetches the address that a feed item or a redirect names, and what comes back is
// stored as evidence and shown to a model, so an address that leads to the machine itself, to the network behind it, or to the
// metadata service of a cloud (169.254.169.254, which answers with keys) must never be fetched. Two pure functions say which: whether
// an IP address is public (a whitelist for IPv6, a list of the ranges that are not for IPv4), and whether the address of a page is one
// that is refused before any name is looked up (credentials, localhost, a host written as a number).

/** The bytes of an IPv4 address in dotted decimal, or undefined. A part with a leading zero is refused: some readers take it for octal. */
function parseV4(text: string): number[] | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const bytes = parts.map((part) => (/^(?:0|[1-9]\d{0,2})$/.test(part) ? Number(part) : Number.NaN));
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : undefined;
}

/** The eight groups of an IPv6 address, or undefined. The forms are the usual ones: `::` once, an IPv4 address in the last two groups, a zone after `%`. */
function parseV6(text: string): number[] | undefined {
  let rest = text.split('%')[0] as string;
  if (rest.includes('.')) {
    const colon = rest.lastIndexOf(':');
    const v4 = parseV4(rest.slice(colon + 1));
    if (v4 === undefined) return undefined;
    const group = (high: number, low: number): string => (high * 256 + low).toString(16);
    rest = `${rest.slice(0, colon + 1)}${group(v4[0] as number, v4[1] as number)}:${group(v4[2] as number, v4[3] as number)}`;
  }
  const halves = rest.split('::');
  if (halves.length > 2) return undefined;
  const groupsOf = (part: string): string[] => (part === '' ? [] : part.split(':'));
  const head = groupsOf(halves[0] as string);
  const tail = halves.length === 2 ? groupsOf(halves[1] as string) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return undefined;
  return groups.map((group) => Number.parseInt(group, 16));
}

/** The ranges of IPv4 that are not public: this network, private, shared, loopback, link-local, protocol and documentation blocks, benchmarking, multicast and reserved. */
const NOT_PUBLIC_V4: readonly { base: number; bits: number }[] = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
].map((cidr) => {
  const [address, bits] = cidr.split('/') as [string, string];
  const [a, b, c, d] = parseV4(address) as [number, number, number, number];
  return { base: ((a * 256 + b) * 256 + c) * 256 + d, bits: Number(bits) };
});

function publicV4(bytes: readonly number[]): boolean {
  const [a, b, c, d] = bytes as [number, number, number, number];
  const value = ((a * 256 + b) * 256 + c) * 256 + d;
  return !NOT_PUBLIC_V4.some(({ base, bits }) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

/** The IPv4 address in two groups of an IPv6 address, as four bytes. */
const bytesOf = (high: number, low: number): number[] => [high >> 8, high & 255, low >> 8, low & 255];

function publicV6(groups: readonly number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  // IPv4 inside IPv6: mapped (::ffff:a.b.c.d) and behind NAT64 (64:ff9b::a.b.c.d) are as public as the IPv4 address they carry.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return publicV4(bytesOf(g6, g7));
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return publicV4(bytesOf(g6, g7));
  // 6to4 (2002::/16) carries an IPv4 address in the next 32 bits.
  if (g0 === 0x2002) return publicV4(bytesOf(g1, g2));
  // Everything else must be global unicast, 2000::/3, and not one of its blocks that are not for the internet.
  if (g0 >> 13 !== 1) return false;
  if (g0 === 0x2001 && g1 < 0x200) return false; // 2001::/23: protocol assignments, Teredo, benchmarking, ORCHID
  if (g0 === 0x2001 && g1 === 0xdb8) return false; // 2001:db8::/32: documentation
  if (g0 === 0x3fff && g1 < 0x1000) return false; // 3fff::/20: documentation
  return true;
}

/**
 * Is `ip`, written as text, an address that the whole internet can reach? IPv4 is public unless it is in one of the blocks of `NOT_PUBLIC_V4`.
 * IPv6 is public only inside the global unicast range 2000::/3 and outside its documentation, protocol and Teredo blocks; an IPv4 address carried
 * in IPv6 (mapped, behind NAT64 or in 6to4) is judged as the IPv4 address. A zone (`%eth0`) and the brackets of a URL are set aside. Text that is
 * not an address is not public: the answer fails closed.
 */
export function isPublicAddress(ip: string): boolean {
  const text = ip.trim().replace(/^\[(.*)\]$/, '$1');
  const v4 = parseV4(text);
  if (v4 !== undefined) return publicV4(v4);
  if (!text.includes(':')) return false;
  const v6 = parseV6(text);
  return v6 !== undefined && publicV6(v6);
}

/**
 * Why a page may not be fetched, judged from its address alone (before any name is looked up), or undefined when nothing is wrong with it:
 * it has a user name or a password, its host is `localhost` (or a name below `.localhost`, which every resolver sends to the machine itself), or
 * its host is written as a number (an IPv4 address in any form, which the URL has already put in dotted decimal, or an IPv6 address in brackets).
 * A public address written as a number is refused too: the Desk fetches names, which are looked up and checked, and never a bare address.
 */
export function addressProblem(url: URL): string | undefined {
  if (url.username !== '' || url.password !== '') return 'the address has a user name or a password';
  // The hostname of a URL is already in lowercase.
  const host = url.hostname.replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return 'the host is localhost';
  if (host.startsWith('[') || isIP(host) !== 0) return 'the host is an IP address and not a name';
  return undefined;
}
