import type { VerifyPlan, VerifyReply } from '../../src/stages/verify-model';

// A verifier that the tests can script: the reply of a model that judges every item and every claim of a plan, as a test says.

/**
 * The reply of a verifier that clears everything in `plan`, except what `verdicts` says (by item id) and `unsupported` lists (by claim id,
 * its basis and its status are not supported). `unsupportedStatus` and `unsupportedBasis` list claims of which only the status, or only the basis, is not supported. A `not_entailed` item lists one thing that the passages do not say, as the model check requires. `omit` leaves the ids out of the reply, and `extra` adds entries after the rest.
 */
export function verifierReply(
  plan: VerifyPlan,
  options: { verdicts?: Record<string, 'not_entailed' | 'ambiguous'>; unsupported?: string[]; unsupportedStatus?: string[]; unsupportedBasis?: string[]; omit?: string[]; extra?: Partial<VerifyReply> } = {},
): VerifyReply {
  const { verdicts = {}, unsupported = [], unsupportedStatus = [], unsupportedBasis = [], omit = [], extra = {} } = options;
  return {
    verdicts: [
      ...[...plan.sentences, ...plan.headings]
        .filter((item) => !omit.includes(item.id))
        .map((item) => ({
          id: item.id,
          reason: verdicts[item.id] === undefined ? 'The passages say it.' : `The passages do not say it (${item.id}).`,
          missing: verdicts[item.id] === 'not_entailed' ? ['what the passages do not say'] : [],
          verdict: verdicts[item.id] ?? ('entailed' as const),
        })),
      ...(extra.verdicts ?? []),
    ],
    labels: [
      ...plan.claims
        .filter((claim) => !omit.includes(claim.id))
        .map((claim) => {
          const basis = !unsupported.includes(claim.id) && !unsupportedBasis.includes(claim.id);
          const status = !unsupported.includes(claim.id) && !unsupportedStatus.includes(claim.id);
          return { id: claim.id, basisSupported: basis, statusSupported: status, reason: basis && status ? 'The passage supports the label.' : 'The passage does not support the label.' };
        }),
      ...(extra.labels ?? []),
    ],
  };
}
