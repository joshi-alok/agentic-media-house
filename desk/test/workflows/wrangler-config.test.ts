import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { secretsIn } from '../support/secrets';
import { ROOT } from '../support/workflow';

// `wrangler.jsonc` at the root of the repository is what `wrangler deploy` reads: the name of the Worker, the folder of the site that it serves, and nothing that is secret.
// The first deploy was made by hand, from a folder outside the workspace, with `--assets site/dist --name agentic-media-house`; wrangler refuses to run at the root of an npm
// workspace without a settings file (it says that its detection of the application "has been run in the root of a workspace"), and with this file it runs there. The file is
// held to the schema that the installed wrangler ships (`node_modules/wrangler/config-schema.json`), so that a setting that this version does not know fails here and not on GitHub.

const TEXT = readFileSync(`${ROOT}wrangler.jsonc`, 'utf8');
const SETTINGS = JSON.parse(TEXT) as { name: string; compatibility_date: string; workers_dev: boolean; assets: Record<string, string> } & Record<string, unknown>;
const SCHEMA = JSON.parse(readFileSync(`${ROOT}node_modules/wrangler/config-schema.json`, 'utf8')) as {
  definitions: { RawConfig: { properties: Record<string, unknown> }; Assets: { properties: Record<string, { enum?: string[] }> } };
};
const PKG = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { devDependencies: Record<string, string> };

describe('wrangler.jsonc: what it says', () => {
  it('names the Worker for the site, the day of the runtime it is made for, and the address at workers.dev', () => {
    expect(SETTINGS.name).toBe('agentic-media-house');
    expect(SETTINGS.compatibility_date).toBe('2026-10-01');
    expect(SETTINGS.workers_dev).toBe(true);
  });

  it('serves the folder that the production build of the site writes, and a page for an address that has none', () => {
    expect(path.resolve(ROOT, SETTINGS.assets.directory!)).toBe(path.join(ROOT, 'site', 'dist'));
    expect(SETTINGS.assets.not_found_handling).toBe('404-page');
    expect(SETTINGS.assets.html_handling).toBe('auto-trailing-slash');
  });

  it('is the folder that the build, and the audit of the build, use: astro writes dist below site, and the audit reads site/dist', () => {
    const astro = readFileSync(`${ROOT}site/astro.config.mjs`, 'utf8');
    expect(astro).not.toMatch(/outDir/);
    const siteScripts = (JSON.parse(readFileSync(`${ROOT}site/package.json`, 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(siteScripts.build).toMatch(/^astro build\b/);
    expect(readFileSync(`${ROOT}site/scripts/audit.mjs`, 'utf8')).toContain("path.join(SITE_DIR, 'dist')");
  });
});

describe('wrangler.jsonc: what it does not say', () => {
  it('has no setting but these, which are all that a Worker with static assets needs: no account, no route, no binding, no variable', () => {
    expect(Object.keys(SETTINGS).sort()).toEqual(['$schema', 'assets', 'compatibility_date', 'name', 'workers_dev']);
    expect(Object.keys(SETTINGS.assets).sort()).toEqual(['directory', 'html_handling', 'not_found_handling']);
  });

  it('holds no account id and no token: nothing in it is shaped like one, and no setting is named like one', () => {
    expect(secretsIn(TEXT)).toEqual([]);
    expect(TEXT).not.toMatch(/account|token|secret|key|password/i);
  });

  it('is plain JSON with no comment, so that it can be read by anything that reads JSON', () => {
    expect(TEXT.replace(/"[^"]*"/g, '""')).not.toMatch(/\/\/|\/\*/);
    expect([...TEXT].every((character) => character.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('wrangler.jsonc: against the program that reads it', () => {
  it('is the settings that the installed wrangler knows: every setting is in its schema, and a value that is a choice is one of its choices', () => {
    for (const key of Object.keys(SETTINGS)) expect(SCHEMA.definitions.RawConfig.properties, key).toHaveProperty(key);
    for (const key of Object.keys(SETTINGS.assets)) expect(SCHEMA.definitions.Assets.properties, key).toHaveProperty(key);
    expect(SCHEMA.definitions.Assets.properties.html_handling!.enum).toContain(SETTINGS.assets.html_handling);
    expect(SCHEMA.definitions.Assets.properties.not_found_handling!.enum).toContain(SETTINGS.assets.not_found_handling);
  });

  it('points $schema at the file that wrangler ships, which is there', () => {
    expect(existsSync(path.join(ROOT, SETTINGS.$schema as string))).toBe(true);
  });

  it('is read by the wrangler that the root package pins to one exact version, which is the one that is installed and the one that the lock file has', () => {
    const pinned = PKG.devDependencies.wrangler!;
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect((JSON.parse(readFileSync(`${ROOT}node_modules/wrangler/package.json`, 'utf8')) as { version: string }).version).toBe(pinned);
    const lock = JSON.parse(readFileSync(`${ROOT}package-lock.json`, 'utf8')) as { packages: Record<string, { version: string }> };
    expect(lock.packages['node_modules/wrangler']!.version).toBe(pinned);
  });
});
