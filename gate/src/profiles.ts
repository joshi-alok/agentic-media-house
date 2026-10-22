import type { GateConfig } from './config';

/**
 * The kinds of piece the gate is told apart by. `brief` is a short piece from one source and exists for tuning; `digest` and `explainer` are the two formats of the
 * publication.
 */
export const PROFILE_IDS = ['brief', 'digest', 'explainer'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

/** The thresholds that differ from one kind of piece to another. */
export type ProfileConfig = Pick<GateConfig, 'openingWords' | 'takeaways' | 'bodyWords' | 'analysisShareCap'>;

/**
 * The target of each kind of piece. The gate holds a piece to them as notes (G2_OPENING_LENGTH, G2_TAKEAWAYS_COUNT, G2_BODY_LENGTH, G7_ANALYSIS_SHARE are
 * in NOTE_CODES), so a profile can never make a piece unpublishable: it says what the writer is asked for and what the receipts page reports when a piece falls outside it.
 */
export const PROFILES: Readonly<Record<ProfileId, ProfileConfig>> = {
  brief: { openingWords: { min: 20, max: 60 }, takeaways: { min: 0, max: 5 }, bodyWords: { min: 150, max: 500 }, analysisShareCap: 0.3 },
  digest: { openingWords: { min: 15, max: 60 }, takeaways: { min: 0, max: 0 }, bodyWords: { min: 150, max: 500 }, analysisShareCap: 0.35 },
  explainer: { openingWords: { min: 40, max: 80 }, takeaways: { min: 3, max: 5 }, bodyWords: { min: 500, max: 1400 }, analysisShareCap: 0.4 },
};

/** Whether `value` is the id of a profile. */
export function isProfileId(value: string): value is ProfileId {
  return (PROFILE_IDS as readonly string[]).includes(value);
}

/** A fresh copy of the thresholds of a profile, for `defaultContext({ config })`. */
export function profileOverrides(id: ProfileId): ProfileConfig {
  return structuredClone(PROFILES[id]);
}
