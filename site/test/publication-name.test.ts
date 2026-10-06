import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLICATION_NAME, PUBLICATION_WORDMARK } from '@robywire/gate';
import { describe, expect, it } from 'vitest';

// The name of the publication is written once, in the gate package. Nothing in the code of the site writes it out:
// the header, the page titles, the footer, the structured data, the feed and the fact card take it from the constants,
// so that a change of name is one edit and no page can be left with the old one. The old name survives only in the
// names of things that the code is built from (the scope @robywire/*, the variable ROBYWIRE_FIXTURES and the folder that
// the fixture check makes in the temporary folder), and those are taken out of the text before it is searched.

const SITE = fileURLToPath(new URL('../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');
const CODE_FOLDERS = ['src/components', 'src/layouts', 'src/lib', 'src/pages', 'src/styles', 'scripts'];
const EM_DASH = String.fromCharCode(0x2014);

/** The text without the names that the old name is allowed to stay in. */
const withoutInternalNames = (text: string): string => text.replace(/@robywire\/[a-z]+|ROBYWIRE_FIXTURES|robywire-generated-/g, ''); // the names that it stays in, on purpose
const OLD_NAME = /robywire/i;
/** The lines of sources.yml that say where the list was copied from, which keep the name that the project had then. */
const PROVENANCE = /^# Provenance:|^# the robywire-astro project|per the Robywire docs/; // history, on purpose

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
  );
}

const sources = CODE_FOLDERS.flatMap((folder) => filesIn(path.join(SITE, folder)))
  .filter((file) => /\.(astro|ts|mjs|css)$/.test(file))
  .map((file) => ({ name: path.relative(SITE, file), text: readFileSync(file, 'utf8') }));
const textOf = (name: string): string => sources.find((source) => source.name === name)?.text ?? '';

describe('the code of the site', () => {
  it('looks at the pages, the components, the lib and the scripts, so the search is not made of nothing', () => {
    const names = sources.map((source) => source.name);
    expect(names).toContain(path.join('src', 'components', 'Header.astro'));
    expect(names).toContain(path.join('src', 'lib', 'card.ts'));
    expect(names).toContain(path.join('scripts', 'generate-fixtures.ts'));
    expect(sources.length).toBeGreaterThan(40);
  });

  it('does not write the name of the publication out: it takes it from the gate', () => {
    const offenders = sources.filter(({ text }) => /agentic\s+media\s+house/i.test(text)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('does not carry the old name, except in the names that it stays in and in the check of the audit that looks for it', () => {
    const offenders = sources
      .filter(({ name }) => name !== path.join('scripts', 'audit', 'checks-files.mjs'))
      .filter(({ text }) => OLD_NAME.test(withoutInternalNames(text)))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['src/components/Header.astro', 'PUBLICATION_WORDMARK'],
    ['src/lib/card.ts', 'PUBLICATION_WORDMARK'],
    ['src/layouts/Base.astro', 'PUBLICATION_NAME'],
    ['src/pages/index.astro', 'PUBLICATION_NAME'],
    ['src/pages/method/index.astro', 'PUBLICATION_NAME'],
    ['src/lib/format.ts', 'PUBLICATION_NAME'],
    ['src/lib/feed.ts', 'PUBLICATION_NAME'],
    ['src/lib/jsonld.ts', 'PUBLICATION_NAME'],
    ['src/lib/copy.ts', 'PUBLICATION_NAME'],
  ])('shows the name through the constant: %s uses %s', (file, constant) => {
    expect(textOf(path.join(...file.split('/')))).toContain(constant);
  });

  it('has the name of the publication twice in the head of every page: the share name and the title of the feed link', () => {
    const base = textOf(path.join('src', 'layouts', 'Base.astro'));
    expect(base).toContain('property="og:site_name" content={PUBLICATION_NAME}');
    expect(base).toContain('type="application/rss+xml" title={PUBLICATION_NAME}');
  });
});

describe('the files that say what the repository is', () => {
  it('has the name of the publication as the title of the README and in its first sentence', () => {
    const readme = read('README.md');
    expect(readme.startsWith(`# ${PUBLICATION_NAME}\n`)).toBe(true);
    expect(readme).toContain(`${PUBLICATION_NAME} is a robotics news site`);
  });

  it('has no old name in the README, except in the names that it stays in', () => {
    expect(withoutInternalNames(read('README.md'))).not.toMatch(OLD_NAME);
  });

  it.each(['package.json', 'site/package.json', 'desk/package.json'])('names the publication in the description of %s, and not the old name', (file) => {
    const { description } = JSON.parse(read(file)) as { description: string };
    expect(description).toContain(PUBLICATION_NAME);
    expect(withoutInternalNames(description)).not.toMatch(OLD_NAME);
  });

  it('puts the name of the publication in the title of the source registry, and keeps the old project name where it says where the list came from', () => {
    const registry = read('sources.yml');
    expect(registry).toContain(`# ${PUBLICATION_NAME} ${EM_DASH} source list for the daily desk`);
    const outside = registry.split('\n').filter((line) => !PROVENANCE.test(line));
    expect(outside.join('\n')).not.toMatch(OLD_NAME);
  });
});

describe('the wordmark', () => {
  it('is the name in capitals', () => {
    expect(PUBLICATION_WORDMARK).toBe(PUBLICATION_NAME.toUpperCase());
  });
});
