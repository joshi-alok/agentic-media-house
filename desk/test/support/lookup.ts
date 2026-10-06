import type { Lookup } from '../../src/fetch/http';

// What the tests of the fetcher give it for the names of the made-up world, so that no test asks a name server. Every host of the world is on
// an `.example` address and resolves, in a test, to an address that anyone on the internet could reach: 1.2.3.4 is a public address, and no
// connection is ever made to it, because the transport of a test answers from a script.

/** An address that is public, for a test that needs one. */
export const PUBLIC_ADDRESS = '1.2.3.4';

/** A lookup that says that every name is a public address. */
export const publicLookup: Lookup = async () => [PUBLIC_ADDRESS];

/** A lookup that answers from a table of names, and fails like a name that does not exist for any other name; it records the names asked for. */
export function tableLookup(table: Record<string, string[]>): { lookup: Lookup; asked: string[] } {
  const asked: string[] = [];
  const lookup: Lookup = async (host) => {
    asked.push(host);
    const found = table[host];
    if (found === undefined) throw new Error(`getaddrinfo ENOTFOUND ${host}`);
    return found;
  };
  return { lookup, asked };
}
