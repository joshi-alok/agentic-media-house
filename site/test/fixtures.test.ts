import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DeskState, LIMITATION_MAX_CLAIMS, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { fixtureFiles, fixturePieces, main, writeFixtures } from '../scripts/generate-fixtures';
import { receiptsView } from '../src/lib/receipts';

// The fixture pieces are what the site shows when it is built with
// ROBYWIRE_FIXTURES=1. They are generated, never written by hand, and every
// one of them has passed the whole gate.

const GOLDEN_SLUG = GOLDEN_DRAFT.slug;
const SLUGS = [
  GOLDEN_SLUG,
  'fixture-robotics-ships-fx-2-to-second-plant',
  'fixture-robotics-ships-fx-3-to-second-plant',
  'fixture-robotics-ships-fx-4-to-second-plant',
  'fixture-robotics-ships-fx-5-to-second-plant',
];
// The fifth piece rests on another outlet's reporting. The model check could not tell if a sentence was supported, so it was held, and the owner released it.
const HELD_SLUG = SLUGS[4]!;

const scratch: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-fixtures-'));
  scratch.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const files = fixtureFiles();
const text = (name: string): string => {
  const content = files.get(name);
  if (content === undefined) throw new Error(`no fixture file ${name}`);
  return content;
};

describe('fixtureFiles: what is generated', () => {
  it('has a piece and a ledger for each of the five slugs, and the desk state', () => {
    expect([...files.keys()].sort()).toEqual(
      [...SLUGS.flatMap((slug) => [`news/${slug}.mdx`, `ledger/${slug}.json`]), 'desk-state.json'].sort(),
    );
  });

  it('lists the files in a fixed order', () => {
    const names = [...files.keys()];
    expect(names).toEqual([...names].sort());
  });

  it('generates identical files every time', () => {
    expect([...fixtureFiles().entries()]).toEqual([...files.entries()]);
  });

  it('ends every file with a single newline', () => {
    for (const [name, content] of files) {
      expect(content.endsWith('\n'), name).toBe(true);
      expect(content.endsWith('\n\n'), name).toBe(false);
    }
  });
});

describe('fixtureFiles: a fixture must be publishable', () => {
  it('stops, naming the piece and the failure, when a piece does not pass the gate', () => {
    const broken = fixturePieces();
    broken[1]!.input.draft.takeaways[0]!.claimIds = [];
    expect(() => fixtureFiles(broken)).toThrow(
      'generate-fixtures: the fixture fixture-robotics-ships-fx-2-to-second-plant is not cleared by the gate (route revise: G3_NO_CLAIM',
    );
  });

  it('stops when the piece that the owner released is not cleared by the gate either', () => {
    const failing = fixturePieces();
    failing[4]!.input.draft.takeaways[0]!.claimIds = [];
    expect(() => fixtureFiles(failing)).toThrow(`generate-fixtures: the fixture ${HELD_SLUG} is not cleared by the gate (route revise: G3_NO_CLAIM`);
  });

  it('writes a piece that the gate clears and the owner released as a hold, with the reason of the model check, as the hold flow writes it', () => {
    const released = fixturePieces();
    released[4] = { ...released[0]!, slug: HELD_SLUG, runId: 'fixture-run-5', route: 'hold' };
    const ledger = LedgerEntry.parse(JSON.parse(fixtureFiles(released).get(`ledger/${HELD_SLUG}.json`) as string));
    expect(ledger.release).toBe('owner');
    expect(ledger.gate.route).toBe('hold');
    expect(ledger.gate.holdReasons).toEqual(['G10_AMBIGUOUS']);
    expect(ledger.gate.checks).toEqual({ G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' });
  });
});

describe('fixtureFiles: the pieces', () => {
  it('dates the golden piece 4 Oct 2026 and the variants one day earlier each, the last one two', () => {
    const dates = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).publishedAt);
    expect(dates).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01', '2026-09-29']);
  });

  it('files the golden piece under industrial-warehouse and funding, and gives the others other beats', () => {
    const categories = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).categories);
    expect(categories).toEqual([
      ['industrial-warehouse', 'funding'],
      ['humanoids'],
      ['policy-standards'],
      ['home-consumer', 'field-mobility'],
      ['policy-standards', 'funding'],
    ]);
  });

  it.each(SLUGS.map((slug, at) => [slug, at + 1, at === 4 ? 'hold' : 'publish'] as const))('%s: ledger and MDX agree and the gate said %s', (slug, run, route) => {
    const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
    expect(ledger.slug).toBe(slug);
    expect(ledger.runId).toBe(`fixture-run-${run}`);
    expect(ledger.gate.route).toBe(route);
    expect(Object.values(ledger.gate.checks).every((result) => result === 'pass')).toBe(true);

    const mdx = text(`news/${slug}.mdx`);
    const front = NewsFrontmatter.parse(parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(mdx)![1]!));
    expect(front.title).toBe(ledger.title);
    expect(front.publishedAt).toBe(ledger.publishedAt);
    expect(front.categories).toEqual(ledger.categories);
    expect(mdx).toContain(`](/news/${slug}/receipts/#c-1)`);
  });

  it('gives the corrected piece an updatedAt on the day of its correction, and no other piece one', () => {
    const frontmatter = (slug: string) => NewsFrontmatter.parse(parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(text(`news/${slug}.mdx`))![1]!));
    const state = DeskState.parse(JSON.parse(text('desk-state.json')));
    expect(state.corrections[0]!.at.slice(0, 10)).toBe('2026-10-03');
    expect(frontmatter(SLUGS[1]!).updatedAt).toBe('2026-10-03');
    expect(text(`news/${SLUGS[1]}.mdx`)).toContain('publishedAt: "2026-10-03"\nupdatedAt: "2026-10-03"\ncategories:');
    for (const slug of [SLUGS[0]!, SLUGS[2]!, SLUGS[3]!]) expect(frontmatter(slug).updatedAt, slug).toBeUndefined();
  });

  it('names a different product in each piece', () => {
    const titles = SLUGS.map((slug) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`))).title);
    expect(titles.map((title) => /FX-(\d)/.exec(title)![1])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('only cites sources on .example domains, so nothing in a fixture can be mistaken for a real source', () => {
    for (const slug of SLUGS) {
      const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));
      for (const source of ledger.sources) expect(new URL(source.url).hostname.endsWith('.example'), source.url).toBe(true);
    }
  });

  it('dates each variant retrieval on the day of that variant', () => {
    const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${SLUGS[1]}.json`)));
    expect(ledger.sources.every((source) => source.retrievedAt === '2026-10-03T04:30:00Z')).toBe(true);
  });
});

describe('fixtureFiles: the limitation sentences', () => {
  const ledgerOf = (slug: string) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));

  it.each(SLUGS)('cover at most four claims each in %s', (slug) => {
    const sentences = ledgerOf(slug).sentences.filter((sentence) => sentence.section === 'limitations');
    expect(sentences.length).toBeGreaterThanOrEqual(9);
    for (const sentence of sentences) expect(sentence.claimIds.length, sentence.text).toBeLessThanOrEqual(LIMITATION_MAX_CLAIMS);
  });

  it('name a claim that has no number by its label alone, not by the name or the date it lists', () => {
    const texts = ledgerOf(GOLDEN_SLUG).sentences.filter((sentence) => sentence.section === 'limitations').map((sentence) => sentence.text);
    expect(texts).toContain(
      'The second plant, deliveries started, existing conveyor frames and $38,000 per arm figures come from a company press release; no independent measurement was available.',
    );
    expect(texts.join(' ')).not.toContain('1 October 2026');
  });
});

describe('fixtureFiles: how each piece was released', () => {
  const ledgerOf = (slug: string) => LedgerEntry.parse(JSON.parse(text(`ledger/${slug}.json`)));

  it('says the gate published the four ordinary pieces without a human', () => {
    expect(SLUGS.slice(0, 4).map((slug) => ledgerOf(slug).release)).toEqual(['auto', 'auto', 'auto', 'auto']);
  });

  it('says the owner released the fifth, which was held because the model check could not tell if a sentence was supported', () => {
    const ledger = ledgerOf(HELD_SLUG);
    expect(ledger.release).toBe('owner');
    expect(ledger.gate.route).toBe('hold');
    expect(ledger.gate.holdReasons).toEqual(['G10_AMBIGUOUS']);
  });
});

describe('fixtureFiles: the piece that rests on another outlet', () => {
  const ledger = LedgerEntry.parse(JSON.parse(text(`ledger/${HELD_SLUG}.json`)));
  const mdx = text(`news/${HELD_SLUG}.mdx`);

  it('cites one tier-2 claim, from a fictional outlet on a .example address, and no other claim of tier 2', () => {
    const tier2 = ledger.claims.filter((claim) => claim.source.tier === 2);
    expect(tier2.map((claim) => [claim.id, claim.source.outlet])).toEqual([['c-19', 'Mercer Wire']]);
    expect(new URL(tier2[0]!.source.url).hostname).toBe('mercer-wire.example');
    expect(ledger.sources.filter((source) => source.tier === 2)).toHaveLength(1);
  });

  it('writes the sentence that rests on it as an attribution with the label Unconfirmed., and marks it in the ledger', () => {
    const marker = ledger.order.indexOf('c-19') + 1;
    expect(mdx).toContain(`**Unconfirmed.** Mercer Wire reports that 7 investors took part in the round.[${marker}](/news/${HELD_SLUG}/receipts/#c-19)`);
    expect(ledger.sentences.filter((sentence) => sentence.attributed === true).map((sentence) => sentence.claimIds)).toEqual([['c-19']]);
  });

  it('gives the claim the basis reported, and no tier-1 claim of the piece has it', () => {
    expect(ledger.claims.filter((claim) => claim.basis === 'reported').map((claim) => claim.id)).toEqual(['c-19']);
    expect(ledger.claims.filter((claim) => claim.source.tier === 1).every((claim) => claim.basis !== 'reported')).toBe(true);
  });

  it('covers it with a limitation sentence that names the outlet, and its receipt says reported, not filing', () => {
    const sentence = ledger.sentences.find((item) => item.section === 'limitations' && item.claimIds.includes('c-19'));
    expect(sentence?.text).toBe('The 7 investor count figure is reported by Mercer Wire and was not checked against a primary source.');
    expect(sentence?.claimIds).toEqual(['c-19']);
    const receipt = receiptsView(ledger).claims.find((claim) => claim.id === 'c-19');
    expect(receipt?.basis).toBe('reported');
    expect(receipt?.basis).not.toBe('filing');
  });

  it('shows on its receipt the passage of the outlet, word for word, and not the text of the claim, which still says what the filing said', () => {
    const receipt = receiptsView(ledger).claims.find((claim) => claim.id === 'c-19');
    expect(receipt?.quote).toBe('The offering drew 7 investors, according to people familiar with the filing.');
    expect(receipt?.label).toBe('investor count');
    expect(receipt).not.toHaveProperty('text');
    expect(ledger.claims.find((claim) => claim.id === 'c-19')?.text).toBe('Seven investors took part in the offering.');
  });

  it('is the only piece with the label: the four others rest on first-hand sources only', () => {
    for (const slug of SLUGS.slice(0, 4)) expect(text(`news/${slug}.mdx`), slug).not.toContain('Unconfirmed');
  });

  it('dates its retrieval on the day of the piece', () => {
    expect(ledger.sources.every((source) => source.retrievedAt === '2026-09-29T04:30:00Z')).toBe(true);
  });
});

describe('fixtureFiles: the desk state', () => {
  const state = DeskState.parse(JSON.parse(text('desk-state.json')));

  it('records a published last run for the golden piece', () => {
    expect(state.lastRun).toEqual({ at: '2026-10-04T04:41:12Z', outcome: 'published', runId: 'fixture-run-1', slug: GOLDEN_SLUG });
  });

  it('records two holds, with a gate code and the reason of the model check: the first on a day with no piece, the second released by the owner the same day', () => {
    expect(state.holds.map((hold) => hold.reasons)).toEqual([['G4_NUMBER_UNSUPPORTED'], ['G10_AMBIGUOUS']]);
    expect(state.holds.map((hold) => hold.at.slice(0, 10))).toEqual(['2026-09-30', '2026-09-29']);
    expect(state.holds[0]!.prUrl).toBe('https://github.example/agentic-media-house/agentic-media-house/pull/12');
    expect(state.holds[1]!.prUrl).toBeUndefined();
  });

  it('records one correction, against one of the fixture pieces', () => {
    expect(state.corrections).toHaveLength(1);
    expect(state.corrections[0]!.slug).toBe(SLUGS[1]);
    expect(state.corrections[0]!.kind).toBe('correction');
  });
});

describe('writeFixtures', () => {
  it('writes exactly the generated files under the folder it is given', () => {
    const dir = tempDir();
    const written = writeFixtures(dir);
    expect(written.sort()).toEqual([...files.keys()].sort());
    for (const [name, content] of files) expect(readFileSync(path.join(dir, name), 'utf8')).toBe(content);
  });

  it('removes a stale piece left over from an earlier run', () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'news'), { recursive: true });
    writeFileSync(path.join(dir, 'news', 'old-piece.mdx'), 'old\n');
    writeFixtures(dir);
    expect(existsSync(path.join(dir, 'news', 'old-piece.mdx'))).toBe(false);
  });
});

describe('main', () => {
  it('writes to the folder given with --out', () => {
    const dir = tempDir();
    main(['--out', dir]);
    expect(readFileSync(path.join(dir, 'desk-state.json'), 'utf8')).toBe(text('desk-state.json'));
  });

  it('refuses --out with no folder', () => {
    expect(() => main(['--out'])).toThrow('--out needs a folder');
  });

  it('refuses an argument it does not know', () => {
    expect(() => main(['--oops'])).toThrow('unknown argument: --oops');
  });
});
