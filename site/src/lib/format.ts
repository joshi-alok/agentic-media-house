import { PUBLICATION_NAME } from '@robywire/gate';
import type { Category } from '@robywire/gate';

// Small text helpers for the pages. Dates are written from their digits, never
// through the machine's time zone, so a build gives the same page anywhere.

// Written as a code so that this file stays plain ASCII.
const EM_DASH = String.fromCharCode(0x2014);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "2026-10-04" as "4 Oct 2026". Throws unless the text is a real calendar date. */
export function formatDate(isoDate: string): string {
  const match = DATE.exec(isoDate);
  if (match !== null) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    // A date that rolls over (30 February) or an old year that Date reads as
    // 19xx does not write back as the same text.
    if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === isoDate) {
      return `${day} ${MONTHS[month - 1]} ${year}`;
    }
  }
  throw new Error(`formatDate: ${JSON.stringify(isoDate)} is not a date in the form YYYY-MM-DD`);
}

/** "2026-10-04T04:41:12Z" as "4 Oct 2026, 04:41 UTC". Any offset is converted to UTC. */
export function formatDateTime(isoDateTime: string): string {
  const moment = new Date(isoDateTime);
  if (!DATE_TIME.test(isoDateTime) || Number.isNaN(moment.getTime())) {
    throw new Error(`formatDateTime: ${JSON.stringify(isoDateTime)} is not a date and time`);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${moment.getUTCDate()} ${MONTHS[moment.getUTCMonth()]} ${moment.getUTCFullYear()}, ${pad(moment.getUTCHours())}:${pad(moment.getUTCMinutes())} UTC`;
}

const LABELS: Record<Category, string> = {
  'payments-commerce': 'Payments & commerce',
  'identity-trust': 'Identity & trust',
  'wallets-keys': 'Wallets & keys',
  'protocols-standards': 'Protocols & standards',
  'agent-infrastructure': 'Agent infrastructure',
  'security-incidents': 'Security & incidents',
  'policy-regulation': 'Policy & regulation',
  funding: 'Funding',
};

/** The name shown for a beat or tag slug. Throws for a slug outside the vocabulary. */
export function beatLabel(slug: string): string {
  if (!Object.hasOwn(LABELS, slug)) throw new Error(`beatLabel: ${JSON.stringify(slug)} is not a beat or a tag`);
  return LABELS[slug as Category];
}

const BLURBS: Record<Category, string> = {
  'payments-commerce': 'Agents that pay and get paid: stablecoin rails, micropayments, checkout and agent-to-agent commerce.',
  'identity-trust': 'Who an agent is and why to trust it: credentials, attestations, reputation and verification.',
  'wallets-keys': 'How agents hold and use keys: smart accounts, session keys, custody and signing.',
  'protocols-standards': 'The specifications agents use to talk, pay and prove: proposals, standards and open protocols.',
  'agent-infrastructure': 'The software under agents on chain: runtimes, oracles, data, indexing and tooling.',
  'security-incidents': 'Exploits, failures and audits that involve agents, and how they were found and fixed.',
  'policy-regulation': 'Law, regulators and guidance that touch agents and the money they handle.',
  funding: 'Rounds, acquisitions, public listings and shutdowns, filed under the beat they concern.',
};

/** One sentence on what a beat or tag covers. Throws for a slug outside the vocabulary. */
export function beatBlurb(slug: string): string {
  if (!Object.hasOwn(BLURBS, slug)) throw new Error(`beatBlurb: ${JSON.stringify(slug)} is not a beat or a tag`);
  return BLURBS[slug as Category];
}

/** A count with the right word: "1 claim", "28 claims". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The text of the <title> element: the page name, then the name of the publication, unless the page name already has it. */
export function documentTitle(page: string): string {
  return page.includes(PUBLICATION_NAME) ? page : `${page} ${EM_DASH} ${PUBLICATION_NAME}`;
}

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** A count in words, as the page writes a small number ("four"); above twenty, in digits. A count that is not a whole number of at least 0 is a mistake of the caller. */
export function countInWords(count: number): string {
  if (!Number.isInteger(count) || count < 0) throw new Error(`${String(count)} is not a count: a whole number of at least 0`);
  return COUNT_WORDS[count] ?? String(count);
}

/** How many times, in words: "once", "twice", then "three times" and so on. */
export function timesInWords(count: number): string {
  return count === 1 ? 'once' : count === 2 ? 'twice' : `${countInWords(count)} times`;
}
