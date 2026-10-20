import { BASES, SAFE_BASES } from './constants';
import type { Basis, Status } from './constants';
import type { Claim, LimitationSentence } from './schemas';

// The "What we couldn't verify" sentences are never freely composed. Each says, in words, how far to trust a group of claims, and the gate checks it by
// rendering the same sentence and comparing. A sentence does not repeat what the piece says: it has no figure and no label of a claim, because the page
// writes a numbered marker after it for each claim it cites, and the marker leads to the passage. A group is the claims that share a basis (for a 'basis'
// sentence) or a status (for a 'status' sentence), in ascending order of claim number, and it has no limit on its size. The note of the basis `reported`
// also names the outlet (`{outlet}`), the outlet of the claims themselves, so a group of reported claims is never larger than the claims of one outlet.

/** What a claim's `basis` tells the reader about where it came from. */
export const BASIS_NOTES: Readonly<Record<Basis, string>> = {
  docs: "What is cited here comes from the project's own documentation; no independent testing was available.",
  announcement: "What is cited here comes from the project's own announcement; no independent confirmation was available.",
  briefing: 'What is cited here was given by the project in a briefing; no independent confirmation was available.',
  demo: 'What is cited here was shown in a demonstration or a test; the source does not describe independent testing.',
  paper: "What is cited here is reported in the authors' paper; it has not been independently reproduced.",
  filing: 'What is cited here comes from a regulatory filing.',
  standard: 'What is cited here comes from the published standard.',
  measured: 'What is cited here was measured by the source and is reported as stated.',
  reported: 'What is cited here is reported by {outlet}; it was not checked against a primary source.',
};

/** What a claim's `status` tells the reader about how far the capability has got. */
export const STATUS_NOTES: Readonly<Record<Status, string>> = {
  demonstrated: 'What is cited here was demonstrated; the source does not report it live in production.',
  deployed: 'The company states that what is cited here is deployed; no independent confirmation was available.',
  planned: 'What is cited here is planned, not delivered.',
  unspecified: 'The source does not say whether what is cited here has been demonstrated or deployed.',
};

/** The statuses that need a sentence of their own: the capability has been shown or promised, not delivered. */
const STATUSES_WITH_SENTENCE: readonly Status[] = ['demonstrated', 'planned'];

/** Does this claim need a 'basis' sentence? Yes unless it comes from a filing, a standard, a paper or a measurement. */
export const needsBasisLimitation = (claim: Claim): boolean => !(SAFE_BASES as readonly string[]).includes(claim.basis);

/** Does this claim need a 'status' sentence? Yes when the capability was only demonstrated or is only planned. */
export const needsStatusLimitation = (claim: Claim): boolean => STATUSES_WITH_SENTENCE.includes(claim.status);

/** The outlet a claim's source names, without the spaces around it; empty when the source names none. */
export const outletOf = (claim: Claim): string => claim.source.outlet?.trim() ?? '';

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
  const match = /^c-(\d+)$/.exec(id);
  return match === null ? NaN : Number(match[1]);
}

/** "A", "A and B", "A, B and C". */
export function joinList(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Render the limitation sentence for a group of claims through the `basis` or the `status` note. The note is chosen by the first claim's basis (or
 * status), and the outlet of a `reported` sentence is the first claim's outlet; the gate checks that the claims of a group share them. The sentence is
 * the same for one claim and for many.
 */
export function renderLimitation(claims: readonly Claim[], template: 'basis' | 'status'): string {
  const first = claims[0];
  if (first === undefined) throw new Error('renderLimitation: a limitation sentence needs at least one claim');
  const text = template === 'basis' ? BASIS_NOTES[first.basis] : STATUS_NOTES[first.status];
  // One pass with a function, so a "$" in an outlet is never read as a replacement pattern.
  return text.replace(/\{outlet\}/g, () => outletOf(first));
}

/** A set of claims that one limitation sentence covers: they share the basis (or the status) `key`. */
export interface LimitationGroup {
  template: 'basis' | 'status';
  key: Basis | Status;
  /** Ascending by claim number, each claim once. */
  claims: Claim[];
}

/**
 * The groups of claims that need a limitation sentence. `citedClaims` are the claims the body of a piece cites. Those whose basis is not safe are grouped by
 * basis, in the order of BASES; the claims that were `reported` are grouped by outlet as well, so that a sentence names one outlet, the outlet of the lowest
 * claim number first. Those that are demonstrated or planned are grouped by status, in that order, after the basis groups. A claim that needs both is in a
 * group of each kind. Inside a group the claims are ordered by claim number. A group is never cut.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
  const unique = [...new Map(citedClaims.map((claim) => [claim.id, claim])).values()].sort((a, b) => claimNumber(a.id) - claimNumber(b.id));
  const groups: LimitationGroup[] = [];
  const add = (template: LimitationGroup['template'], key: LimitationGroup['key'], claims: Claim[]) => {
    if (claims.length > 0) groups.push({ template, key, claims });
  };
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
    // One sentence names one outlet, so the claims that another outlet reported are grouped by outlet.
    const outlets = basis === 'reported' ? [...new Set(claims.map(outletOf))] : [undefined];
    for (const outlet of outlets) add('basis', basis, outlet === undefined ? claims : claims.filter((claim) => outletOf(claim) === outlet));
  }
  for (const status of STATUSES_WITH_SENTENCE) add('status', status, unique.filter((claim) => claim.status === status));
  return groups;
}

/** The limitation sentences for the claims a piece cites: one for each group, rendered from its note. */
export function buildLimitations(citedClaims: readonly Claim[]): LimitationSentence[] {
  return limitationGroups(citedClaims).map(({ template, claims }): LimitationSentence => ({
    kind: 'limitation',
    text: renderLimitation(claims, template),
    claimIds: claims.map((claim) => claim.id),
    template,
  }));
}
