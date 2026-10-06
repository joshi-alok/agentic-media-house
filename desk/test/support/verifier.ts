import type { VerifyPlan, VerifyReply } from '../../src/stages/verify-model';

// A verifier that the tests can script: the reply of a model that judges every item and every claim of a plan, as a test says.

/**
 * The reply of a verifier that clears everything in `plan`, except what `verdicts` says (by item id) and `unsupported` lists (by claim id,
 * its basis and its status are not supported). `omit` leaves the ids out of the reply, and `extra` adds entries after the rest.
 */
export function verifierReply(
  plan: VerifyPlan,
  options: { verdicts?: Record<string, 'not_entailed' | 'ambiguous'>; unsupported?: string[]; omit?: string[]; extra?: Partial<VerifyReply> } = {},
): VerifyReply {
  const { verdicts = {}, unsupported = [], omit = [], extra = {} } = options;
  return {
    verdicts: [
      ...[...plan.sentences, ...plan.headings]
        .filter((item) => !omit.includes(item.id))
        .map((item) => ({ id: item.id, verdict: verdicts[item.id] ?? ('entailed' as const), reason: verdicts[item.id] === undefined ? 'The passages say it.' : `The passages do not say it (${item.id}).` })),
      ...(extra.verdicts ?? []),
    ],
    labels: [
      ...plan.claims
        .filter((claim) => !omit.includes(claim.id))
        .map((claim) => ({ id: claim.id, basisSupported: !unsupported.includes(claim.id), statusSupported: !unsupported.includes(claim.id), reason: unsupported.includes(claim.id) ? 'The passage does not support the label.' : 'The passage supports the label.' })),
      ...(extra.labels ?? []),
    ],
  };
}
