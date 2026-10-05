import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mdxToHast } from 'satteri';
import { cloneGolden, GOLDEN_DRAFT } from '@robywire/gate/fixtures';
import { defaultContext, escapeMdx, renderDraft, runGate } from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { markdownFeatures } from '../markdown-features.mjs';

// escapeMdx and the renderer are tested in the gate package as strings. This
// file runs their output through the MDX parser that Astro uses (Satteri) and
// checks what the parser sees: prose and the receipt markers, and nothing that
// could run, import or restyle the page.

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

// The parser is configured exactly as the site's build configures it.
const parse = (source: string): Node => mdxToHast(source, { features: markdownFeatures }) as unknown as Node;

/** Every node in the tree, parents before children. */
function nodes(node: Node): Node[] {
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

/** Nodes that are code or markup rather than prose: MDX expressions, JSX, imports, raw HTML. */
const liveNodes = (tree: Node): Node[] => nodes(tree).filter((node) => node.type.startsWith('mdx') || node.type === 'raw');

function textOf(node: Node): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** The elements of the tree other than the root's whitespace text. */
const elementNames = (tree: Node): string[] => nodes(tree).filter((node) => node.type === 'element').map((node) => node.tagName ?? '');

// Sentences a model might write, on purpose or by accident.
const HOSTILE = [
  'Plain sentence.',
  'It costs $38,000 & weighs 38 kg (about 84 lb).',
  'Use {braces} and <tags> and </end> and <!-- comment --> and {/* x */}',
  'Stars *a* **b** _c_ __d__ `code` ``x`` ~~s~~ ~t~ ~5 kg',
  'Link [a](http://x.example) ![i](y) [^1] [ref]: z',
  'AT&T R&D &copy; &amp; &#35; &lt;',
  'See www.example.com or http://a.example/x or https://a.example or me@x.example',
  '# Heading',
  '- item',
  '+ plus',
  '> quote',
  '1. one',
  '2) two',
  '=== x',
  '--- x',
  '***',
  '___',
  '| a | b |',
  'back\\slash and \\* already escaped',
  'import x from "y"',
  'export const a = 1',
  'imports and exports are fine',
  '$x$ $$y$$ ^sup^ :::note',
  '<script>alert(1)</script>',
  '{1+1}',
  '<Component prop={1} />',
  'Dashes -- and ellipsis ... and "quotes" and it\'s',
];

describe('the parser configuration', () => {
  it('keeps GitHub-flavoured Markdown off: it turns bare web addresses and email addresses into links, and no escape can stop that', () => {
    expect(markdownFeatures.gfm).toBe(false);
  });

  it('keeps smart punctuation off: the text on the page is the text the gate checked', () => {
    expect(markdownFeatures.smartPunctuation).toBe(false);
  });
});

describe('the detector', () => {
  it('sees code and markup in text that has not been escaped', () => {
    expect(liveNodes(parse('Hello {x} and <b>y</b>')).map((node) => node.type)).toEqual(['mdxTextExpression', 'mdxJsxTextElement']);
    expect(liveNodes(parse('import x from "y"')).map((node) => node.type)).toEqual(['mdxjsEsm']);
  });
});

describe('escapeMdx through the MDX parser', () => {
  it.each(HOSTILE)('reads %j as one paragraph of plain text, character for character', (sentence) => {
    const tree = parse(escapeMdx(sentence));
    expect(liveNodes(tree)).toEqual([]);
    const blocks = (tree.children ?? []).filter((node) => node.type === 'element');
    expect(blocks.map((node) => node.tagName)).toEqual(['p']);
    expect(textOf(blocks[0]!)).toBe(sentence);
    expect(elementNames(tree)).toEqual(['p']);
  });

  it('makes no heading, list, quote, table, rule, link or emphasis out of a multi-line text', () => {
    const tree = parse(escapeMdx('first\n# second\n- third\n1. fourth\n> fifth\n===\n---\n| a |\n|---|\nexport const x = 1'));
    expect(liveNodes(tree)).toEqual([]);
    expect(new Set(elementNames(tree))).toEqual(new Set(['p']));
  });
});

/** A rendered piece in which every sentence the gate does not read for markup is hostile. */
function hostilePiece(): string {
  const input: GateInput = cloneGolden();
  const texts = HOSTILE.filter((text) => !text.includes('\n'));
  let next = 0;
  for (const paragraph of input.draft.sections[0]!.paragraphs[0]!) {
    paragraph.text = texts[next++ % texts.length]!;
  }
  input.draft.takeaways[0]!.text = '# a heading in a takeaway';
  input.draft.opening[0]!.text = 'import everything from "the model"';
  return renderDraft(input.draft, input.claims, { runId: 'hostile', gate: runGate(input, defaultContext()) }).mdx;
}

describe('whole pieces through the MDX parser', () => {
  const fixtureDir = new URL('../src/content-fixtures/news/', import.meta.url);
  const fixtures = readdirSync(fixtureDir).map((name) => [name, readFileSync(new URL(name, fixtureDir), 'utf8')] as const);

  it.each(fixtures)('%s contains nothing live and only the elements a piece needs', (_name, mdx) => {
    const tree = parse(mdx);
    expect(liveNodes(tree)).toEqual([]);
    expect(new Set(elementNames(tree))).toEqual(new Set(['p', 'a', 'h2', 'ul', 'li', 'strong']));
    expect(elementNames(tree).filter((name) => name === 'h2')).toHaveLength(5);
  });

  it.each(fixtures)('%s links only to its own receipts page', (_name, mdx) => {
    const links = nodes(parse(mdx)).filter((node) => node.tagName === 'a');
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) expect(String(link.properties?.href)).toMatch(/^\/news\/[a-z0-9-]+\/receipts\/#c-\d+$/);
  });

  it('keeps a piece full of hostile sentences free of anything live, and its headings unchanged', () => {
    const tree = parse(hostilePiece());
    expect(liveNodes(tree)).toEqual([]);
    expect(elementNames(tree).filter((name) => name === 'h2')).toHaveLength(5);
    expect(elementNames(tree).filter((name) => name === 'h1')).toEqual([]);
    expect(elementNames(tree)).not.toContain('script');
    expect(nodes(tree).filter((node) => node.tagName === 'a').every((node) => String(node.properties?.href).startsWith(`/news/${GOLDEN_DRAFT.slug}/receipts/#c-`))).toBe(true);
  });
});
