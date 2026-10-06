import { describe, expect, it } from 'vitest';
import { canonicalUrl } from '../../src/fetch/url';

// The same page has many spellings: with a tracking parameter, with a fragment, with a capital in the
// host. The Desk compares addresses to find a story it has already seen, so it first writes every address
// in one canonical form.

describe('canonicalUrl', () => {
  const CASES: [string, string, string | null][] = [
    // [what the case shows, the address, the canonical address or null]
    ['an address that is already canonical stays as it is', 'https://news.example/a/b?x=1', 'https://news.example/a/b?x=1'],
    ['the host is written in lowercase', 'https://News.Example/a', 'https://news.example/a'],
    ['an address with no path gets the slash of the root', 'https://news.example', 'https://news.example/'],
    ['the fragment is removed', 'https://news.example/a#section-2', 'https://news.example/a'],
    ['the default port is removed', 'https://news.example:443/a', 'https://news.example/a'],
    ['another port stays', 'https://news.example:8443/a', 'https://news.example:8443/a'],
    ['a user name and password are removed', 'https://user:secret@news.example/a', 'https://news.example/a'],
    ['a tracking parameter is removed', 'https://news.example/a?utm_source=feed', 'https://news.example/a'],
    ['every parameter that starts with utm_ is removed, in any case', 'https://news.example/a?UTM_Medium=x&utm_campaign=y&id=7', 'https://news.example/a?id=7'],
    ['other parameters stay, in their order', 'https://news.example/a?b=2&a=1', 'https://news.example/a?b=2&a=1'],
    ['a parameter whose name only contains utm_ stays', 'https://news.example/a?my_utm_source=1', 'https://news.example/a?my_utm_source=1'],
    ['the query is left alone when it has no tracking parameter', 'https://news.example/a?q=a%20b', 'https://news.example/a?q=a%20b'],
    ['white space around the address is removed', '  https://news.example/a \n', 'https://news.example/a'],
    ['http is allowed', 'http://news.example/a', 'http://news.example/a'],
    ['ftp is not an address of a page', 'ftp://news.example/a', null],
    ['mailto is not an address of a page', 'mailto:press@news.example', null],
    ['javascript is not an address of a page', 'javascript:void(0)', null],
    ['tel is not an address of a page', 'tel:+15550100', null],
    ['text that is not an address', 'not a url', null],
    ['an empty string', '', null],
  ];

  it.each(CASES)('%s', (_name, address, expected) => {
    expect(canonicalUrl(address)).toBe(expected);
  });

  it('resolves a relative address against a base', () => {
    expect(canonicalUrl('/news/a?utm_source=x#top', 'https://news.example/home/')).toBe('https://news.example/news/a');
    expect(canonicalUrl('b', 'https://news.example/news/a')).toBe('https://news.example/news/b');
    expect(canonicalUrl('//other.example/x', 'https://news.example/')).toBe('https://other.example/x');
  });

  it('refuses a relative address when there is no base', () => {
    expect(canonicalUrl('/news/a')).toBeNull();
  });

  it('refuses a relative address against a base that is not an address', () => {
    expect(canonicalUrl('/news/a', 'not a url')).toBeNull();
  });

  it('makes an address that points at the page itself the address of the page', () => {
    expect(canonicalUrl('#comments', 'https://news.example/a?utm_source=x')).toBe('https://news.example/a');
    expect(canonicalUrl('', 'https://news.example/a')).toBe('https://news.example/a');
  });

  it('gives the same address for the spellings of one page', () => {
    const spellings = ['https://News.example/a?utm_source=x#top', 'https://news.example:443/a', 'HTTPS://NEWS.EXAMPLE/a?utm_medium=y'];
    expect(new Set(spellings.map((address) => canonicalUrl(address))).size).toBe(1);
  });
});
