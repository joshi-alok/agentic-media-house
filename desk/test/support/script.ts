import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import type { Draft, Sentence } from '@robywire/gate';
import type { ComposeReply, ReplySentence } from '../../src/stages/draft-assembly';

// What a composer that writes the golden piece of the gate would reply. The tests of Compose and Verify start from it, change one
// thing and say what the Desk must do about it.

/** A sentence as the composer writes it: what a draft has, less the limitation kind, which only code writes. */
export function replySentence(sentence: Sentence): ReplySentence {
  if (sentence.kind === 'limitation') throw new Error('a composer does not write a limitation sentence');
  if (sentence.kind === 'analysis') return { kind: 'analysis', text: sentence.text, claimIds: [...sentence.claimIds] };
  return { kind: 'fact', text: sentence.text, claimIds: [...sentence.claimIds], ...(sentence.attributed === undefined ? {} : { attributed: sentence.attributed }) };
}

/** The reply of a composer that wrote `draft`: everything in it except what the Desk writes (slug, date, author, limitations). */
export function replyFromDraft(draft: Draft = GOLDEN_DRAFT): ComposeReply {
  return {
    categories: [...draft.categories] as ComposeReply['categories'],
    title: replySentence(draft.title),
    description: replySentence(draft.description),
    opening: draft.opening.map(replySentence),
    takeaways: draft.takeaways.map(replySentence),
    sections: draft.sections.map((section) => ({ heading: section.heading, paragraphs: section.paragraphs.map((paragraph) => paragraph.map(replySentence)) })),
  };
}
