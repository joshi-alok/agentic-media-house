import { BASES, SAFE_BASES } from './constants';
import type { Basis, Status } from './constants';
import type { Claim, LimitationSentence } from './schemas';

// The "What we couldn't verify" sentences are never freely composed. They are
// filled in from the metadata of claims through these fixed templates, so the
// gate can check them by rendering the same sentence and comparing.
//
// A sentence describes a GROUP of claims that share a basis (for a 'basis'
// sentence) or a status (for a 'status' sentence). A group of one claim uses
// the singular template, whose placeholders are `{v}` (the claim's figure
// followed by a space, or nothing) and `{label}`. A group of two or more uses
// the plural template, whose placeholder is `{items}` (the figure and label of
// each claim) or `{labels}` (the label of each claim) for the templates that do
// not mention a figure. The items are joined "A", "A and B", "A, B and C".
// The templates of the basis `reported` also name the outlet (`{outlet}`), the
// outlet of the claims themselves, which is why a group of reported claims is
// never larger than the claims of one outlet.

/** What a claim's `basis` tells the reader about where the figure came from: one claim. */
export const BASIS_TEMPLATES: Readonly<Record<Basis, string>> = {
  datasheet: "The {v}{label} figure comes from the company's datasheet; no independent measurement was available.",
  'press-release': 'The {v}{label} figure comes from a company press release; no independent measurement was available.',
  briefing: 'The {v}{label} figure was given in a company briefing; no independent measurement was available.',
  demo: 'The {label} was shown in a demonstration; the source does not describe independent testing.',
  paper: "The {v}{label} figure is reported in the authors' paper; it has not been independently reproduced.",
  filing: 'The {v}{label} figure comes from a regulatory filing.',
  standard: 'The {label} requirement comes from the published standard.',
  measured: 'The {v}{label} figure was measured by the source and is reported as stated.',
  reported: 'The {v}{label} figure is reported by {outlet} and was not checked against a primary source.',
};

/** The same, for two or more claims that share the basis. */
export const BASIS_TEMPLATES_PLURAL: Readonly<Record<Basis, string>> = {
  datasheet: "The {items} figures come from the company's datasheet; no independent measurement was available.",
  'press-release': 'The {items} figures come from a company press release; no independent measurement was available.',
  briefing: 'The {items} figures were given in a company briefing; no independent measurement was available.',
  demo: 'The {labels} were shown in a demonstration; the source does not describe independent testing.',
  paper: "The {items} figures are reported in the authors' paper; they have not been independently reproduced.",
  filing: 'The {items} figures come from a regulatory filing.',
  standard: 'The {labels} requirements come from the published standard.',
  measured: 'The {items} figures were measured by the source and are reported as stated.',
  reported: 'The {items} figures are reported by {outlet} and were not checked against a primary source.',
};

/** What a claim's `status` tells the reader about how far the capability has got: one claim. */
export const STATUS_TEMPLATES: Readonly<Record<Status, string>> = {
  demonstrated: 'The {label} was demonstrated; the source does not report it in commercial deployment.',
  deployed: 'The company states the {label} is deployed; no independent confirmation was available.',
  planned: 'The {label} is planned, not delivered.',
  unspecified: 'The source does not say whether the {label} has been demonstrated or deployed.',
};

/** The same, for two or more claims that share the status. */
export const STATUS_TEMPLATES_PLURAL: Readonly<Record<Status, string>> = {
  demonstrated: 'The {labels} were demonstrated; the source does not report them in commercial deployment.',
  deployed: 'The company states the {labels} are deployed; no independent confirmation was available.',
  planned: 'The {labels} are planned, not delivered.',
  unspecified: 'The source does not say whether the {labels} have been demonstrated or deployed.',
};

/** The statuses that need a sentence of their own: the capability has been shown or promised, not delivered. */
const STATUSES_WITH_SENTENCE: readonly Status[] = ['demonstrated', 'planned'];

/** Does this claim need a 'basis' sentence? Yes unless its figure comes from a filing, a standard, a paper or a measurement. */
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

/**
 * The claim's figure as it is written in the source, followed by a space: the
 * first number value, else the first value of any kind, else nothing.
 */
function figureOf(claim: Claim): string {
  const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
  return value === undefined ? '' : `${value.raw} `;
}

/** "A", "A and B", "A, B and C". */
export function joinList(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Render the limitation sentence for a group of claims through the `basis` or
 * the `status` template. The template is chosen by the first claim's basis (or
 * status), and the outlet of a `reported` sentence is the first claim's outlet;
 * the gate checks that the claims of a group share them. One claim gives the
 * singular sentence, two or more the plural one.
 */
export function renderLimitation(claims: readonly Claim[], template: 'basis' | 'status'): string {
  const first = claims[0];
  if (first === undefined) throw new Error('renderLimitation: a limitation sentence needs at least one claim');
  const single = claims.length === 1;
  const text =
    template === 'basis'
      ? (single ? BASIS_TEMPLATES : BASIS_TEMPLATES_PLURAL)[first.basis]
      : (single ? STATUS_TEMPLATES : STATUS_TEMPLATES_PLURAL)[first.status];
  const items = joinList(claims.map((claim) => `${figureOf(claim)}${claim.label}`));
  const labels = joinList(claims.map((claim) => claim.label));
  // One pass with a function, so a "$" in a value or label is never read as a
  // replacement pattern and a placeholder inside a value is never filled in.
  return text.replace(/\{(v|label|items|labels|outlet)\}/g, (_placeholder, name: string) => {
    if (name === 'items') return items;
    if (name === 'labels') return labels;
    if (name === 'outlet') return outletOf(first);
    return name === 'v' ? figureOf(first) : first.label;
  });
}

/** A set of claims that one limitation sentence covers: they share the basis (or the status) `key`. */
export interface LimitationGroup {
  template: 'basis' | 'status';
  key: Basis | Status;
  /** Ascending by claim number, each claim once. */
  claims: Claim[];
}

/**
 * The groups of claims that need a limitation sentence. `citedClaims` are the
 * claims the body of a piece cites. Those whose basis is not safe are grouped by
 * basis, in the order of BASES; the claims that were `reported` are grouped by
 * outlet as well, so that a sentence names one outlet, the outlet of the lowest
 * claim number first. Those that are demonstrated or planned are grouped by
 * status, in that order, after the basis groups. A claim that needs both is in a
 * group of each kind. Inside a group the claims are ordered by claim number.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
  const unique = [...new Map(citedClaims.map((claim) => [claim.id, claim])).values()].sort((a, b) => claimNumber(a.id) - claimNumber(b.id));
  const groups: LimitationGroup[] = [];
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
    // One sentence names one outlet, so the claims that another outlet reported are grouped by outlet.
    const outlets = basis === 'reported' ? [...new Set(claims.map(outletOf))] : [undefined];
    for (const outlet of outlets) {
      const group = outlet === undefined ? claims : claims.filter((claim) => outletOf(claim) === outlet);
      if (group.length > 0) groups.push({ template: 'basis', key: basis, claims: group });
    }
  }
  for (const status of STATUSES_WITH_SENTENCE) {
    const claims = unique.filter((claim) => claim.status === status);
    if (claims.length > 0) groups.push({ template: 'status', key: status, claims });
  }
  return groups;
}

/** The limitation sentences for the claims a piece cites: one for each group, rendered from its template. */
export function buildLimitations(citedClaims: readonly Claim[]): LimitationSentence[] {
  return limitationGroups(citedClaims).map(({ template, claims }): LimitationSentence => ({
    kind: 'limitation',
    text: renderLimitation(claims, template),
    claimIds: claims.map((claim) => claim.id),
    template,
  }));
}
