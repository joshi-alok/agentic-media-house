import { BEATS } from '@robywire/gate';
import type { Beat } from '@robywire/gate';

// Which pieces go under which beat. A piece has one to three categories, and
// at least one of them is a beat; the home page files it under the first.

interface HasCategories {
  slug: string;
  data: { categories: readonly string[] };
}

/** The first of `categories` that is one of the seven beats, or undefined if none is. */
export function firstBeat(categories: readonly string[]): Beat | undefined {
  return categories.find((category): category is Beat => (BEATS as readonly string[]).includes(category));
}

/**
 * Group pieces by their first beat. Groups come in the order of the beats,
 * beats with no piece are left out, and pieces keep the order they were given.
 */
export function groupByBeat<T extends HasCategories>(pieces: readonly T[]): { beat: Beat; pieces: T[] }[] {
  const groups = new Map<Beat, T[]>();
  for (const piece of pieces) {
    const beat = firstBeat(piece.data.categories);
    if (beat === undefined) throw new Error(`groupByBeat: the piece ${JSON.stringify(piece.slug)} has no beat among its categories`);
    groups.set(beat, [...(groups.get(beat) ?? []), piece]);
  }
  return BEATS.filter((beat) => groups.has(beat)).map((beat) => ({ beat, pieces: groups.get(beat)! }));
}

/** The pieces that have `topic` (a beat or a tag) among their categories, in the order given. */
export function piecesIn<T extends HasCategories>(pieces: readonly T[], topic: string): T[] {
  return pieces.filter((piece) => piece.data.categories.includes(topic));
}
