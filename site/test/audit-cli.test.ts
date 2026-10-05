import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../scripts/audit.mjs';
import { smallPage, smallSite } from './support/small-site';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** Write the small site, with `changes`, into a new folder and return the folder. */
function build(changes: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-cli-'));
  folders.push(dir);
  for (const [file, text] of Object.entries(smallSite(changes))) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

/** Run the audit and return its exit code and everything it printed. */
function audit(args: string[]): { code: number; output: string } {
  const lines: string[] = [];
  const code = main(args, (text: string) => lines.push(text));
  return { code, output: lines.join('\n') };
}

describe('the audit command', () => {
  it('exits 0 and says it passed for a site that keeps every rule', () => {
    const { code, output } = audit(['--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('Passed: 16 checks.');
    expect(output).toContain('ok    A1');
    expect(output).not.toContain('production build');
  });

  it('runs the fixture check as well with --prod', () => {
    const { code, output } = audit(['--prod', '--dir', build()]);
    expect(code).toBe(0);
    expect(output).toContain('(production build)');
    expect(output).toContain('Passed: 17 checks.');
  });

  it('exits 1 and prints the problem under its check when a rule is broken', () => {
    const dir = build({ 'index.html': smallPage('/', 'Home', '<p><img src="data:," alt=""></p>') });
    const { code, output } = audit(['--dir', dir]);
    expect(code).toBe(1);
    expect(output).toContain('FAIL  A4');
    expect(output).toContain('- index.html: has an <img> element');
    expect(output).toContain('FAILED: 1 problem in 1 of 16 checks.');
  });

  it('lets fixture content through without --prod and stops it with --prod', () => {
    const dir = build({ 'index.html': smallPage('/', 'Home', '<p>Fixture Robotics</p>') });
    expect(audit(['--dir', dir]).code).toBe(0);
    const { code, output } = audit(['--prod', '--dir', dir]);
    expect(code).toBe(1);
    expect(output).toContain('FAIL  A13');
    expect(output).toContain('- index.html: contains "Fixture Robotics"');
  });

  it('names the folder it checked, as an absolute path when the folder is outside the current one', () => {
    const dir = build();
    expect(audit(['--dir', dir]).output.split('\n')[0]).toBe(`Audit of ${dir}: 3 pages, 8 files`);
  });

  it('exits 2 and shows how to use it for a flag it does not know', () => {
    const { code, output } = audit(['--fast']);
    expect(code).toBe(2);
    expect(output).toContain('Unknown option: --fast');
    expect(output).toContain('Usage: node site/scripts/audit.mjs [--prod] [--dir <folder>]');
  });

  it('exits 2 when --dir has no folder after it', () => {
    const { code, output } = audit(['--dir']);
    expect(code).toBe(2);
    expect(output).toContain('--dir needs a folder');
  });

  it('exits 2 and says to build the site first when the folder is not there', () => {
    const { code, output } = audit(['--dir', path.join(tmpdir(), 'robywire-no-such-folder')]);
    expect(code).toBe(2);
    expect(output).toContain('Build the site first.');
  });
});
