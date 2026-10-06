import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';

/** Every failure code G6 can report. */
export const G6_CODES = ['G6_TIER2_UNATTRIBUTED', 'G6_TIER2_IN_ANALYSIS', 'G6_TIER2_BASIS', 'G6_TIER1_REPORTED'] as const;

/**
 * Every reason a check can ask for a hold, as opposed to a failure. A piece with
 * a hold reason and no failure goes to the owner instead of being revised. The
 * site gives each reason a label, and a test there fails if one has none.
 */
export const HOLD_REASONS = ['TIER2_ATTRIBUTION'] as const;

/** Why a piece that cites a tier-2 claim, even a properly attributed one, can never publish by itself. */
const HOLD_TIER2 = HOLD_REASONS[0];

/**
 * G6, sourcing: a claim from a tier-2 outlet (another publication's reporting)
 * may be used only as an attribution. A fact sentence that cites one must be
 * marked `attributed` and must name the outlet ("Mercer Wire reports that ...").
 * An analysis sentence may not cite one at all.
 *
 * A piece whose tier-2 citations are all properly attributed passes this
 * check but asks for a hold, once: the owner decides. The hold reason is
 * withheld while G6 still has a failure, because the piece goes back for
 * revision first.
 *
 * The basis of a claim says which of the two it is. A claim that rests only on
 * another outlet has the basis `reported`, and no other claim has it: a tier-2
 * claim with any other basis (G6_TIER2_BASIS) would borrow the standing of a
 * filing or a datasheet, and a tier-1 claim with the basis `reported`
 * (G6_TIER1_REPORTED) would hide a primary source behind the label of a secondary
 * one. Each such claim is reported once, wherever a sentence cites it, a
 * limitation sentence included.
 *
 * Limitation sentences are not read for the rules above: they describe a claim
 * and assert nothing. A claim id that does not exist is G3's to report.
 */
export const checkG6: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];
  let tier2Facts = 0;

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind === 'limitation') continue;
    const tier2 = [...new Set(sentence.claimIds)].flatMap((id) => byId.get(id) ?? []).filter((claim) => claim.source.tier === 2);
    if (tier2.length === 0) continue;

    const where = describeLocation(located);
    const ids = tier2.map((claim) => claim.id).join(', ');

    if (sentence.kind === 'analysis') {
      failures.push({
        check: 'G6',
        code: 'G6_TIER2_IN_ANALYSIS',
        message: `the analysis sentence at ${where} cites ${ids}, which comes from a tier-2 outlet; analysis may rest only on tier-1 claims`,
        where,
      });
      continue;
    }

    tier2Facts++;
    const text = normaliseQuotes(sentence.text).toLowerCase();
    const outlets = [...new Set(tier2.map((claim) => claim.source.outlet?.trim() ?? ''))];
    const unnamed = outlets.filter((outlet) => outlet === '' || !text.includes(normaliseQuotes(outlet).toLowerCase()));

    const problems: string[] = [];
    if (sentence.attributed !== true) problems.push('it is not marked attributed');
    if (unnamed.length > 0) problems.push(`it does not name ${unnamed.map((outlet) => `"${outlet}"`).join(' or ')}`);
    if (problems.length > 0) {
      failures.push({
        check: 'G6',
        code: 'G6_TIER2_UNATTRIBUTED',
        message: `the fact sentence at ${where} rests on tier-2 ${tier2.length === 1 ? 'claim' : 'claims'} ${ids} but ${problems.join(' and ')}; write "<outlet> reports ..." and mark the sentence attributed`,
        where,
      });
    }
  }

  const cited = new Set(allSentences(draft).flatMap((located) => located.sentence.claimIds));
  for (const claim of claims) {
    if (!cited.has(claim.id)) continue;
    const label = `claim ${claim.id} (${claim.label})`;
    if (claim.source.tier === 2 && claim.basis !== 'reported') {
      failures.push({
        check: 'G6',
        code: 'G6_TIER2_BASIS',
        message: `${label} comes from a tier-2 outlet but has the basis "${claim.basis}"; a claim that rests only on another outlet has the basis "reported"`,
      });
    }
    if (claim.source.tier === 1 && claim.basis === 'reported') {
      failures.push({
        check: 'G6',
        code: 'G6_TIER1_REPORTED',
        message: `${label} comes from a tier-1 source but has the basis "reported"; that basis is for claims that rest only on another outlet, so give it the basis its source supports`,
      });
    }
  }

  return { failures, holdReasons: failures.length === 0 && tier2Facts > 0 ? [HOLD_TIER2] : [] };
};
