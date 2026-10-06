import { describe, expect, it } from 'vitest';
import { addressProblem, isPublicAddress } from '../../src/fetch/address';

// The Desk fetches the address that a feed item or a redirect names, and the answer is stored as evidence and shown to a model. An
// address on the machine itself, on the network behind it, or on the network of the cloud that it runs on (169.254.169.254 answers with
// keys) must never be fetched. These are the rules that say which addresses are public, as a table of every boundary of every range.

describe('isPublicAddress: IPv4', () => {
  // [first address of a range that is not public, last address of it, the address just before it, the address just after it]
  const RANGES: [string, string, string, string, string][] = [
    ['0.0.0.0/8, this network, which holds the unspecified address', '0.0.0.0', '0.255.255.255', '', '1.0.0.0'],
    ['10.0.0.0/8, private', '10.0.0.0', '10.255.255.255', '9.255.255.255', '11.0.0.0'],
    ['100.64.0.0/10, carrier-grade NAT', '100.64.0.0', '100.127.255.255', '100.63.255.255', '100.128.0.0'],
    ['127.0.0.0/8, loopback', '127.0.0.0', '127.255.255.255', '126.255.255.255', '128.0.0.0'],
    ['169.254.0.0/16, link-local, where the cloud answers with keys', '169.254.0.0', '169.254.255.255', '169.253.255.255', '169.255.0.0'],
    ['172.16.0.0/12, private', '172.16.0.0', '172.31.255.255', '172.15.255.255', '172.32.0.0'],
    ['192.0.0.0/24, protocol assignments', '192.0.0.0', '192.0.0.255', '191.255.255.255', '192.0.1.0'],
    ['192.0.2.0/24, documentation', '192.0.2.0', '192.0.2.255', '192.0.1.255', '192.0.3.0'],
    ['192.88.99.0/24, 6to4 relays', '192.88.99.0', '192.88.99.255', '192.88.98.255', '192.88.100.0'],
    ['192.168.0.0/16, private', '192.168.0.0', '192.168.255.255', '192.167.255.255', '192.169.0.0'],
    ['198.18.0.0/15, benchmarking', '198.18.0.0', '198.19.255.255', '198.17.255.255', '198.20.0.0'],
    ['198.51.100.0/24, documentation', '198.51.100.0', '198.51.100.255', '198.51.99.255', '198.51.101.0'],
    ['203.0.113.0/24, documentation', '203.0.113.0', '203.0.113.255', '203.0.112.255', '203.0.114.0'],
    ['224.0.0.0/4, multicast, and 240.0.0.0/4, reserved, up to the broadcast address', '224.0.0.0', '255.255.255.255', '223.255.255.255', ''],
  ];

  it.each(RANGES)('is not public in %s: the first and the last address of it', (_range, first, last) => {
    expect(isPublicAddress(first), first).toBe(false);
    expect(isPublicAddress(last), last).toBe(false);
  });

  it.each(RANGES)('is public just outside %s: the address before it and the address after it', (_range, _first, _last, before, after) => {
    if (before !== '') expect(isPublicAddress(before), before).toBe(true);
    if (after !== '') expect(isPublicAddress(after), after).toBe(true);
  });

  it('is public with white space round it, and in brackets', () => {
    expect(isPublicAddress(' 1.2.3.4 ')).toBe(true);
    expect(isPublicAddress('\t1.2.3.4\n')).toBe(true);
    expect(isPublicAddress('[1.2.3.4]')).toBe(true);
    expect(isPublicAddress(' [10.0.0.1] ')).toBe(false);
  });

  it('is public for ordinary addresses of the internet', () => {
    for (const address of ['1.2.3.4', '5.6.7.8', '11.0.0.1', '99.99.99.99', '126.0.0.1', '150.1.2.3', '200.200.200.200', '223.1.1.1']) expect(isPublicAddress(address), address).toBe(true);
  });

  it.each(['', ' ', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.256', '-1.2.3.4', '1.2.3.4a', '1..3.4', '01.2.3.4', '1.2.3.04', '0x7f.0.0.1', '2130706433', '1.2.3.4/8', '1.2.3.4:80'])(
    'is not public for %j, which is no address: it fails closed',
    (text) => {
      expect(isPublicAddress(text)).toBe(false);
    },
  );
});

describe('isPublicAddress: IPv6', () => {
  it.each([
    ['the unspecified address', '::'],
    ['the loopback address', '::1'],
    ['the loopback address, written long', '0:0:0:0:0:0:0:1'],
    ['unique local, the first', 'fc00::1'],
    ['unique local, the last', 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['link-local, the first', 'fe80::1'],
    ['link-local, the last', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['link-local with a zone', 'fe80::1%eth0'],
    ['site-local, which is deprecated', 'fec0::1'],
    ['multicast, the first', 'ff00::1'],
    ['multicast, link-local scope', 'ff02::1'],
    ['documentation 2001:db8::/32, the first', '2001:db8::'],
    ['documentation 2001:db8::/32, the last', '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['documentation 3fff::/20, the first', '3fff::'],
    ['documentation 3fff::/20, the last', '3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['protocol assignments 2001::/23, which hold Teredo, the first', '2001::1'],
    ['protocol assignments 2001::/23, the last', '2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['an address below the global range', '1fff:ffff::1'],
    ['an address above the global range', '4000::1'],
    ['an address in no range that is assigned to the internet', '8000::1'],
    ['the old form of an IPv4 address in IPv6', '::7f00:1'],
    ['an IPv4 loopback address mapped into IPv6', '::ffff:127.0.0.1'],
    ['an IPv4 loopback address mapped into IPv6, in hexadecimal', '::ffff:7f00:1'],
    ['an IPv4 private address mapped into IPv6', '::ffff:10.1.2.3'],
    ['an IPv4 private address mapped into IPv6, in capitals', '::FFFF:C0A8:101'],
    ['an IPv4 link-local address mapped into IPv6', '::ffff:169.254.169.254'],
    ['an IPv4 loopback address behind NAT64', '64:ff9b::7f00:1'],
    ['an IPv4 private address behind NAT64, in the dotted form', '64:ff9b::10.0.0.1'],
    ['an IPv4 loopback address in a 6to4 address', '2002:7f00:1::1'],
    ['an IPv4 private address in a 6to4 address', '2002:c0a8:101::'],
    ['the address in brackets, as a URL has it', '[::1]'],
    ['the old form of an IPv4 address in IPv6, with a public address in it', '::1.2.3.4'],
    ['the old form of an IPv4 address in IPv6, in hexadecimal', '0:0:0:0:0:0:102:304'],
    ['an IPv4 address behind the local-use NAT64 prefix', '64:ff9b:1::102:304'],
    ['an address that has the first groups of a NAT64 address and a group that is not zero', '64:ff9b:0:1::102:304'],
  ])('is not public: %s (%s)', (_what, address) => {
    expect(isPublicAddress(address), address).toBe(false);
  });

  it.each([
    ['the first of the global range', '2000::1'],
    ['an address of the global range', '2345:6789::1'],
    ['an address just outside documentation 2001:db8::/32 (before)', '2001:db7::1'],
    ['an address just outside documentation 2001:db8::/32 (after)', '2001:db9::1'],
    ['an address just outside protocol assignments 2001::/23', '2001:200::1'],
    ['an address just outside documentation 3fff::/20', '3fff:1000::1'],
    ['the last of the global range', '3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['an IPv4 public address mapped into IPv6', '::ffff:1.2.3.4'],
    ['an IPv4 public address mapped into IPv6, in hexadecimal', '::ffff:0102:0304'],
    ['an IPv4 public address behind NAT64', '64:ff9b::0102:0304'],
    ['an IPv4 public address in a 6to4 address', '2002:0102:0304::1'],
    ['an address that is written with :: for one group only', '2345:6789:1:2:3:4:5::'],
    ['an address that is written with :: after the first group, for one group only', '2000::1:2:3:4:5:6'],
    ['an address of the global range in brackets, as a URL has it', '[2345:6789::1]'],
    ['an address of the global range with white space round it', '  2345:6789::1 '],
  ])('is public: %s (%s)', (_what, address) => {
    expect(isPublicAddress(address), address).toBe(true);
  });

  it.each(['', ':::', '1::2::3', 'g::1', '12345::1', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '::1::', '1:2:3:4:5:6:7:8::', ':1', '1:', '::ffff:1.2.3', '::ffff:1.2.3.4.5', '::ffff:256.0.0.1', '2345:6789::1/64'])(
    'is not public for %j, which is no address: it fails closed',
    (text) => {
      expect(isPublicAddress(text)).toBe(false);
    },
  );
});

describe('addressProblem', () => {
  const problem = (address: string): string | undefined => addressProblem(new URL(address));

  it('finds nothing wrong with the address of a host that has a name', () => {
    expect(problem('https://www.fixture-robotics.example/news/fx-1')).toBeUndefined();
    expect(problem('http://fixture-robotics.example:8080/x?y=1#z')).toBeUndefined();
    expect(problem('https://localhost-news.example/x')).toBeUndefined();
    expect(problem('https://a.localhost.example/x')).toBeUndefined();
  });

  it.each(['http://localhost/x', 'http://LOCALHOST:3000/x', 'http://localhost./x', 'http://app.localhost/x', 'http://a.b.localhost./x'])('refuses %s: the host is localhost', (address) => {
    expect(problem(address)).toBe('the host is localhost');
  });

  it.each([
    'http://127.0.0.1/x',
    'http://8.8.8.8/x',
    'http://1.2.3.4:8080/x',
    'http://[::1]/x',
    'http://[2345:6789::1]/x',
    'http://[::ffff:127.0.0.1]/x',
    'http://2130706433/x',
    'http://0x7f.1/x',
    'http://0177.0.0.1/x',
    'http://127.1/x',
  ])('refuses %s: the host is an IP address and not a name', (address) => {
    expect(problem(address)).toBe('the host is an IP address and not a name');
  });

  it.each(['https://user:secret@www.fixture-robotics.example/x', 'https://user@www.fixture-robotics.example/x', 'https://:secret@www.fixture-robotics.example/x'])(
    'refuses %s: it has a user name or a password',
    (address) => {
      expect(problem(address)).toBe('the address has a user name or a password');
    },
  );
});
