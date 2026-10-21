import { defaultConfig, isProfileId, profileOverrides } from '@robywire/gate';
import type { GateConfig, ProfileId } from '@robywire/gate';
import { parse } from 'yaml';
import settings from '../../../desk.config.yml?raw';
import { DEFAULT_EXTRA_REVISION_ROUNDS, DEFAULT_MAX_REVISION_ROUNDS } from './revision-defaults';

// What the method page says about the gate is what the gate requires of the pieces that the Desk writes when it runs. A run is started with desk.config.yml, which names the kind of
// piece it writes (`profile: explainer`), and the gate holds a piece to the ranges of that profile. The defaults of the gate are the ranges of no kind of piece that is written, so the page
// must not print them. The site does not copy any number: it reads the name of the profile from the settings of the run, at build time, and the numbers from the gate. The rounds of
// revision are read the same way, from the same file, over the defaults of the Desk that revision-defaults.ts keeps (the site does not depend on the Desk).

/**
 * The profile that the settings name: `profile` in the text of a settings file (desk.config.yml by default); undefined when it names none, which is the defaults of the gate.
 * A name that the gate does not have is an error, so that the site does not build a page about a run that cannot start.
 */
export function runProfile(text: string = settings): ProfileId | undefined {
  const parsed: unknown = parse(text);
  const name = typeof parsed === 'object' && parsed !== null ? (parsed as { profile?: unknown }).profile : undefined;
  if (name === undefined) return undefined;
  if (typeof name !== 'string' || !isProfileId(name)) throw new Error(`desk.config.yml names the profile ${JSON.stringify(name)}, which the gate does not have`);
  return name;
}

/** The configuration of the gate for a kind of piece: the defaults, with the ranges of the profile laid over them; the defaults alone for none. */
export function gateConfigOf(profile: ProfileId | undefined): GateConfig {
  return { ...defaultConfig(), ...(profile === undefined ? {} : profileOverrides(profile)) };
}

/** The configuration of the gate that a run of the Desk uses: that of the profile named in desk.config.yml. */
export function runGateConfig(): GateConfig {
  return gateConfigOf(runProfile());
}

/**
 * How many times a run of the Desk sends a draft back to the composer: `maxRevisionRounds` and `extraRevisionRounds` of the settings (desk.config.yml by default), each the default of the Desk
 * when the file does not set it, added together. The extra rounds are only given while a problem that a sentence or a heading can mend is still there, so this is the most a draft gets.
 * A setting that is not a whole number of at least 0 is an error, so that the site does not build a page about a run that cannot start.
 */
export function runRevisionRounds(text: string = settings): number {
  const parsed: unknown = parse(text);
  const read = (key: 'maxRevisionRounds' | 'extraRevisionRounds', fallback: number): number => {
    const value = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)[key] : undefined;
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`desk.config.yml sets ${key} to ${JSON.stringify(value)}, which is not a whole number of rounds, 0 or more`);
    }
    return value;
  };
  return read('maxRevisionRounds', DEFAULT_MAX_REVISION_ROUNDS) + read('extraRevisionRounds', DEFAULT_EXTRA_REVISION_ROUNDS);
}
