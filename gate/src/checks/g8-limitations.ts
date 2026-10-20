import type { Check, Failure } from '../gate';
import { claimNumber, joinList, outletOf, renderLimitation } from '../limitations';
import type { Claim } from '../schemas';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G8 can report. */
export const G8_CODES = [
  'G8_LIMITATION_PLACEMENT',
  'G8_LIMITATION_CLAIMS',
  'G8_LIMITATION_GROUP',
  'G8_LIMITATION_MISMATCH',
] as const;

/**
 * What is wrong with the list of claim ids a limitation sentence cites, or
 * undefined if it is a usable list: not empty, each id a claim of the piece,
 * each id once, in ascending order of claim number.
 */
function claimsProblem(ids: readonly string[], known: ReadonlyMap<string, Claim>): string | undefined {
  if (ids.length === 0) return 'cites no claim: it must cite the claims it describes';
  const unknown = [...new Set(ids.filter((id) => !known.has(id)))];
  if (unknown.length === 1) return `cites ${unknown[0]}, which is not one of this piece's claims`;
  if (unknown.length > 1) return `cites ${joinList(unknown)}, which are not claims of this piece`;
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at);
  if (repeated !== undefined) return `cites ${repeated} more than once: cite each claim once`;
  const at = ids.findIndex((id, index) => index > 0 && claimNumber(id) < claimNumber(ids[index - 1] as string));
  if (at > 0) return `lists ${ids[at]} after ${ids[at - 1]}: list the claims in ascending order of claim number`;
  return undefined;
}

/**
 * G8, limitations: the "What we couldn't verify" sentences are never freely
 * written. Each one describes the metadata of a group of claims through one of
 * the fixed notes in `limitations.ts`, so this check can render the
 * sentence again and compare. The comparison is exact.
 *
 * - A limitation sentence may sit only in `draft.limitations`
 *   (G8_LIMITATION_PLACEMENT), wherever else it is found.
 * - It cites at least one claim of the piece, each once, in ascending order of
 *   claim number (G8_LIMITATION_CLAIMS).
 * - The claims of a 'basis' sentence all have the same basis, and those of a
 *   'status' sentence the same status; a 'basis' sentence for the basis
 *   `reported` names one outlet, so its claims also share their outlet
 *   (G8_LIMITATION_GROUP).
 * - Its text is what the note renders for its claims
 *   (G8_LIMITATION_MISMATCH). A sentence whose claims have changed since it
 *   was written fails here too.
 *
 * A sentence with a problem in an earlier rule is not read by the later ones.
 * Whether a limitation is present at all, and whether every claim that needs
 * one has one, is G2's question.
 */
export const checkG8: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind !== 'limitation') continue;
    const where = describeLocation(located);
    const fail = (code: string, message: string) => failures.push({ check: 'G8', code, message, where });

    if (located.section !== 'limitations') {
      fail(
        'G8_LIMITATION_PLACEMENT',
        `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
      );
    }

    const ids = sentence.claimIds;
    const problem = claimsProblem(ids, byId);
    if (problem !== undefined) {
      fail('G8_LIMITATION_CLAIMS', `the limitation sentence at ${where} ${problem}`);
      continue;
    }

    const group = ids.map((id) => byId.get(id) as Claim);
    const keyOf = (claim: Claim) => (sentence.template === 'basis' ? claim.basis : claim.status);
    const keys = [...new Set(group.map(keyOf))];
    if (keys.length > 1) {
      const examples = keys.map((key) => `${(group.find((claim) => keyOf(claim) === key) as Claim).id}: ${key}`).join(', ');
      const [plural, singular] = sentence.template === 'basis' ? ['bases', 'basis'] : ['statuses', 'status'];
      fail(
        'G8_LIMITATION_GROUP',
        `the limitation sentence at ${where} groups claims with different ${plural} (${examples}): a ${sentence.template} sentence covers claims that share one ${singular}`,
      );
      continue;
    }

    const outlets = [...new Set(group.map(outletOf))];
    if (sentence.template === 'basis' && keys[0] === 'reported' && outlets.length > 1) {
      const examples = outlets.map((outlet) => `${(group.find((claim) => outletOf(claim) === outlet) as Claim).id}: ${outlet}`).join(', ');
      fail(
        'G8_LIMITATION_GROUP',
        `the limitation sentence at ${where} groups claims reported by different outlets (${examples}): a reported sentence covers claims from one outlet`,
      );
      continue;
    }

    const expected = renderLimitation(group, sentence.template);
    if (sentence.text !== expected) {
      fail(
        'G8_LIMITATION_MISMATCH',
        `the limitation sentence at ${where} does not match the ${sentence.template} template for ${ids.join(', ')}; it must read: "${expected}"`,
      );
    }
  }

  return { failures, holdReasons: [] };
};
