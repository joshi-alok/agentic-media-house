import { DESK_AUTHOR_NAME, SLUG_PATTERN, buildLimitations, citedClaims, defaultContext, runGate } from '@robywire/gate';
import type { Draft } from '@robywire/gate';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden, makeTier2Variant } from '@robywire/gate/fixtures';
import { describe, expect, it } from 'vitest';
import { ComposeReply, SLUG_MAX_LENGTH, assembleDraft, finishDraft, slugFromTitle } from '../../src/stages/draft-assembly';
import { emptyPublished } from '../../src/stages/context';
import { RUN_DATE } from '../support/candidates';
import { replyFromDraft } from '../support/script';

// The composer writes sentences; code writes everything else: the slug, the date, the author and the limitation sentences. These
// tests start from the reply of a composer that wrote the golden piece of the gate, and check what code adds to it.

const ctx = (slugs: string[] = []) => ({ date: RUN_DATE, published: { ...emptyPublished(), slugs } });

/** `value` and everything in it, frozen: a function that changes its argument fails on it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('slugFromTitle', () => {
  it.each([
    ['Fixture Robotics ships its FX-1 warehouse arm to a second plant', 'fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant'],
    ['FX-1', 'fx-1'],
    ['  Spaces   everywhere  ', 'spaces-everywhere'],
    ['Punctuation: a "quoted" word, (brackets), and a question?', 'punctuation-a-quoted-word-brackets-and-a-question'],
    ['Robots & people / machines - together', 'robots-people-machines-together'],
    ["Brindle's second plant", 'brindles-second-plant'],
    [`Brindle${String.fromCharCode(0x2019)}s second plant`, 'brindles-second-plant'],
    [`Caf${String.fromCharCode(0xe9)} robots, na${String.fromCharCode(0xef)}ve plans`, 'cafe-robots-naive-plans'],
    [`Z${String.fromCharCode(0xfc)}rich plant: ${String.fromCharCode(0x201c)}ready${String.fromCharCode(0x201d)}`, 'zurich-plant-ready'],
    ['12 robots ship to 3 plants', '12-robots-ship-to-3-plants'],
    ['2026', '2026'],
    ['---Dashes---and___underscores', 'dashes-and-underscores'],
    ['UPPER and lower', 'upper-and-lower'],
    [`Robots ${String.fromCodePoint(0x1f916)} ship`, 'robots-ship'],
    [`${String.fromCharCode(0x30ed, 0x30dc, 0x30c3, 0x30c8)} FX-1 robots`, 'fx-1-robots'],
    [`Fixture${String.fromCharCode(0xa0)}Robotics`, 'fixture-robotics'],
  ])('makes %j into %j', (title, slug) => {
    expect(slugFromTitle(title)).toBe(slug);
  });

  it('always gives a slug that the gate accepts, for any title that has a letter or a digit in it', () => {
    for (const title of ['a', '9', '-a-', 'Ready?!', "'", `${String.fromCharCode(0x2019)}x${String.fromCharCode(0x2019)}`, 'FX-1 / FX-2', '1 2 3', 'a'.repeat(200), `${'word '.repeat(60)}`]) {
      if (/[A-Za-z0-9]/.test(title)) expect(slugFromTitle(title)).toMatch(SLUG_PATTERN);
    }
  });

  it('fails, and does not make up a slug, for a title with no letter or digit of ASCII in it', () => {
    for (const title of ['', '   ', '?!', '---', String.fromCharCode(0x30ed, 0x30dc), String.fromCodePoint(0x1f916)]) {
      expect(() => slugFromTitle(title)).toThrow('has no letter or digit to make a slug from');
    }
  });

  it('keeps a slug of exactly 80 characters whole', () => {
    const title = `${'a'.repeat(39)} ${'b'.repeat(40)}`;
    expect(slugFromTitle(title)).toBe(`${'a'.repeat(39)}-${'b'.repeat(40)}`);
    expect(slugFromTitle(title)).toHaveLength(SLUG_MAX_LENGTH);
  });

  it('cuts a longer slug at the last whole word that fits, and not in the middle of a word or on a hyphen', () => {
    const title = `${'a'.repeat(39)} ${'b'.repeat(40)} ${'c'.repeat(10)}`;
    expect(slugFromTitle(title)).toBe(`${'a'.repeat(39)}-${'b'.repeat(40)}`);
    expect(slugFromTitle(`${'a'.repeat(40)} ${'b'.repeat(40)}`)).toBe('a'.repeat(40));
    const long = slugFromTitle('Fixture Robotics ships its FX-1 warehouse arm to a second plant run by Brindle Logistics at Tarnmoor and Ashvale this autumn');
    expect(long).toBe('fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant-run-by-brindle');
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(long.endsWith('-')).toBe(false);
  });

  it('never gives a slug of more than 80 characters, whichever character the 81st and the 82nd are', () => {
    expect(slugFromTitle(`${'a'.repeat(80)} b`)).toBe('a'.repeat(80));
    expect(slugFromTitle(`${'a'.repeat(81)} b`)).toBe('a'.repeat(80));
    expect(slugFromTitle(`${'a'.repeat(79)} bb cc`)).toBe('a'.repeat(79));
    expect(slugFromTitle(`${'a'.repeat(78)} bbb cc`)).toBe('a'.repeat(78));
  });

  it('cuts at the last hyphen that fits even when that leaves one short word', () => {
    expect(slugFromTitle(`a ${'b'.repeat(100)}`)).toBe('a');
  });

  it('cuts one very long word at the limit', () => {
    expect(slugFromTitle('x'.repeat(200))).toBe('x'.repeat(SLUG_MAX_LENGTH));
    expect(slugFromTitle(`${'x'.repeat(100)} y`)).toBe('x'.repeat(SLUG_MAX_LENGTH));
  });

  it('is 80 characters at most', () => {
    expect(SLUG_MAX_LENGTH).toBe(80);
  });
});

describe('ComposeReply: what the composer may write', () => {
  const valid = () => structuredClone(replyFromDraft()) as unknown as Record<string, unknown>;

  it('accepts the reply of a composer that wrote the golden piece, which has a fact with attributed and one without it, and analysis', () => {
    const reply = valid();
    expect(ComposeReply.safeParse(reply).success).toBe(true);
    const sentences = JSON.stringify(reply);
    expect(sentences).toContain('"kind":"analysis"');
    const tier2 = makeTier2Variant(cloneGolden());
    expect(JSON.stringify(replyFromDraft(tier2.draft))).toContain('"attributed":true');
    expect(ComposeReply.safeParse(replyFromDraft(tier2.draft)).success).toBe(true);
  });

  it.each([
    ['a limitations field, which only code writes', { limitations: [] }],
    ['an author', { author: { name: 'Someone Else' } }],
    ['a slug', { slug: 'my-own-slug' }],
    ['a date', { publishedAt: '2026-01-01' }],
    ['any other field', { note: 'hello' }],
  ])('refuses a reply with %s', (_what, extra) => {
    expect(ComposeReply.safeParse({ ...valid(), ...extra }).success).toBe(false);
  });

  it('refuses a sentence of the kind limitation, anywhere', () => {
    const limitation = { kind: 'limitation', text: 'The 12 kg payload figure comes from the datasheet.', claimIds: ['c-8'], template: 'basis' };
    const inOpening = { ...valid(), opening: [limitation] };
    expect(ComposeReply.safeParse(inOpening).success).toBe(false);
    const reply = valid() as { sections: { paragraphs: unknown[][] }[] };
    reply.sections[0]?.paragraphs[0]?.push(limitation);
    expect(ComposeReply.safeParse(reply).success).toBe(false);
  });

  it('refuses a field of a sentence that it does not know, and an attribution on analysis', () => {
    expect(ComposeReply.safeParse({ ...valid(), title: { kind: 'fact', text: 'A title', claimIds: ['c-1'], template: 'basis' } }).success).toBe(false);
    expect(ComposeReply.safeParse({ ...valid(), opening: [{ kind: 'analysis', text: 'An opinion.', claimIds: [], attributed: true }] }).success).toBe(false);
  });

  it('refuses a category that is not in the vocabulary, and a section with a field that it does not know', () => {
    expect(ComposeReply.safeParse({ ...valid(), categories: ['industrial-warehouse', 'robots'] }).success).toBe(false);
    expect(ComposeReply.safeParse({ ...valid(), sections: [{ heading: 'What shipped', paragraphs: [], id: 3 }] }).success).toBe(false);
  });

  it('refuses a reply with a field missing, or with the wrong shape', () => {
    for (const field of ['categories', 'title', 'description', 'opening', 'takeaways', 'sections']) {
      const reply = valid();
      delete reply[field];
      expect(ComposeReply.safeParse(reply).success).toBe(false);
    }
    expect(ComposeReply.safeParse({ ...valid(), sections: [{ heading: 'What shipped', paragraphs: ['a sentence'] }] }).success).toBe(false);
    expect(ComposeReply.safeParse({ ...valid(), opening: [{ kind: 'fact', text: 'A sentence.', claimIds: 'c-1' }] }).success).toBe(false);
  });

  it('leaves what a sentence says to the gate: it accepts a sentence that cites nothing, cites a claim that does not exist or is empty', () => {
    const reply = { ...valid(), opening: [{ kind: 'fact', text: '', claimIds: [] }, { kind: 'fact', text: 'it starts in lowercase.', claimIds: ['c-99'] }] };
    expect(ComposeReply.safeParse(reply).success).toBe(true);
  });

  it('accepts no categories and ten: how many is the gate\'s to say', () => {
    expect(ComposeReply.safeParse({ ...valid(), categories: [] }).success).toBe(true);
    expect(ComposeReply.safeParse({ ...valid(), categories: Array.from({ length: 10 }, () => 'humanoids') }).success).toBe(true);
  });
});

describe('assembleDraft', () => {
  it('gives back the sentences of the reply as they are, with the slug, the date, the author and the limitations added', () => {
    const draft = assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx());
    const { slug: _slug, publishedAt: _date, ...expected } = GOLDEN_DRAFT;
    const { slug, publishedAt, ...rest } = draft;
    expect(rest).toEqual(expected);
    expect(slug).toBe('fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant');
    expect(publishedAt).toBe(RUN_DATE);
    expect(draft.author).toEqual({ name: DESK_AUTHOR_NAME });
  });

  it('takes the slug from the title, whatever the composer would have liked', () => {
    const reply = replyFromDraft();
    reply.title = { kind: 'fact', text: 'Brindle Logistics opens a plant', claimIds: ['c-1'] };
    expect(assembleDraft(reply, GOLDEN_CLAIMS, ctx()).slug).toBe('brindle-logistics-opens-a-plant');
  });

  it('writes the date of the run, and not the date of the golden piece', () => {
    expect(GOLDEN_DRAFT.publishedAt).not.toBe(RUN_DATE);
    expect(assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx()).publishedAt).toBe(RUN_DATE);
  });

  it('builds the limitations from the claims that the piece cites, and from no other', () => {
    const reply = replyFromDraft();
    reply.sections = reply.sections.slice(0, 1);
    const draft = assembleDraft(reply, GOLDEN_CLAIMS, ctx());
    const cited = new Set(citedClaims({ ...draft, limitations: [] }, GOLDEN_CLAIMS).map((claim) => claim.id));
    expect(draft.limitations).toEqual(buildLimitations(GOLDEN_CLAIMS.filter((claim) => cited.has(claim.id))));
    expect(draft.limitations.length).toBeGreaterThan(0);
    expect(draft.limitations.flatMap((sentence) => sentence.claimIds).every((id) => cited.has(id))).toBe(true);
    expect(cited.has('c-19')).toBe(false);
  });

  it('has no limitation when the piece cites only claims that need none', () => {
    const reply = replyFromDraft();
    reply.title = { kind: 'fact', text: 'The offering raised USD 450 million', claimIds: ['c-17'] };
    reply.description = { kind: 'fact', text: 'Corvane Partners led the offering.', claimIds: ['c-18'] };
    reply.opening = [{ kind: 'fact', text: 'The offering raised USD 450 million.', claimIds: ['c-17'] }];
    reply.takeaways = [];
    reply.sections = [{ heading: 'What the filing shows', paragraphs: [[{ kind: 'fact', text: 'Seven investors took part in the offering.', claimIds: ['c-19'] }]] }];
    expect(assembleDraft(reply, GOLDEN_CLAIMS, ctx()).limitations).toEqual([]);
  });

  it('names the outlet in the limitation of a claim that another outlet reported', () => {
    const tier2 = makeTier2Variant(cloneGolden());
    const draft = assembleDraft(replyFromDraft(tier2.draft), tier2.claims, ctx());
    const reported = draft.limitations.filter((sentence) => sentence.claimIds.includes('c-19'));
    expect(reported).toHaveLength(1);
    expect(reported[0]?.text).toBe('The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.');
  });

  it('gives a draft that the gate clears for publication, as the golden piece is', () => {
    const draft = assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx());
    const gate = runGate({ draft, claims: structuredClone(GOLDEN_CLAIMS) }, defaultContext());
    expect(gate.failures).toEqual([]);
    expect(gate.route).toBe('publish');
  });

  it('picks the next slug when one is published: the year, then the month, then the day', () => {
    const slug = 'fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant';
    expect(assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx([slug])).slug).toBe(`${slug}-2026`);
    expect(assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx([slug, `${slug}-2026`])).slug).toBe(`${slug}-2026-10`);
    expect(assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx([slug, `${slug}-2026`, `${slug}-2026-10`])).slug).toBe(`${slug}-2026-10-05`);
  });

  it('fails closed when every slug is taken, and when the date of the run is not a day', () => {
    const slug = 'fixture-robotics-ships-its-fx-1-warehouse-arm-to-a-second-plant';
    const all = [slug, `${slug}-2026`, `${slug}-2026-10`, `${slug}-2026-10-05`];
    expect(() => assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx(all))).toThrow('every candidate for the slug');
    expect(() => assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, { date: '2026-13-40', published: emptyPublished() })).toThrow('is not a real date');
  });

  it('fails when the title has no slug', () => {
    const reply = replyFromDraft();
    reply.title = { kind: 'fact', text: '???', claimIds: ['c-1'] };
    expect(() => assembleDraft(reply, GOLDEN_CLAIMS, ctx())).toThrow('has no letter or digit');
  });

  it('changes neither the reply nor the claims', () => {
    const reply = deepFreeze(replyFromDraft());
    const claims = deepFreeze(structuredClone(GOLDEN_CLAIMS));
    expect(() => assembleDraft(reply, claims, ctx())).not.toThrow();
  });

  it('gives a draft that shares nothing with the reply', () => {
    const reply = replyFromDraft();
    const draft = assembleDraft(reply, GOLDEN_CLAIMS, ctx());
    reply.title.text = 'changed';
    reply.opening[0]!.claimIds.push('c-99');
    expect(draft.title.text).not.toBe('changed');
    expect(draft.opening[0]?.claimIds).not.toContain('c-99');
  });
});

describe('finishDraft', () => {
  it('adds the same four things to any body, such as the body of an earlier draft whose sentences were replaced', () => {
    const { slug: _slug, publishedAt: _date, author: _author, limitations: _limitations, ...body } = GOLDEN_DRAFT as Draft;
    const draft = finishDraft(body, GOLDEN_CLAIMS, ctx());
    expect(draft).toEqual(assembleDraft(replyFromDraft(), GOLDEN_CLAIMS, ctx()));
  });
});
