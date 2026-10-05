import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESK_AUTHOR_NAME, DESK_BYLINE_LABEL } from '@robywire/gate';

// The name of the Desk and the words of the byline are written once, in the
// gate package, because the byline is a claim about how a piece is made and the
// wording is the owner's to confirm. Nothing in the site's own code may repeat
// them: the article page and the structured data take them from the constants.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
// The generated fixture pieces carry the author in their frontmatter, as data.
const CODE_FOLDERS = ['components', 'layouts', 'lib', 'pages', 'styles'];

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
  );
}

const sources = CODE_FOLDERS.flatMap((folder) => filesIn(path.join(SRC, folder))).map((file) => ({
  name: path.relative(SRC, file),
  text: readFileSync(file, 'utf8'),
}));

describe('the byline constants', () => {
  it('are the ones the gate publishes', () => {
    expect(DESK_AUTHOR_NAME).toBe('Robywire Desk');
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
  });

  it('are not repeated as text anywhere in the site code', () => {
    const offenders = sources
      .filter(({ text }) => text.includes(DESK_AUTHOR_NAME) || text.includes(DESK_BYLINE_LABEL) || text.includes('source-verified'))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('are used by the article page and by the structured data', () => {
    const byName = new Map(sources.map(({ name, text }) => [name, text]));
    const page = byName.get(path.join('pages', 'news', '[slug]', 'index.astro'))!;
    expect(page).toContain('DESK_AUTHOR_NAME');
    expect(page).toContain('DESK_BYLINE_LABEL');
    expect(byName.get(path.join('lib', 'jsonld.ts'))).toContain('DESK_AUTHOR_NAME');
  });
});
