import { describe, expect, it } from 'vitest';
import * as api from '../src';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput } from '../src/gate';
import { renderDraft, renderHead } from '../src/render';
import type { LedgerEntry } from '../src/schemas';
import { mutate } from './helpers';

// renderHead is the one place that says what the title and the description of a
// piece's frontmatter are: the title sentence and the description sentence of
// its ledger, with the spaces around them taken off. renderDraft writes the
// frontmatter with it and the site's build compares the file with it.

const ledgerOf = (input: GateInput): LedgerEntry =>
  renderDraft(input.draft, input.claims, { runId: 'fixture-run-1', gate: runGate(input, defaultContext()) }).ledger;

describe('renderHead', () => {
  const golden = cloneGolden();
  const ledger = ledgerOf(golden);

  it('gives the title sentence and the description sentence of the ledger', () => {
    expect(renderHead(ledger)).toEqual({
      title: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
      description: 'Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor.',
    });
    expect(renderHead(ledger)).toEqual({ title: golden.draft.title.text, description: golden.draft.description.text });
  });

  it('takes the spaces around each of them off, as the frontmatter schema does, and changes nothing else', () => {
    const spaced = structuredClone(ledger);
    for (const item of spaced.sentences) {
      if (item.section === 'title') item.text = `  ${item.text}\n`;
      if (item.section === 'description') item.text = `\t${item.text} `;
    }
    expect(renderHead(spaced)).toEqual(renderHead(ledger));
    const inner = structuredClone(ledger);
    inner.sentences[0]!.text = 'A  title   with  inner spaces';
    expect(renderHead(inner).title).toBe('A  title   with  inner spaces');
  });

  it('reads the sentences and not the title field of the ledger, which is what it is compared with', () => {
    const edited = { ...structuredClone(ledger), title: 'Another title' };
    expect(renderHead(edited)).toEqual(renderHead(ledger));
  });

  it('needs only the sentences of the ledger', () => {
    expect(renderHead({ sentences: ledger.sentences })).toEqual(renderHead(ledger));
  });

  it('finds the sentences wherever they stand in the list', () => {
    const reversed = { sentences: [...ledger.sentences].reverse() };
    expect(renderHead(reversed)).toEqual(renderHead(ledger));
  });

  it('does not change the ledger it is given', () => {
    const copy = structuredClone(ledger);
    renderHead(copy);
    expect(copy).toEqual(ledger);
  });

  it.each([
    ['title', 'no title sentence'],
    ['description', 'no description sentence'],
  ])('throws, saying so, when the ledger has no %s sentence', (section, message) => {
    const without = { sentences: ledger.sentences.filter((item) => item.section !== section) };
    expect(() => renderHead(without)).toThrow(`renderHead: the ledger has ${message}`);
  });

  it.each([
    ['title', 'title'],
    ['description', 'description'],
  ])('throws, saying so, when the ledger has two %s sentences, because it could not tell which is the field', (section, name) => {
    const twice = { sentences: [...ledger.sentences, ledger.sentences.find((item) => item.section === section)!] };
    expect(() => renderHead(twice)).toThrow(`renderHead: the ledger has 2 ${name} sentences, not 1`);
  });

  it('is part of the package index', () => {
    expect(api.renderHead).toBe(renderHead);
  });

  it('gives a draft that the schema would trim the same words as the renderer writes', () => {
    const padded = mutate(cloneGolden(), (g) => {
      g.draft.title.text = '  A title ';
      g.draft.description.text = ' A description. ';
    });
    expect(renderHead(ledgerOf(padded))).toEqual({ title: 'A title', description: 'A description.' });
  });
});
