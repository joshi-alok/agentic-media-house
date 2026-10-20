import { buildLimitations, citedClaims } from '@robywire/gate';
import type { Sentence } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { attributeTo, claimOf, reportedBy, sentenceWith } from './support';

const OUTLET = 'Mercer Wire';

/** The same words and claims as an analysis sentence. */
const toAnalysis = (sentence: Sentence): Sentence => ({ kind: 'analysis', text: sentence.text, claimIds: sentence.claimIds });

/**
 * Defects in sourcing (G6, besides the spec's tier-2-only claim) and in the
 * rules for analysis sentences (G7).
 */
export const SOURCING_ANALYSIS_CASES: SeededCase[] = [
  {
    id: 'tier2-outlet-not-named',
    check: 'G6',
    code: 'G6_TIER2_UNATTRIBUTED',
    description: 'A sentence is marked attributed to a tier-2 outlet but never says which outlet.',
    apply: (base) => {
      attributeTo(base, 'It lists 7 investors', 'The filing lists 7 investors, according to reports.');
      reportedBy(base, 'c-19', OUTLET);
      return base;
    },
  },
  {
    id: 'tier2-in-analysis',
    check: 'G6',
    code: 'G6_TIER2_IN_ANALYSIS',
    description: "An analysis sentence rests on another outlet's reporting.",
    apply: (base) => {
      const copy = structuredClone(claimOf(base, 'c-12'));
      copy.id = 'c-29';
      base.claims.push(copy);
      sentenceWith(base, 'The measured rate sits below').claimIds.push('c-29');
      reportedBy(base, 'c-29', OUTLET);
      return base;
    },
  },
  {
    id: 'tier2-claim-wrong-basis',
    check: 'G6',
    code: 'G6_TIER2_BASIS',
    description: 'A claim that rests only on another outlet is given the basis of a primary source, a filing.',
    apply: (base) => {
      const { source } = claimOf(base, 'c-19');
      source.tier = 2;
      source.outlet = OUTLET;
      attributeTo(base, 'It lists 7 investors', `${OUTLET} reports that 7 investors took part in the round.`);
      return base;
    },
  },
  {
    id: 'primary-claim-called-reported',
    check: 'G6',
    code: 'G6_TIER1_REPORTED',
    description: 'A claim from a primary source is given the basis reported, which is for what another outlet reports.',
    apply: (base) => {
      claimOf(base, 'c-19').basis = 'reported';
      base.draft.limitations = buildLimitations(citedClaims(base.draft, base.claims));
      return base;
    },
  },
  {
    id: 'analysis-in-opening',
    check: 'G7',
    code: 'G7_ANALYSIS_PLACEMENT',
    description: "A sentence of the opening paragraph is the Desk's own analysis.",
    apply: (base) => {
      base.draft.opening[1] = toAnalysis(base.draft.opening[1]!);
      return base;
    },
  },
  {
    id: 'analysis-flood',
    check: 'G7',
    code: 'G7_ANALYSIS_SHARE',
    description: 'Analysis sentences are added until they make up more of the body than the rule allows.',
    apply: (base) => {
      const last = base.draft.sections.at(-1)!.paragraphs.at(-1)!;
      for (let i = 0; i < 11; i++) last.push({ kind: 'analysis', text: 'That is a plain reading of the figures.', claimIds: [] });
      return base;
    },
  },
  {
    id: 'analysis-new-number',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence works out a percentage that no fact sentence states.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'The measured rate is 22% below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      return base;
    },
  },
  {
    id: 'analysis-invented-initial-word',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_NAME',
    description: 'An analysis sentence opens with a company, Harlow, that no fact sentence mentions.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'Harlow also found that the measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      return base;
    },
  },
  {
    id: 'analysis-lowercase-opening',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_NAME',
    description: 'An analysis sentence starts with a lowercase name, harlow, so the rule for the opening word cannot read it.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'harlow also found that the measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      return base;
    },
  },
  {
    id: 'analysis-new-name',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_NAME',
    description: 'An analysis sentence brings in a company, Harlow Logistics, that no fact sentence mentions.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'The measured rate sits below the datasheet maximum, a gap that Harlow Logistics also reported.';
      return base;
    },
  },
];
