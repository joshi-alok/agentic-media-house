import type { Basis, Status } from './constants';
import type { Claim } from './schemas';

// The "What we couldn't verify" sentences are never freely composed. They are
// filled in from a claim's metadata through these fixed templates, so the gate
// can check them by rendering the same sentence and comparing. `{v}` is the
// claim's figure followed by a space (or nothing); `{label}` is the claim's label.

/** What a claim's `basis` tells the reader about where the figure came from. */
export const BASIS_TEMPLATES: Readonly<Record<Basis, string>> = {
  datasheet: "The {v}{label} figure comes from the company's datasheet; no independent measurement was available.",
  'press-release': 'The {v}{label} figure comes from a company press release; no independent measurement was available.',
  briefing: 'The {v}{label} figure was given in a company briefing; no independent measurement was available.',
  demo: 'The {label} was shown in a demonstration; the source does not describe independent testing.',
  paper: "The {v}{label} figure is reported in the authors' paper; it has not been independently reproduced.",
  filing: 'The {v}{label} figure comes from a regulatory filing.',
  standard: 'The {label} requirement comes from the published standard.',
  measured: 'The {v}{label} figure was measured by the source and is reported as stated.',
};

/** What a claim's `status` tells the reader about how far the capability has got. */
export const STATUS_TEMPLATES: Readonly<Record<Status, string>> = {
  demonstrated: 'The {label} was demonstrated; the source does not report it in commercial deployment.',
  deployed: 'The company states the {label} is deployed; no independent confirmation was available.',
  planned: 'The {label} is planned, not delivered.',
  unspecified: 'The source does not say whether the {label} has been demonstrated or deployed.',
};

/**
 * The claim's figure as it is written in the source, followed by a space: the
 * first number value, else the first value of any kind, else nothing.
 */
function figureOf(claim: Claim): string {
  const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
  return value === undefined ? '' : `${value.raw} `;
}

/** Render the limitation sentence for `claim` through the `basis` or the `status` template. */
export function renderLimitation(claim: Claim, template: 'basis' | 'status'): string {
  const text = template === 'basis' ? BASIS_TEMPLATES[claim.basis] : STATUS_TEMPLATES[claim.status];
  // One pass with a function, so a "$" in a value or label is never read as a
  // replacement pattern and a placeholder inside a value is never filled in.
  return text.replace(/\{(v|label)\}/g, (_placeholder, name: string) => (name === 'v' ? figureOf(claim) : claim.label));
}
