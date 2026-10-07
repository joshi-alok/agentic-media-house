import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { CHECK_IDS, CHECK_RESULTS, ROUTES, RUN_OUTCOMES } from '@robywire/gate';
import { z } from 'zod';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import { CLAIM_PROBLEM_CODES } from '../stages/claim-grounding';
import { CLIENT_KINDS, SOURCES_KINDS } from './artifacts';
import { writeFileAtomic } from './atomic';

// What a run leaves for the public. The artifacts of a workflow of a public repository can be read by anyone for as long as they are kept, and what a run writes in its folder is
// what models and sources wrote: the quotations of the claims, the sentences of every draft, the reasons of the model check, the replies that were recorded, the titles and the
// addresses of the pages. A cap on the length of one quotation (300 characters) bounds a quotation and not a thousand of them, and a reason that a verifier gives is as long as it likes.
// So the run is not uploaded. It is packed: `packRun` makes, of the folder of a run, one small JSON file for the run and one for each stage, and each is made by naming the
// fields that go in, one by one, and copying nothing else. What goes in is outcomes, the names of stages, counts, the codes that the checks give (a closed list, which the site has a
// label for), counts of the verdicts of the model check, hashes, numbers of bytes and durations. What never goes in is a reply of a model, a reason of the verifier, a sentence
// of a draft, a quotation, a title, an address or a word of a page: nothing that is free text. A field that a stage adds later is not in the pack until somebody adds it here, which is the
// point; a value that is not of the shape that a field has (a number that is not one, a code that is not on the list) is counted and not copied; and a pack that is bigger than the cap is
// an error and not a pack.

/** The most that the whole pack may hold, in bytes, and the most that one file of it may hold. A run that packs to more is an error: the pack is small by construction. */
export const MAX_PACK_BYTES = 24 * 1024;
export const MAX_PACK_FILE_BYTES = 8 * 1024;

const count = z.number().int().nonnegative().max(1_000_000);
const hash = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`));
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.iso.datetime({ offset: true });
const modelName = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const word = z.string().regex(/^[a-z][a-z0-9-]{0,15}$/);
const label = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,23}$/);
/** The name of a stage as its file has it: `04-extract`. */
const stageName = z.string().regex(/^\d{2}-[a-z][a-z0-9-]{0,30}$/);

/** The codes that a gate, a hold or a model check gives: the closed list that the site has a label for, and the codes of a claim that Extract drops. */
const GATE_CODES: ReadonlySet<string> = new Set(Object.keys(REASON_LABELS));
const CLAIM_CODES: ReadonlySet<string> = new Set(CLAIM_PROBLEM_CODES);
const gateCode = z.string().refine((code) => GATE_CODES.has(code), 'a code that the site has no label for');
const claimCode = z.string().refine((code) => CLAIM_CODES.has(code), 'a code that Extract does not give');

export const PackedRun = z.strictObject({
  version: z.literal(1),
  /** False for a folder that has no record of the run: the run did not end, and what is known of it is the stages that left a file. */
  ended: z.boolean(),
  runId: z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{6}$/).nullable(),
  date: isoDay.nullable(),
  startedAt: isoDateTime.nullable(),
  finishedAt: isoDateTime.nullable(),
  durationMs: count.nullable(),
  outcome: z.enum(RUN_OUTCOMES).nullable(),
  /** The stage that ended the run: one word. */
  stage: word.nullable(),
  dry: z.boolean().nullable(),
  client: z.enum(CLIENT_KINDS).nullable(),
  sources: z.enum(SOURCES_KINDS).nullable(),
  attempt: count.nullable(),
  commit: hash(40).nullable(),
  models: z.record(word, modelName),
  budget: z.strictObject({ limit: z.record(label, count), spent: z.record(label, count) }).nullable(),
  /** The stages that left a file that the pack could read, and how many files of each kind the folder has. */
  stages: z.array(stageName).max(20),
  unpacked: count,
  files: z.strictObject({ artifacts: count, held: count, cassettes: count, logLines: count }),
});
export type PackedRun = z.infer<typeof PackedRun>;

/** What every packed stage says of the file that it was made from: how long it was and its hash, so that whoever has the folder can tell that the pack is of it. */
const from = { sourceBytes: count, sourceSha256: hash(64) };

const verdicts = z.strictObject({ not_entailed: count, ambiguous: count, unsupported: count, missing: count });

export const PackedStage = z.discriminatedUnion('stage', [
  z.strictObject({ stage: z.literal('01-discover'), ...from, candidates: count, tier1: count, tier2: count, skipped: count }),
  z.strictObject({ stage: z.literal('02-select'), ...from, chosen: z.boolean(), chosenId: hash(12).nullable(), hasTier1: z.boolean(), shortlist: count }),
  z.strictObject({ stage: z.literal('03-fetch'), ...from, documents: z.array(z.strictObject({ tier: z.union([z.literal(1), z.literal(2)]), hash: hash(64), bytes: count })).max(20), failures: count }),
  z.strictObject({ stage: z.literal('04-extract'), ...from, claims: count, dropped: count, droppedByCode: z.record(claimCode, count), droppedOtherCodes: count }),
  z.strictObject({ stage: z.literal('05-compose'), ...from, drafts: count }),
  z.strictObject({
    stage: z.literal('06-verify'),
    ...from,
    outcome: z.enum(['publish', 'hold']),
    rounds: count,
    route: z.enum(ROUTES),
    checks: z.partialRecord(z.enum(CHECK_IDS), z.enum(CHECK_RESULTS)),
    failureCodes: z.array(gateCode).max(64),
    holdReasons: z.array(gateCode).max(16),
    otherCodes: count,
    verifier: z.strictObject({ model: modelName, passed: z.boolean(), notes: count }),
    history: z.array(z.strictObject({ round: count, route: z.enum(ROUTES), failureCodes: z.array(gateCode).max(64), verdicts, sent: count })).max(12),
  }),
]);
export type PackedStage = z.infer<typeof PackedStage>;

/** The files of a pack: the name of each, and its text exactly as it is written. */
export type Pack = Record<string, string>;

/** A pack that cannot be made, or is too big, and says why without saying anything that is in the run. */
export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackError';
  }
}

/** `data` read with a schema that names only what is wanted: the other fields are not read, whatever they hold. Undefined when it does not fit. */
function read<T>(schema: z.ZodType<T>, data: unknown): T | undefined {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const known = (codes: readonly string[], list: ReadonlySet<string>): string[] => unique(codes.filter((code) => list.has(code)));

// What each stage's file is read for. The shapes name the fields that are used; a field that is not named is not looked at.
const DISCOVER = z.object({ candidates: z.array(z.object({ tier: z.number() })), skipped: z.array(z.unknown()) });
const SELECT = z.object({ chosen: z.object({ id: z.string() }).nullable(), tier1Url: z.string().nullable(), shortlist: z.array(z.unknown()) });
const FETCH = z.object({ documents: z.array(z.unknown()), failures: z.array(z.unknown()) });
const DOCUMENT = z.object({ tier: z.union([z.literal(1), z.literal(2)]), hash: hash(64), bytes: count });
const EXTRACT = z.object({ claims: z.array(z.unknown()), dropped: z.array(z.object({ reasons: z.array(z.object({ code: z.string() })) })) });
const COMPOSE = z.object({ drafts: z.array(z.unknown()) });
const GATE = z.object({ route: z.enum(ROUTES), failures: z.array(z.object({ code: z.string() })), holdReasons: z.array(z.string()), checks: z.record(z.string(), z.string()) });
const VERIFY = z.object({
  outcome: z.enum(['publish', 'hold']),
  rounds: count,
  gate: GATE,
  verifier: z.object({ model: z.string(), passed: z.boolean(), notes: z.array(z.unknown()) }),
  history: z.array(z.object({ round: count, gate: GATE, verifierFailures: z.array(z.object({ code: z.string() })), sent: z.array(z.unknown()) })),
});

/** The packed stage that the artifact `name` (`06-verify`) is, or undefined for a stage that the pack does not know or an artifact that does not have the fields that its stage has. */
function packStage(name: string, text: string, data: unknown): PackedStage | undefined {
  const origin = { sourceBytes: Buffer.byteLength(text, 'utf8'), sourceSha256: sha256(text) };
  if (name === '01-discover') {
    const found = read(DISCOVER, data);
    if (found === undefined) return undefined;
    return { stage: name, ...origin, candidates: found.candidates.length, tier1: found.candidates.filter((candidate) => candidate.tier === 1).length, tier2: found.candidates.filter((candidate) => candidate.tier === 2).length, skipped: found.skipped.length };
  }
  if (name === '02-select') {
    const found = read(SELECT, data);
    if (found === undefined) return undefined;
    const id = found.chosen?.id;
    return { stage: name, ...origin, chosen: found.chosen !== null, chosenId: id !== undefined && /^[0-9a-f]{12}$/.test(id) ? id : null, hasTier1: found.tier1Url !== null, shortlist: found.shortlist.length };
  }
  if (name === '03-fetch') {
    const found = read(FETCH, data);
    if (found === undefined) return undefined;
    return { stage: name, ...origin, documents: found.documents.flatMap((document) => read(DOCUMENT, document) ?? []).slice(0, 20), failures: found.failures.length };
  }
  if (name === '04-extract') {
    const found = read(EXTRACT, data);
    if (found === undefined) return undefined;
    const codes = found.dropped.flatMap((claim) => claim.reasons.map((reason) => reason.code));
    const droppedByCode: Record<string, number> = {};
    for (const code of codes) if (CLAIM_CODES.has(code)) droppedByCode[code] = (droppedByCode[code] ?? 0) + 1;
    return { stage: name, ...origin, claims: found.claims.length, dropped: found.dropped.length, droppedByCode, droppedOtherCodes: codes.filter((code) => !CLAIM_CODES.has(code)).length };
  }
  if (name === '05-compose') {
    const found = read(COMPOSE, data);
    return found === undefined ? undefined : { stage: name, ...origin, drafts: found.drafts.length };
  }
  if (name === '06-verify') {
    const found = read(VERIFY, data);
    if (found === undefined) return undefined;
    const checks: Partial<Record<(typeof CHECK_IDS)[number], (typeof CHECK_RESULTS)[number]>> = {};
    for (const id of CHECK_IDS) {
      const result = found.gate.checks[id];
      if (result === 'pass' || result === 'fail') checks[id] = result;
    }
    const codes = [...found.gate.failures.map((failure) => failure.code), ...found.gate.holdReasons];
    const asked = (pass: (typeof found.history)[number], code: string): number => pass.verifierFailures.filter((failure) => failure.code === code).length;
    return {
      stage: name,
      ...origin,
      outcome: found.outcome,
      rounds: found.rounds,
      route: found.gate.route,
      checks,
      failureCodes: known(
        found.gate.failures.map((failure) => failure.code),
        GATE_CODES,
      ),
      holdReasons: known(found.gate.holdReasons, GATE_CODES),
      otherCodes: codes.filter((code) => !GATE_CODES.has(code)).length,
      verifier: { model: modelName.safeParse(found.verifier.model).success ? found.verifier.model : 'unknown', passed: found.verifier.passed, notes: found.verifier.notes.length },
      history: found.history.slice(0, 12).map((pass) => ({
        round: pass.round,
        route: pass.gate.route,
        failureCodes: known(
          pass.gate.failures.map((failure) => failure.code),
          GATE_CODES,
        ),
        verdicts: { not_entailed: asked(pass, 'not_entailed'), ambiguous: asked(pass, 'ambiguous'), unsupported: asked(pass, 'unsupported'), missing: asked(pass, 'missing') },
        sent: pass.sent.length,
      })),
    };
  }
  return undefined;
}

const RECORD = z.object({
  runId: z.string(),
  date: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  outcome: z.string(),
  stage: z.string(),
  dry: z.boolean(),
  commit: z.string().nullable(),
  client: z.string().optional(),
  sources: z.string().optional(),
  attempt: z.number().optional(),
  models: z.record(z.string(), z.unknown()),
  budget: z.object({ limit: z.record(z.string(), z.unknown()), spent: z.record(z.string(), z.unknown()) }),
  log: z.array(z.unknown()),
});

/** The entries of `record` whose name and value have the shapes that the pack allows, and no others. */
function pick<V>(record: Record<string, unknown>, key: z.ZodType<string>, value: z.ZodType<V>): Record<string, V> {
  const kept: Record<string, V> = {};
  for (const [name, item] of Object.entries(record)) {
    const parsedKey = key.safeParse(name);
    const parsedValue = value.safeParse(item);
    if (parsedKey.success && parsedValue.success) kept[name] = parsedValue.data;
  }
  return kept;
}

/** The names of the files of a folder that is there, in order, and nothing of what they hold. A folder that is not there has none. */
async function namesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** `data` as the field of the packed run that it is, or null when it is not the shape that the field has. */
const field = <T>(schema: z.ZodType<T>, data: unknown): T | null => {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

/**
 * Pack the run in the folder `runDir`: `run.json` (what the record of the run says, as outcomes, names, counts and hashes) and one file for each stage whose artifact is there and has the
 * fields that its stage has. Reads `run.json` and the artifacts `NN-name.json` of the folder, and the names of the files of `held/` and `cassettes/`; reads nothing else, and what it reads it
 * does not copy, but for what the shapes of this file name. Throws a `PackError` for a pack that is bigger than the caps (a file of it, or the whole), which are the constants above unless a test gives
 * smaller ones.
 */
export async function packRun(runDir: string, caps: { file: number; total: number } = { file: MAX_PACK_FILE_BYTES, total: MAX_PACK_BYTES }): Promise<Pack> {
  const names = await namesIn(runDir);
  const stageFiles = names.filter((name) => /^\d{2}-[a-z][a-z0-9-]*\.json$/.test(name));
  const files: Pack = {};
  const stages: string[] = [];
  let unpacked = 0;
  for (const file of stageFiles) {
    const stage = file.slice(0, -'.json'.length);
    const text = await readFile(path.join(runDir, file), 'utf8');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    const packed = data === undefined ? undefined : packStage(stage, text, data);
    const checked = packed === undefined ? undefined : PackedStage.safeParse(packed);
    if (checked === undefined || !checked.success) {
      unpacked += 1;
      continue;
    }
    stages.push(stage);
    files[file] = `${JSON.stringify(checked.data, null, 2)}\n`;
  }

  const held = (await namesIn(path.join(runDir, 'held'))).filter((name) => name.endsWith('.json')).length;
  const cassettes = (await namesIn(path.join(runDir, 'cassettes'))).filter((name) => name.endsWith('.json')).length;
  let record: z.infer<typeof RECORD> | undefined;
  try {
    record = read(RECORD, JSON.parse(await readFile(path.join(runDir, 'run.json'), 'utf8')));
  } catch {
    record = undefined;
  }
  const started = record === undefined ? undefined : Date.parse(record.startedAt);
  const finished = record === undefined ? undefined : Date.parse(record.finishedAt);
  const run = PackedRun.parse({
    version: 1,
    ended: record !== undefined,
    runId: field(PackedRun.shape.runId, record?.runId),
    date: field(PackedRun.shape.date, record?.date),
    startedAt: field(PackedRun.shape.startedAt, record?.startedAt),
    finishedAt: field(PackedRun.shape.finishedAt, record?.finishedAt),
    durationMs: started !== undefined && finished !== undefined && finished >= started ? field(count, finished - started) : null,
    outcome: field(PackedRun.shape.outcome, record?.outcome),
    stage: field(PackedRun.shape.stage, record?.stage),
    dry: record?.dry ?? null,
    client: field(PackedRun.shape.client, record?.client),
    sources: field(PackedRun.shape.sources, record?.sources),
    attempt: field(PackedRun.shape.attempt, record?.attempt),
    commit: field(PackedRun.shape.commit, record?.commit),
    models: record === undefined ? {} : pick(record.models, word, modelName),
    budget: record === undefined ? null : { limit: pick(record.budget.limit, label, count), spent: pick(record.budget.spent, label, count) },
    stages,
    unpacked,
    files: { artifacts: stageFiles.length, held, cassettes, logLines: record?.log.length ?? 0 },
  });
  files['run.json'] = `${JSON.stringify(run, null, 2)}\n`;

  let total = 0;
  for (const [file, text] of Object.entries(files)) {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > caps.file) throw new PackError(`the packed ${file} is ${bytes} bytes, and a file of a pack has at most ${caps.file}`);
    total += bytes;
  }
  if (total > caps.total) throw new PackError(`the pack is ${total} bytes, and a pack has at most ${caps.total}`);
  return files;
}

/**
 * Pack the run in `runDir` into the folder `outDir`, which is made and must be empty or not there (so that what is uploaded from it is the pack and nothing else), and must not be
 * inside the run or hold it. Returns the names of the files that were written and their size, or undefined when `runDir` is not there: a day that was done has no folder.
 */
export async function packArtifact(runDir: string, outDir: string): Promise<{ files: string[]; bytes: number } | undefined> {
  const inside = (outer: string, inner: string): boolean => {
    const relative = path.relative(path.resolve(outer), path.resolve(inner));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  };
  if (inside(runDir, outDir) || inside(outDir, runDir)) throw new PackError('the folder of the pack must not be the folder of the run, or inside it, or hold it');
  try {
    await readdir(runDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if ((await namesIn(outDir)).length > 0) throw new PackError('the folder of the pack is not empty, so what is uploaded from it would not be the pack alone');
  const pack = await packRun(runDir);
  await mkdir(outDir, { recursive: true });
  let bytes = 0;
  for (const [file, text] of Object.entries(pack)) {
    await writeFileAtomic(path.join(outDir, file), text);
    bytes += Buffer.byteLength(text, 'utf8');
  }
  return { files: Object.keys(pack).sort(), bytes };
}
