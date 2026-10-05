import type { Sentence } from '@robywire/gate';
import type { SeededCase } from '../seeded';
import { claimOf, sentenceWith } from './support';

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
      const { source } = claimOf(base, 'c-19');
      source.tier = 2;
      source.outlet = OUTLET;
      const sentence = sentenceWith(base, 'It lists 7 investors');
      sentence.text = 'The filing lists 7 investors, according to reports.';
      if (sentence.kind === 'fact') sentence.attributed = true;
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
      copy.source.tier = 2;
      copy.source.outlet = OUTLET;
      base.claims.push(copy);
      sentenceWith(base, 'The measured rate sits below').claimIds.push('c-29');
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
    description: 'Eleven analysis sentences are added, which takes analysis over 20% of the body.',
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
    description: 'An analysis sentence works out a percentage, 22%, that no fact sentence states.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'The measured rate is 22% below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      return base;
    },
  },
  {
    id: 'analysis-new-name',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence brings in a company, Harlow Logistics, that no fact sentence mentions.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'The measured rate sits below the datasheet maximum, a gap that Harlow Logistics also reported.';
      return base;
    },
  },
];
