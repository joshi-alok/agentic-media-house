import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deskIntro,
  disclosure,
  gateIntro,
  holdsText,
  meaningLimit,
  methodDisclosure,
  modelCheckText,
  notRunningNote,
  notRunningYet,
  ownerReleaseText,
  receiptsIntro,
  scoreboardCaveat,
  siteDescription,
  trialText,
} from '../src/lib/copy';
import { LIVE } from '../src/lib/live';
import type { Live } from '../src/lib/live';
import { releaseNote } from '../src/lib/receipts';

// The Desk is not running in Plan 1, and a page that says it is would be a lie. Every
// sentence of the site whose tense depends on a part of the Desk being live is written
// by a function in copy.ts that takes the LIVE switchboard. These tests say, with exact
// strings, what each function writes for every setting of the four flags, so that the
// present tense cannot come back by accident, and so that flipping a flag in Plan 2
// changes the copy and the tests together.

const FLAGS = ['evidenceStore', 'verifier', 'scheduler', 'publishing'] as const;

/** Every setting of the four flags: sixteen of them. */
const COMBOS: Live[] = Array.from({ length: 16 }, (_, n) => ({
  evidenceStore: (n & 1) !== 0,
  verifier: (n & 2) !== 0,
  scheduler: (n & 4) !== 0,
  publishing: (n & 8) !== 0,
}));
const name = (live: Live): string => FLAGS.map((flag) => `${flag}=${live[flag]}`).join(' ');
const CASES = COMBOS.map((live) => [name(live), live] as const);
const NONE: Live = { evidenceStore: false, verifier: false, scheduler: false, publishing: false };
const ALL: Live = { evidenceStore: true, verifier: true, scheduler: true, publishing: true };

describe('LIVE', () => {
  it('has the four flags, each true or false', () => {
    expect(Object.keys(LIVE).sort()).toEqual(['evidenceStore', 'publishing', 'scheduler', 'verifier']);
    for (const flag of FLAGS) expect(typeof LIVE[flag], flag).toBe('boolean');
  });

  it('has every flag off in Plan 1: nothing of the Desk runs yet. Plan 2 turns them on one by one, and changes this test with each', () => {
    expect(LIVE).toEqual(NONE);
  });

  it('is what every copy function uses when it is given no setting', () => {
    expect(receiptsIntro()).toBe(receiptsIntro(LIVE));
    expect(disclosure()).toBe(disclosure(LIVE));
    expect(siteDescription()).toBe(siteDescription(LIVE));
    expect(notRunningYet()).toEqual(notRunningYet(LIVE));
  });

  it('is tried here in all sixteen settings, no two alike', () => {
    expect(new Set(COMBOS.map(name)).size).toBe(16);
  });
});

describe('receiptsIntro', () => {
  const START =
    'Each sentence of the article links to the claims it rests on, listed below: the passage of the source that each claim rests on, word for word, and where and when that source was fetched.';
  const OFF = `${START} The full source snapshot will be kept in a private evidence store, which is not running yet; this public record keeps its hash, the retrieval time and the quoted passage.`;
  const ON = `${START} The full source snapshot is kept in a private evidence store; this public record keeps its hash, the retrieval time and the quoted passage.`;

  it.each(CASES)('says what the evidence store does only when it is live (%s)', (_name, live) => {
    expect(receiptsIntro(live)).toBe(live.evidenceStore ? ON : OFF);
  });

  it('says each sentence links to the claims it rests on, not each number to a claim', () => {
    expect(receiptsIntro(NONE)).not.toContain('Each number');
    expect(receiptsIntro(ALL)).not.toContain('Each number');
  });
});

describe('disclosure', () => {
  const OFF =
    'Robywire will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
  const ON =
    'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(disclosure(live)).toBe(live.publishing ? ON : OFF);
  });

  it.each([NONE, ALL])('names the pipeline and the rule, and claims no second model, human review or editor', (live) => {
    const text = disclosure(live);
    expect(text).toContain('automated pipeline');
    expect(text).toContain('every factual sentence');
    expect(text).toContain('primary source');
    expect(text).not.toMatch(/second model|verifier|independent|review|human|editor/i);
    expect(text.length).toBeLessThan(400);
  });
});

describe('siteDescription', () => {
  const OFF = 'A robotics news site built so that every factual sentence links to the passage of a primary source it rests on. An automated pipeline will write it.';
  const WRITTEN = 'Robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on.';
  const DAILY = 'Daily robotics news written by an automated pipeline. Every factual sentence links to the passage of a primary source that it rests on.';

  it.each(CASES)('claims a running service, and a daily one, only when they are live (%s)', (_name, live) => {
    expect(siteDescription(live)).toBe(!live.publishing ? OFF : live.scheduler ? DAILY : WRITTEN);
  });

  it('says nothing of a daily site while the schedule is off, in any setting', () => {
    for (const live of COMBOS.filter((item) => !item.scheduler)) expect(siteDescription(live)).not.toMatch(/daily/i);
  });

  it('is a description of a length a search result shows', () => {
    for (const live of COMBOS) expect(siteDescription(live).length).toBeLessThanOrEqual(160);
  });
});

describe('deskIntro', () => {
  const OFF =
    'Robywire is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
  const ON =
    'Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.';

  it.each(CASES)('is in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(deskIntro(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('methodDisclosure', () => {
  const OFF =
    "Every page says in its footer that the site will be written by an automated pipeline, and the byline of every article already names the Desk and says the piece is automated. No piece carries a human author's name, and none pretends to have been reported by a person.";
  const ON =
    "Every page says in its footer that the site is written by an automated pipeline, and the byline of every article says the same. No piece carries a human author's name, and none pretends to have been reported by a person.";

  it.each(CASES)('follows the footer (%s)', (_name, live) => {
    expect(methodDisclosure(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('gateIntro', () => {
  const OFF =
    'The gate is code, and it is built and tested. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published: the gate reports the exact failures, and the Desk will send the draft back for revision with them. In plain English the rules are these.';
  const ON =
    'The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published; it goes back for revision with the exact failures. In plain English the rules are these.';

  it.each(CASES)('says the revision loop runs only when the Desk does (%s)', (_name, live) => {
    expect(gateIntro(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('notRunningYet', () => {
  // The parts that do not run, each tied to the flag that says it does.
  const ITEMS: Record<(typeof FLAGS)[number], string[]> = {
    publishing: [
      'the pipeline that finds, fetches and writes stories',
      'the draft pull request that sends a held draft to the owner',
      "the owner's release of a held draft",
      'the command that records a correction or a retraction',
    ],
    evidenceStore: ['the private evidence store for the full text of each source'],
    verifier: ['the independent model check'],
    scheduler: ['the daily schedule'],
  };
  const FULL = [
    'the pipeline that finds, fetches and writes stories',
    'the private evidence store for the full text of each source',
    'the independent model check',
    'the daily schedule',
    'the draft pull request that sends a held draft to the owner',
    "the owner's release of a held draft",
    'the command that records a correction or a retraction',
  ];

  it('lists everything that is not live, in a fixed order, while nothing is', () => {
    expect(notRunningYet(NONE)).toEqual(FULL);
  });

  it('names the correction, the hold and the owner release, which the review found missing from the list', () => {
    const text = notRunningYet(NONE).join(' | ');
    expect(text).toContain('the command that records a correction or a retraction');
    expect(text).toContain('the draft pull request that sends a held draft to the owner');
    expect(text).toContain("the owner's release of a held draft");
  });

  it('lists nothing once every part is live', () => {
    expect(notRunningYet(ALL)).toEqual([]);
  });

  it.each(CASES)('lists exactly the parts whose flag is off (%s)', (_name, live) => {
    const expected = FULL.filter((item) => FLAGS.some((flag) => !live[flag] && ITEMS[flag].includes(item)));
    expect(notRunningYet(live)).toEqual(expected);
  });

  it.each(FLAGS)('drops exactly the items of %s when only that flag is turned on', (flag) => {
    const without = notRunningYet({ ...NONE, [flag]: true });
    expect(without).toEqual(FULL.filter((item) => !ITEMS[flag].includes(item)));
    expect(FULL.length - without.length).toBe(ITEMS[flag].length);
  });
});

describe('notRunningNote', () => {
  const NOTE =
    'Where this page says what the Desk does in the present tense, it describes a rule that the gate already enforces or the way the Desk is designed to behave; the parts that are not running are described in the future tense.';

  it.each(CASES)('is given exactly while some part is not running (%s)', (_name, live) => {
    expect(notRunningNote(live)).toBe(FLAGS.every((flag) => live[flag]) ? undefined : NOTE);
  });
});

describe('trialText', () => {
  const TEXT =
    'Before the Desk publishes on its own it will run for five days in shadow, writing and checking but publishing nothing, and then for fourteen days in public, and a short written report will cover that trial.';

  it.each(CASES)('is given only while the Desk does not publish (%s)', (_name, live) => {
    expect(trialText(live)).toBe(live.publishing ? undefined : TEXT);
  });
});

describe('modelCheckText', () => {
  const OFF =
    'On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a second layer on top of the nine rules, never the only one. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted. It is not running yet.';
  const ON =
    'On every piece, a second model call reads each factual sentence beside the passages it cites and judges whether they say the same thing, and whether the basis and status labels fit. It uses a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece is held. This check is a second layer on top of the nine rules, never the only one. Its accuracy was measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted, before it was relied on.';

  it.each(CASES)('is in the future tense until the verifier is live (%s)', (_name, live) => {
    expect(modelCheckText(live)).toBe(live.verifier ? ON : OFF);
  });
});

describe('holdsText', () => {
  const OFF =
    "The gate holds a piece when it cannot clear it: a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting, or, once the pipeline runs, a check still fails after two rounds of revision. A held draft is not published. It will go to the owner as a draft pull request that carries the gate report; that flow is not running yet.";
  const ON =
    "The gate holds a piece when it cannot clear it: a check still fails after two rounds of revision, or a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting. A held draft is not published. It goes to the owner as a draft pull request that carries the gate report.";

  it.each(CASES)('says the pull request flow is running only when the Desk publishes (%s)', (_name, live) => {
    expect(holdsText(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('ownerReleaseText', () => {
  const NOTE = releaseNote('owner');
  const OFF = `A held draft will be published only if the owner decides to release it, and the piece will then say so: its receipts page will read "${NOTE}", and each sentence that rests on another outlet will be labelled "Unconfirmed." in the article; the site already does both for a piece whose ledger says that the owner released it.`;
  const ON = `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${NOTE}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the article.`;

  it.each(CASES)('says the release happens only when the Desk publishes (%s)', (_name, live) => {
    expect(ownerReleaseText(live)).toBe(live.publishing ? ON : OFF);
  });

  it.each([NONE, ALL])('is one sentence', (live) => {
    const text = ownerReleaseText(live);
    expect(text).toMatch(/^[A-Z]/);
    expect(text.endsWith('.')).toBe(true);
    expect(text.slice(0, -1).replaceAll(/"[^"]*"/g, '')).not.toMatch(/[.!?](\s|$)/);
  });

  it('quotes what the receipts page of an owner-released piece says, so the two cannot drift apart', () => {
    expect(NOTE).toBe('Held by the gate, then released by the owner.');
    expect(ownerReleaseText(NONE)).toContain(`"${NOTE}"`);
    expect(ownerReleaseText(ALL)).toContain(`"${NOTE}"`);
  });
});

describe('scoreboardCaveat', () => {
  const START =
    'The scoreboard is a floor, not a proof. It measures the checks against defects that were seeded on purpose, not how accurate the Desk is on live stories: it says nothing about the defects that nobody thought to seed.';
  const OFF = `${START} The independent model check is not part of it; that check is not running yet, and its accuracy will be measured on its own labelled set.`;
  const ON = `${START} The independent model check is not part of it; its accuracy is measured on its own labelled set.`;

  it.each(CASES)('says the model check is not running only while it is not (%s)', (_name, live) => {
    expect(scoreboardCaveat(live)).toBe(live.verifier ? ON : OFF);
  });

  it('says what the README says: a floor, not a proof, and live accuracy is not measured', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('The scoreboard is a floor, not a proof.');
    for (const live of COMBOS) expect(scoreboardCaveat(live)).toContain('The scoreboard is a floor, not a proof.');
  });
});

describe('meaningLimit', () => {
  const START =
    'Meaning is not checked by code. The checks make sure that every figure, name and quotation in a sentence comes from a claim the sentence cites, not that the sentence says what the claim says, or that a paraphrase is fair.';
  const OFF = `${START} That will be the job of the independent model check, which is not running yet.`;
  const ON = `${START} That is the job of the independent model check.`;

  it.each(CASES)('hands meaning to the model check, in the tense of its flag (%s)', (_name, live) => {
    expect(meaningLimit(live)).toBe(live.verifier ? ON : OFF);
  });
});

// --- Where the copy may be written ---------------------------------------------------

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return /^(content|content-fixtures|data)$/.test(entry) ? [] : sourceFiles(full);
    return /\.(astro|ts)$/.test(entry) ? [full] : [];
  });
}

describe('the source of the site', () => {
  const files = sourceFiles(SRC).filter((file) => !['copy.ts', 'live.ts'].includes(path.basename(file)));

  it('looks at the pages, the components and the lib, so the scan is not made of nothing', () => {
    const names = files.map((file) => path.relative(SRC, file));
    expect(names).toContain(path.join('pages', 'method', 'index.astro'));
    expect(names).toContain(path.join('components', 'Footer.astro'));
    expect(names).toContain(path.join('lib', 'method.ts'));
    expect(files.length).toBeGreaterThan(20);
  });

  it('uses every function of copy.ts: a page, a component or the feed calls each one, so no old sentence is left beside a new one', () => {
    const exported = [...readFileSync(path.join(SRC, 'lib', 'copy.ts'), 'utf8').matchAll(/^export function (\w+)/gm)].map((match) => match[1]!);
    expect(exported.length).toBeGreaterThanOrEqual(14);
    const everything = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const name of exported) expect(everything, name).toContain(`${name}(`);
  });

  // Sentences that say a part of the Desk exists belong in copy.ts, behind a flag. A page or a
  // function elsewhere that writes one itself would not change when the flag does.
  it.each([
    ['the private evidence store', /evidence store/i],
    ['a pipeline that writes the site', /(?:is|are|will be) written by an automated pipeline/i],
    ['a daily site or schedule', /\bdaily\b/i],
    ['what each number links to', /Each number in the article/i],
  ])('has no file that writes a sentence about %s outside copy.ts and live.ts', (_what, pattern) => {
    const found = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => path.relative(SRC, file));
    expect(found).toEqual([]);
  });
});

describe('the description of the repository', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { description: string };

  it('does not call the site a running daily service while the schedule and the pipeline are off', () => {
    if (!LIVE.scheduler) expect(pkg.description).not.toMatch(/\bdaily\b/i);
    if (!LIVE.publishing) expect(pkg.description).not.toMatch(/\bwritten by\b/i);
    expect(pkg.description).toMatch(/^Robywire: /);
  });
});
