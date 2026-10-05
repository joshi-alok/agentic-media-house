import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import * as api from '../src';
import { defaultContext } from '../src/config';
import { cloneGolden, makeTier2Variant } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput, GateResult } from '../src/gate';
import { LedgerEntry } from '../src/schemas';
import type { Draft } from '../src/schemas';
import { NewsFrontmatter, escapeMdx, renderBody, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
import { claimById, findSentence, mutate } from './helpers';

const SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';
const RECEIPTS = `/news/${SLUG}/receipts/`;

const passed = (input: GateInput): GateResult => runGate(input, defaultContext());
const metaFor = (input: GateInput, extra: Partial<RenderMeta> = {}): RenderMeta => ({
  runId: 'fixture-run-1',
  gate: passed(input),
  ...extra,
});
const render = (input: GateInput, extra: Partial<RenderMeta> = {}) => renderDraft(input.draft, input.claims, metaFor(input, extra));

/** The frontmatter text and the body of a rendered piece. */
function splitMdx(mdx: string): { frontmatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(mdx);
  if (match === null) throw new Error('the rendered piece has no frontmatter block');
  return { frontmatter: match[1]!, body: match[2]! };
}

/** The body as blocks, split on blank lines. */
const blocks = (mdx: string): string[] => splitMdx(mdx).body.trimEnd().split('\n\n');

describe('renderDraft: the golden piece', () => {
  const golden = cloneGolden();
  const { mdx, ledger } = render(golden);

  it('starts with the frontmatter, in the contract order, with quoted strings', () => {
    expect(splitMdx(mdx).frontmatter.split('\n')).toEqual([
      'title: "Fixture Robotics ships its FX-1 warehouse arm to a second plant"',
      'description: "Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor."',
      'publishedAt: "2026-10-04"',
      'categories: [industrial-warehouse, funding]',
      'format: news',
      'featured: false',
      'author:',
      '  name: "Robywire Desk"',
    ]);
  });

  it('writes updatedAt between publishedAt and categories when the meta has one, and nowhere else', () => {
    const updated = render(golden, { updatedAt: '2026-10-05' });
    expect(splitMdx(updated.mdx).frontmatter.split('\n')).toEqual([
      'title: "Fixture Robotics ships its FX-1 warehouse arm to a second plant"',
      'description: "Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor."',
      'publishedAt: "2026-10-04"',
      'updatedAt: "2026-10-05"',
      'categories: [industrial-warehouse, funding]',
      'format: news',
      'featured: false',
      'author:',
      '  name: "Robywire Desk"',
    ]);
    expect(splitMdx(updated.mdx).body).toBe(splitMdx(mdx).body);
    expect(updated.ledger).toEqual(ledger);
    expect(mdx).not.toContain('updatedAt');
  });

  it('accepts an update on the day of publication, and refuses one that is not a real date or comes before it', () => {
    expect(splitMdx(render(golden, { updatedAt: '2026-10-04' }).mdx).frontmatter).toContain('updatedAt: "2026-10-04"');
    expect(() => render(golden, { updatedAt: '2026-02-30' })).toThrow('renderDraft: updatedAt "2026-02-30" is not a real date in the form YYYY-MM-DD');
    expect(() => render(golden, { updatedAt: '5 Oct 2026' })).toThrow('renderDraft: updatedAt "5 Oct 2026" is not a real date');
    expect(() => render(golden, { updatedAt: '2026-10-03' })).toThrow('renderDraft: updatedAt "2026-10-03" is before publishedAt "2026-10-04"');
  });

  it('parses as YAML and satisfies NewsFrontmatter', () => {
    const data = parseYaml(splitMdx(mdx).frontmatter) as unknown;
    expect(NewsFrontmatter.parse(data)).toEqual({
      title: golden.draft.title.text,
      description: golden.draft.description.text,
      publishedAt: '2026-10-04',
      categories: ['industrial-warehouse', 'funding'],
      format: 'news',
      featured: false,
      author: { name: 'Robywire Desk' },
    });
  });

  it('has no H1, one Key takeaways heading, three section headings and one limitations heading', () => {
    const headings = splitMdx(mdx)
      .body.split('\n')
      .filter((line) => line.startsWith('#'));
    expect(headings).toEqual([
      '## Key takeaways',
      '## What shipped',
      '## What the customer reports',
      '## What the filing shows',
      "## What we couldn't verify",
    ]);
  });

  it('puts the opening sentences in one paragraph before the first heading', () => {
    const [opening] = blocks(mdx);
    expect(opening).not.toContain('\n');
    expect(opening!.startsWith('Fixture Robotics has begun shipping its FX-1 warehouse arm')).toBe(true);
    expect(opening!.match(/\]\(/g)).toHaveLength(5);
  });

  it('writes one bullet per takeaway', () => {
    const list = blocks(mdx)[2]!;
    expect(list.split('\n')).toHaveLength(golden.draft.takeaways.length);
    expect(list.split('\n').every((line) => line.startsWith('- '))).toBe(true);
  });

  it('writes one paragraph per paragraph of each section and one for the limitations', () => {
    const all = blocks(mdx);
    // opening, 2 for takeaways, then 1 + 3 + 1 + 3 + 1 + 2 for the sections, then 1 + 1 for the limitations
    expect(all).toHaveLength(1 + 2 + (1 + 3) + (1 + 3) + (1 + 2) + (1 + 1));
    const limitations = all[all.length - 1]!;
    expect(limitations.split(' ').length).toBeGreaterThan(40);
  });

  it('writes the limitations as one paragraph, each sentence followed by the markers of every claim it describes', () => {
    const marker = (id: string) => `[${ledger.order.indexOf(id) + 1}](${RECEIPTS}#${id})`;
    const expected = golden.draft.limitations.map((sentence) => `${escapeMdx(sentence.text)}${sentence.claimIds.map(marker).join('')}`).join(' ');
    expect(blocks(mdx).at(-1)).toBe(expected);
    // One marker for each claim a sentence describes: 8 datasheet claims, 12 press-release claims, 2 demo claims, 2 demonstrated and 5 planned.
    expect(blocks(mdx).at(-1)!.match(/\]\(/g)).toHaveLength(8 + 12 + 2 + 2 + 5);
  });

  it('follows each sentence with marker links to the receipts page, with no space before the first marker', () => {
    const opening = blocks(mdx)[0]!;
    expect(opening).toContain(`Tarnmoor.[1](${RECEIPTS}#c-1) The first site`);
  });

  it('numbers markers by the position of the claim in order and joins several markers with no space', () => {
    const opening = blocks(mdx)[0]!;
    expect(opening).toContain(`and a third site is planned.[2](${RECEIPTS}#c-23)[3](${RECEIPTS}#c-26) The company`);
  });

  it('labels the three analysis sentences and nothing else', () => {
    expect(mdx.split('**Analysis.** ')).toHaveLength(4);
    expect(mdx).toContain('**Analysis.** The measured rate sits below the datasheet maximum');
  });

  it('ends with exactly one newline and uses only newline line endings', () => {
    expect(mdx.endsWith('\n')).toBe(true);
    expect(mdx.endsWith('\n\n')).toBe(false);
    expect(mdx).not.toContain('\r');
  });

  it('is identical when rendered twice', () => {
    const again = render(cloneGolden());
    expect(again.mdx).toBe(mdx);
    expect(JSON.stringify(again.ledger)).toBe(JSON.stringify(ledger));
  });

  it('does not change the draft or the claims it was given', () => {
    const input = cloneGolden();
    render(input);
    expect(input).toEqual(cloneGolden());
  });
});

describe('renderDraft: the ledger', () => {
  const golden = cloneGolden();
  const result = passed(golden);
  const { ledger } = render(golden);

  it('parses with the LedgerEntry schema', () => {
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });

  it('carries the slug, run id, date, title and categories', () => {
    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.slug).toBe(SLUG);
    expect(ledger.runId).toBe('fixture-run-1');
    expect(ledger.publishedAt).toBe('2026-10-04');
    expect(ledger.title).toBe('Fixture Robotics ships its FX-1 warehouse arm to a second plant');
    expect(ledger.categories).toEqual(['industrial-warehouse', 'funding']);
  });

  it('lists every sentence in document order with its index, section and heading', () => {
    const located = allSentences(golden.draft);
    expect(ledger.sentences).toHaveLength(located.length);
    expect(ledger.sentences.map((s) => s.index)).toEqual(located.map((_s, at) => at));
    expect(ledger.sentences[0]).toEqual({ index: 0, section: 'title', paragraph: 0, kind: 'fact', text: golden.draft.title.text, claimIds: ['c-1'] });
    expect(ledger.sentences[1]!.section).toBe('description');
    const body = ledger.sentences.find((s) => s.section === 'body')!;
    expect(body.heading).toBe('What shipped');
    const last = ledger.sentences[ledger.sentences.length - 1]!;
    expect(last.section).toBe('limitations');
    expect(last.kind).toBe('limitation');
    expect(ledger.sentences.filter((s) => 'heading' in s).every((s) => s.section === 'body')).toBe(true);
  });

  it('numbers the paragraph of each sentence: the opening and the limitations are paragraph 0, each takeaway has its own, a section counts its paragraphs from 0', () => {
    const paragraphs = (section: string, heading?: string) =>
      ledger.sentences.filter((s) => s.section === section && (heading === undefined || s.heading === heading)).map((s) => s.paragraph);
    expect(new Set(paragraphs('opening'))).toEqual(new Set([0]));
    expect(paragraphs('takeaways')).toEqual([0, 1, 2, 3]);
    expect(new Set(paragraphs('limitations'))).toEqual(new Set([0]));
    expect(new Set(paragraphs('body', 'What shipped'))).toEqual(new Set([0, 1, 2]));
    expect(new Set(paragraphs('body', 'What the filing shows'))).toEqual(new Set([0, 1]));
    expect(paragraphs('title')).toEqual([0]);
  });

  it('orders the claims by first appearance in the body, then claims only the title or description cite', () => {
    expect(ledger.order.slice(0, 6)).toEqual(['c-1', 'c-23', 'c-26', 'c-17', 'c-18', 'c-8']);
    expect(new Set(ledger.order).size).toBe(ledger.order.length);
  });

  it('holds exactly the cited claims, in order, as full objects', () => {
    expect(ledger.claims.map((claim) => claim.id)).toEqual(ledger.order);
    expect(ledger.claims[0]).toEqual(claimById(golden.claims, 'c-1'));
  });

  it('lists each source url once, sorted by url, with the source of the first claim in order that uses it', () => {
    const urls = ledger.sources.map((source) => source.url);
    expect(urls).toEqual([...urls].sort());
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toHaveLength(5);
    expect(ledger.sources[0]).toEqual({
      url: 'https://brindle-logistics.example/news/ashvale-results',
      tier: 1,
      snapshotHash: claimById(golden.claims, 'c-23').source.snapshotHash,
      retrievedAt: '2026-10-04T04:30:00Z',
    });
  });

  it('records the gate result from the meta, without a verifier unless one is given', () => {
    expect(ledger.gate).toEqual({ route: result.route, checks: result.checks, holdReasons: result.holdReasons });
    expect('verifier' in ledger).toBe(false);
  });

  it('has no release unless the meta gives one, and records the one it gives', () => {
    expect('release' in ledger).toBe(false);
    expect(render(golden, { release: 'auto' }).ledger.release).toBe('auto');
    const tier2 = makeTier2Variant(cloneGolden());
    expect(render(tier2, { release: 'owner' }).ledger.release).toBe('owner');
    expect(LedgerEntry.parse(render(tier2, { release: 'owner' }).ledger).release).toBe('owner');
  });

  it('refuses a release the route of the gate contradicts: the page would say something false', () => {
    const tier2 = makeTier2Variant(cloneGolden());
    expect(() => render(tier2, { release: 'auto' })).toThrow('renderDraft: release "auto" needs a gate route of publish, but the route is hold');
    expect(() => render(golden, { release: 'owner' })).toThrow('renderDraft: release "owner" is for a piece the gate did not clear, but the route is publish');
  });

  it('passes a verifier through', () => {
    const verifier = { model: 'claude-sonnet-5-5', passed: true, notes: ['all sentences entailed'] };
    expect(render(golden, { verifier }).ledger.verifier).toEqual(verifier);
  });
});

describe('renderDraft: order and the claims that count as cited', () => {
  const investors = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.text === 'It lists 7 investors in the round.');

  it('appends a claim that only the title cites, after every claim the body cites', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[2]!.paragraphs[0] = g.draft.sections[2]!.paragraphs[0]!.filter((s) => s.text !== 'It lists 7 investors in the round.');
      g.draft.title.claimIds = ['c-1', 'c-19'];
    });
    const { ledger } = render(input);
    expect(ledger.order[ledger.order.length - 1]).toBe('c-19');
    expect(ledger.claims.map((claim) => claim.id)).toEqual(ledger.order);
  });

  it('leaves out a claim that nothing cites', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[2]!.paragraphs[0] = g.draft.sections[2]!.paragraphs[0]!.filter((s) => s.text !== 'It lists 7 investors in the round.');
    });
    expect(render(input).ledger.order).not.toContain('c-19');
  });

  it('repeats no marker when a sentence cites the same claim twice', () => {
    const input = mutate(cloneGolden(), (g) => {
      findSentence(g.draft, (s) => s.text === 'The filing records the first sale on 29 September 2026.').claimIds = ['c-16', 'c-16'];
    });
    const { mdx, ledger } = render(input);
    const marker = ledger.order.indexOf('c-16') + 1;
    expect(mdx).toContain(`29 September 2026.[${marker}](${RECEIPTS}#c-16) It lists 7 investors`);
  });

  it('throws, naming the claim, when a sentence cites a claim that does not exist', () => {
    const input = mutate(cloneGolden(), (g) => {
      investors(g).claimIds = ['c-99'];
    });
    expect(() => render(input)).toThrow('renderDraft: a sentence cites c-99, but no claim has that id');
  });

  it('writes no empty paragraph for an empty opening or empty takeaways', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.opening = [];
      g.draft.takeaways = [];
    });
    const { mdx } = render(input);
    expect(mdx).not.toContain('\n\n\n');
    expect(blocks(mdx)[0]).toBe('## What shipped');
  });

  it('omits the limitations heading when the draft has no limitation sentences', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.limitations = [];
    });
    expect(render(input).mdx).not.toContain("couldn't verify");
  });
});

describe('renderDraft: sentences that rest on another outlet', () => {
  const tier2 = makeTier2Variant(cloneGolden());
  const { mdx, ledger } = render(tier2);
  const attributed = 'Mercer Wire reports that 7 investors took part in the round.';

  it('puts the label Unconfirmed. before an attributed fact sentence, in the same form as the Analysis. label', () => {
    const marker = ledger.order.indexOf('c-19') + 1;
    expect(mdx).toContain(`**Unconfirmed.** ${attributed}[${marker}](${RECEIPTS}#c-19)`);
    expect(mdx).toContain(`) **Unconfirmed.** ${attributed}`);
    expect(mdx.split('**Unconfirmed.** ')).toHaveLength(2);
    expect(mdx.split('**Analysis.** ')).toHaveLength(4);
  });

  it('records attributed: true on that ledger sentence and on no other', () => {
    const flagged = ledger.sentences.filter((sentence) => 'attributed' in sentence);
    expect(flagged).toEqual([expect.objectContaining({ text: attributed, kind: 'fact', attributed: true, claimIds: ['c-19'] })]);
  });

  it('leaves a piece with no attributed sentence without the label and without the key', () => {
    const plain = render(cloneGolden());
    expect(plain.mdx).not.toContain('Unconfirmed');
    expect(plain.ledger.sentences.some((sentence) => 'attributed' in sentence)).toBe(false);
  });

  it('writes no label and no key for a sentence marked attributed: false', () => {
    const input = mutate(cloneGolden(), (g) => {
      const sentence = findSentence(g.draft, (item) => item.text === 'It lists 7 investors in the round.');
      if (sentence.kind === 'fact') sentence.attributed = false;
    });
    const result = render(input);
    expect(result.mdx).not.toContain('Unconfirmed');
    expect(result.ledger.sentences.some((sentence) => 'attributed' in sentence)).toBe(false);
  });

  it('puts the label inside a takeaway bullet, after the dash', () => {
    const input = mutate(tier2, (g) => {
      const sentence = g.draft.takeaways[0]!;
      if (sentence.kind === 'fact') sentence.attributed = true;
    });
    const bullet = blocks(render(input).mdx)[2]!.split('\n')[0]!;
    expect(bullet.startsWith('- **Unconfirmed.** Tarnmoor is the second')).toBe(true);
  });

  it('never gives a sentence both labels: an analysis sentence gets Analysis. only, and no key', () => {
    const input = mutate(tier2, (g) => {
      const sentence = findSentence(g.draft, (item) => item.kind === 'analysis');
      Object.assign(sentence, { attributed: true });
    });
    const result = render(input);
    expect(result.mdx).toContain('**Analysis.** The measured rate sits below');
    expect(result.mdx).toContain(') **Analysis.** The measured rate sits below');
    expect(result.mdx.split('**Unconfirmed.** ')).toHaveLength(2);
    expect(result.ledger.sentences.filter((sentence) => 'attributed' in sentence)).toHaveLength(1);
  });

  it('keeps the ledger valid against the LedgerEntry schema', () => {
    expect(LedgerEntry.parse(ledger)).toEqual(ledger);
  });
});

describe('renderBody: the body is a function of the ledger', () => {
  const golden = cloneGolden();
  const { mdx, ledger } = render(golden);
  const bodyOf = (text: string) => splitMdx(text).body;

  it('is exactly the body renderDraft writes, so the page and the ledger cannot say different things', () => {
    expect(renderBody(ledger)).toBe(bodyOf(mdx));
    expect(mdx.endsWith(`\n---\n\n${renderBody(ledger)}`)).toBe(true);
  });

  it('is exactly the body for the piece that rests on another outlet as well', () => {
    const tier2 = render(makeTier2Variant(cloneGolden()));
    expect(renderBody(tier2.ledger)).toBe(bodyOf(tier2.mdx));
    expect(renderBody(tier2.ledger)).toContain('**Unconfirmed.** Mercer Wire reports');
  });

  it('needs nothing but the ledger: a ledger read back from its JSON gives the same body', () => {
    const readBack = LedgerEntry.parse(JSON.parse(JSON.stringify(ledger)));
    expect(renderBody(readBack)).toBe(renderBody(ledger));
  });

  it('ends with one newline and starts with the opening paragraph, with no frontmatter', () => {
    const body = renderBody(ledger);
    expect(body.endsWith('\n')).toBe(true);
    expect(body.endsWith('\n\n')).toBe(false);
    expect(body.startsWith('Fixture Robotics has begun shipping its FX-1 warehouse arm')).toBe(true);
    expect(body).not.toContain('---');
  });

  it('follows the ledger: a sentence changed in the ledger is changed in the body', () => {
    const edited = structuredClone(ledger);
    edited.sentences.find((sentence) => sentence.text === 'It lists 7 investors in the round.')!.text = 'It lists 8 investors in the round.';
    expect(renderBody(edited)).toContain('It lists 8 investors in the round.');
    expect(renderBody(edited)).not.toBe(renderBody(ledger));
  });

  it('follows the paragraph numbers: moving a sentence to the next paragraph moves it in the body', () => {
    const edited = structuredClone(ledger);
    const first = edited.sentences.find((sentence) => sentence.section === 'body')!;
    edited.sentences.filter((sentence) => sentence.heading === first.heading && sentence.paragraph === 1).forEach((sentence) => (sentence.paragraph = 0));
    const count = (body: string) => body.trimEnd().split('\n\n').length;
    expect(count(renderBody(edited))).toBe(count(renderBody(ledger)) - 1);
  });

  it('numbers markers by the order of the ledger, so reordering the claims renumbers them', () => {
    const edited = structuredClone(ledger);
    edited.order = [...edited.order.slice(1), edited.order[0]!];
    expect(renderBody(edited)).toContain(`Tarnmoor.[${edited.order.length}](${RECEIPTS}#c-1) The first site`);
  });

  it('throws, naming the claim, when a sentence cites a claim that the order does not list', () => {
    const edited = structuredClone(ledger);
    edited.order = edited.order.filter((id) => id !== 'c-19');
    expect(() => renderBody(edited)).toThrow('renderBody: a sentence cites c-19, but the order of the ledger does not list it');
  });

  it('writes nothing for a part with no sentence, and no heading for a section with none', () => {
    const edited = structuredClone(ledger);
    edited.sentences = edited.sentences.filter((sentence) => sentence.section !== 'takeaways' && sentence.section !== 'limitations' && sentence.heading !== 'What shipped');
    const body = renderBody(edited);
    expect(body).not.toContain('Key takeaways');
    expect(body).not.toContain("couldn't verify");
    expect(body).not.toContain('What shipped');
    expect(body).toContain('## What the customer reports');
  });

  it('writes the takeaways heading and a bullet for a single takeaway', () => {
    const edited = structuredClone(ledger);
    const first = edited.sentences.find((sentence) => sentence.section === 'takeaways')!;
    edited.sentences = edited.sentences.filter((sentence) => sentence.section !== 'takeaways' || sentence === first);
    const lines = renderBody(edited).split('\n');
    expect(lines[lines.indexOf('## Key takeaways') + 2]!.startsWith(`- ${first.text}`)).toBe(true);
    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(1);
  });

  it('throws, naming the sentence, when a body sentence has no heading', () => {
    const edited = structuredClone(ledger);
    const body = edited.sentences.find((sentence) => sentence.section === 'body')!;
    delete body.heading;
    expect(() => renderBody(edited)).toThrow(`renderBody: the body sentence ${body.index} has no heading`);
  });
});

describe('renderDraft: a draft the ledger cannot tell apart', () => {
  const sentence = (text: string): Draft['opening'][number] => ({ kind: 'fact', text, claimIds: ['c-1'] });
  const withSections = (sections: Draft['sections']) =>
    mutate(cloneGolden(), (g) => {
      g.draft.sections = sections;
    });

  it('writes neighbouring sections that share a heading as one section, because the ledger holds them as one', () => {
    const { mdx, ledger } = render(
      withSections([
        { heading: 'Same', paragraphs: [[sentence('First.')]] },
        { heading: 'Same', paragraphs: [[sentence('Second.')]] },
        { heading: 'Other', paragraphs: [[sentence('Third.')]] },
      ]),
    );
    expect(splitMdx(mdx).body.split('\n').filter((line) => line.startsWith('## '))).toContain('## Same');
    expect(splitMdx(mdx).body.split('\n').filter((line) => line === '## Same')).toHaveLength(1);
    expect(ledger.sentences.filter((s) => s.heading === 'Same').map((s) => [s.text, s.paragraph])).toEqual([['First.', 0], ['Second.', 1]]);
    expect(renderBody(ledger)).toBe(splitMdx(mdx).body);
  });

  it('keeps two sections that share a heading apart when another section stands between them', () => {
    const { mdx } = render(
      withSections([
        { heading: 'Same', paragraphs: [[sentence('First.')]] },
        { heading: 'Other', paragraphs: [[sentence('Second.')]] },
        { heading: 'Same', paragraphs: [[sentence('Third.')]] },
      ]),
    );
    expect(splitMdx(mdx).body.split('\n').filter((line) => line === '## Same')).toHaveLength(2);
  });

  it('leaves out a section that has no sentence, heading and all', () => {
    const { mdx } = render(withSections([{ heading: 'Nothing here', paragraphs: [[]] }, { heading: 'Something', paragraphs: [[sentence('Text.')]] }]));
    expect(mdx).not.toContain('Nothing here');
    expect(mdx).toContain('## Something');
  });
});

describe('renderDraft: text that is not plain', () => {
  const dirty = (text: string) =>
    mutate(cloneGolden(), (g) => {
      findSentence(g.draft, (s) => s.text === 'It lists 7 investors in the round.').text = text;
    });

  it('escapes braces, angle brackets and asterisks in a sentence', () => {
    const { mdx } = render(dirty('It lists {7} investors <b>in</b> the *round*.'));
    expect(mdx).toContain('It lists \\{7\\} investors \\<b\\>in\\</b\\> the \\*round\\*.[');
    expect(mdx).not.toContain('<b>');
    expect(mdx).not.toContain('{7}');
  });

  it('escapes a heading', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[0]!.heading = 'What <shipped>';
    });
    expect(render(input).mdx).toContain('## What \\<shipped\\>');
  });

  it('keeps the ledger text exactly as written', () => {
    const { ledger } = render(dirty('It lists {7} investors.'));
    expect(ledger.sentences.some((s) => s.text === 'It lists {7} investors.')).toBe(true);
  });

  it('quotes a title with quotation marks and backslashes so that YAML reads it back unchanged', () => {
    const title = 'He said "go" and left C:\\temp';
    const input = mutate(cloneGolden(), (g) => {
      g.draft.title.text = title;
    });
    const data = parseYaml(splitMdx(render(input).mdx).frontmatter) as { title: string };
    expect(data.title).toBe(title);
  });

  it('refuses a category that is not a plain slug', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.categories = ['humanoids, funding'];
    });
    expect(() => render(input)).toThrow('renderDraft: the category "humanoids, funding" is not a plain slug');
  });
});

describe('NewsFrontmatter', () => {
  const valid = {
    title: 'A title',
    description: 'A description.',
    publishedAt: '2026-10-04',
    categories: ['humanoids'],
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };

  it('accepts a valid block', () => {
    expect(NewsFrontmatter.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['an empty title', { ...valid, title: '' }],
    ['a title of spaces', { ...valid, title: '   ' }],
    ['an empty description', { ...valid, description: '' }],
    ['a description of spaces', { ...valid, description: '   ' }],
    ['a description over 155 characters', { ...valid, description: 'x'.repeat(156) }],
    ['a date that is not a calendar date', { ...valid, publishedAt: '2026-02-30' }],
    ['no category', { ...valid, categories: [] }],
    ['four categories', { ...valid, categories: ['humanoids', 'funding', 'field-mobility', 'home-consumer'] }],
    ['a category outside the vocabulary', { ...valid, categories: ['robots'] }],
    ['the same category twice', { ...valid, categories: ['humanoids', 'humanoids'] }],
    ['funding without a beat', { ...valid, categories: ['funding'] }],
    ['another format', { ...valid, format: 'explainer' }],
    ['a key the contract does not know', { ...valid, image: 'x' }],
    ['an author without a name', { ...valid, author: { name: '' } }],
    ['an author that is not the Desk', { ...valid, author: { name: 'Jane Doe' } }],
  ])('rejects %s', (_label, data) => {
    expect(NewsFrontmatter.safeParse(data).success).toBe(false);
  });

  it('accepts an updatedAt on the day of publication or after it, and a block without one', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, updatedAt: '2026-10-04' }).success).toBe(true);
    expect(NewsFrontmatter.safeParse({ ...valid, updatedAt: '2026-11-01' }).success).toBe(true);
    expect(NewsFrontmatter.parse(valid)).not.toHaveProperty('updatedAt');
  });

  it.each([
    ['an updatedAt before the publication date', '2026-10-03'],
    ['an updatedAt that is not a calendar date', '2026-02-30'],
    ['an updatedAt written as words', '5 October 2026'],
    ['an updatedAt with a time', '2026-10-05T10:00:00Z'],
  ])('rejects %s', (_label, updatedAt) => {
    expect(NewsFrontmatter.safeParse({ ...valid, updatedAt }).success).toBe(false);
  });

  it('accepts a title and a description of one character', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, title: 'A', description: 'D' }).success).toBe(true);
  });

  it('accepts funding beside a beat, and three different categories', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, categories: ['funding', 'humanoids'] }).success).toBe(true);
    expect(NewsFrontmatter.safeParse({ ...valid, categories: ['humanoids', 'field-mobility', 'funding'] }).success).toBe(true);
  });

  it('trims the spaces around a title and a description, and counts the length after trimming', () => {
    const parsed = NewsFrontmatter.parse({ ...valid, title: '  A title ', description: ` ${'x'.repeat(155)} ` });
    expect(parsed.title).toBe('A title');
    expect(parsed.description).toBe('x'.repeat(155));
  });
});

describe('the package index', () => {
  it('exports the renderer, the escape function and the frontmatter schema', () => {
    expect(api.renderDraft).toBe(renderDraft);
    expect(typeof api.escapeMdx).toBe('function');
    expect(api.NewsFrontmatter).toBe(NewsFrontmatter);
  });
});
