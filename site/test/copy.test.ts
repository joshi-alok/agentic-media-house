import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deskIntro,
  disclosure,
  gateIntro,
  heldOutcomeText,
  holdsPageIntro,
  holdsText,
  meaningLimit,
  methodDisclosure,
  modelCheckText,
  neverDoes,
  notRunningNote,
  notRunningYet,
  ownerReleaseText,
  receiptsIntro,
  scoreboardCaveat,
  siteDescription,
  sourcesText,
  statusPageIntro,
  trialText,
} from '../src/lib/copy';
import { LIVE } from '../src/lib/live';
import type { Live } from '../src/lib/live';
import { releaseNote } from '../src/lib/receipts';
import { defaultContext, runGate } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';

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
    'Each sentence of the article links to the claims it rests on, listed below: a short label for each claim, the passage of the source that it rests on, word for word, and where and when that source was fetched. The passage is the evidence; a claim is shown by its label and its passage, never by a paraphrase of the passage.';
  const OFF = `${START} The full source snapshot will be kept in a private evidence store, which is not running yet; this public record keeps its hash, the retrieval time and the quoted passage.`;
  const ON = `${START} The full source snapshot is kept in a private evidence store; this public record keeps its hash, the retrieval time and the quoted passage.`;

  it.each(CASES)('says what the evidence store does only when it is live (%s)', (_name, live) => {
    expect(receiptsIntro(live)).toBe(live.evidenceStore ? ON : OFF);
  });

  it('says that a claim is shown by its label and its passage, and never by a paraphrase', () => {
    for (const live of [NONE, ALL]) {
      expect(receiptsIntro(live)).toContain('a short label for each claim, the passage of the source that it rests on, word for word');
      expect(receiptsIntro(live)).toContain('never by a paraphrase of the passage');
    }
  });

  it('says each sentence links to the claims it rests on, not each number to a claim', () => {
    expect(receiptsIntro(NONE)).not.toContain('Each number');
    expect(receiptsIntro(ALL)).not.toContain('Each number');
  });
});

describe('disclosure', () => {
  const OFF =
    'Agentic Media House will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
  const ON =
    'Agentic Media House is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.';

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
    'Agentic Media House is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
  const ON =
    'Agentic Media House is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.';

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
    'The gate is code, and it is built and tested. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. A finding is either a blocker, which stops the draft (the gate reports the exact failures, and the Desk will send the draft back for revision with them), or a note, which is recorded on the receipts page of the piece and does not stop it. In plain English the rules are these.';
  const ON =
    'The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. A finding is either a blocker, which sends the draft back for revision with the exact failures, or a note, which is recorded on the receipts page of the piece and does not stop it. In plain English the rules are these.';

  it.each(CASES)('says the revision loop runs only when the Desk does (%s)', (_name, live) => {
    expect(gateIntro(live)).toBe(live.publishing ? ON : OFF);
  });

  it.each([NONE, ALL])('says what a blocker does and what a note does, and no longer that any failed check stops the draft', (live) => {
    const text = gateIntro(live);
    expect(text).toContain('A finding is either a blocker');
    expect(text).toContain('or a note, which is recorded on the receipts page of the piece and does not stop it');
    expect(text).not.toContain('If one fails');
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
    'On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a second layer on top of the nine rules for figures, quotations and sourcing; for meaning, and for the names that the rules only note or do not read, it will be the only layer. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted. It is not running yet.';
  const ON =
    'On every piece, a second model call reads each factual sentence beside the passages it cites and judges whether they say the same thing, and whether the basis and status labels fit. It uses a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece is held. This check is a second layer on top of the nine rules for figures, quotations and sourcing; for meaning, and for the names that the rules only note or do not read, it is the only layer. Its accuracy was measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted, before it was relied on.';

  it.each(CASES)('is in the future tense until the verifier is live (%s)', (_name, live) => {
    expect(modelCheckText(live)).toBe(live.verifier ? ON : OFF);
  });

  it.each([NONE, ALL])('does not say that the rules are always a layer under the model check: for meaning and for names it is the only layer', (live) => {
    const text = modelCheckText(live);
    expect(text).not.toContain('never the only one');
    expect(text).toContain('for figures, quotations and sourcing; for meaning, and for the names that the rules only note or do not read,');
    expect(text).toMatch(/it (?:is|will be) the only layer\./);
  });
});

describe('holdsText', () => {
  const OFF =
    "The gate holds a piece when it cannot clear it: once the pipeline runs, a blocker that still stands after two rounds of revision, or a model check that does not clear it, will hold it. A held draft is not published. It will go to the owner as a draft pull request that carries the gate report; that flow is not running yet.";
  const ON =
    "The gate holds a piece when it cannot clear it: a blocker still stands after two rounds of revision, or the model check does not clear it. A held draft is not published. It goes to the owner as a draft pull request that carries the gate report.";

  it.each(CASES)('says the pull request flow is running only when the Desk publishes (%s)', (_name, live) => {
    expect(holdsText(live)).toBe(live.publishing ? ON : OFF);
  });

  // A piece that rests on another outlet is no longer a reason for a hold: the article labels it, and the gate publishes it.
  it.each([NONE, ALL])('names the two ways to a hold, and does not name another outlet or G6 as one', (live) => {
    const text = holdsText(live);
    expect(text).toContain('two rounds of revision');
    expect(text).toContain('model check');
    expect(text).not.toContain('G6');
    expect(text).not.toContain('another outlet');
    expect(text).not.toContain('human decision');
  });
});

describe('ownerReleaseText', () => {
  const NOTE = releaseNote('owner');
  const OFF = `A held draft will be published only if the owner decides to release it, and the piece will then say so: its receipts page will read "${NOTE}", and each sentence that rests on another outlet will be labelled "Unconfirmed." in the body of the article; the site already does both for a piece whose ledger says that the owner released it.`;
  const ON = `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${NOTE}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the body of the article.`;

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
    expect(NOTE).toBe('Held for the owner, then released by the owner.');
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
    'Meaning is not checked by code. The checks make sure that every figure (a number or a date, or a word that mixes letters and digits) in a factual sentence and every quotation comes from a claim the sentence cites, and they note a name in a factual sentence that no cited claim lists (except the first word of a sentence); they do not check that the sentence says what the claim says, or that a paraphrase is fair.';
  const OFF = `${START} That will be the job of the independent model check, which is not running yet.`;
  const ON = `${START} That is the job of the independent model check.`;

  it.each(CASES)('hands meaning to the model check, in the tense of its flag (%s)', (_name, live) => {
    expect(meaningLimit(live)).toBe(live.verifier ? ON : OFF);
  });

  it.each([NONE, ALL])('does not say that the checks make sure of a name, because a name that no cited claim lists is only noted', (live) => {
    expect(meaningLimit(live)).not.toContain('figure, name and quotation');
    expect(meaningLimit(live)).toContain('they note a name in a factual sentence that no cited claim lists (except the first word of a sentence)');
  });

  // What the sentence says the checks do is what the gate does: a figure and a quotation that no cited claim has send a piece back, a name is noted.
  it('is true of the gate: a number, a date, a word that mixes letters and digits and a quotation that no cited claim has are blockers, and a name that no cited claim lists is a note', () => {
    const codesOf = (change: (input: ReturnType<typeof cloneGolden>) => void) => {
      const input = cloneGolden();
      change(input);
      const result = runGate(input, defaultContext());
      return { failures: result.failures.map((failure) => failure.code), notes: result.warnings.map((note) => note.code) };
    };
    const number = codesOf((input) => { input.draft.takeaways[0]!.text = 'The plant shipped 77 arms.'; });
    expect(number.failures).toContain('G4_NUMBER_UNSUPPORTED');
    const date = codesOf((input) => { input.draft.takeaways[0]!.text = 'The plant shipped arms on 3 March 2019.'; });
    expect(date.failures).toContain('G4_DATE_UNSUPPORTED');
    const quote = codesOf((input) => { input.draft.takeaways[0]!.text = 'The company said "every arm ships free".'; });
    expect(quote.failures).toContain('G5_QUOTE_NOT_VERBATIM');
    // A word that mixes letters and digits is a figure in this sentence: it is a blocker, and a name without a digit is only a note.
    const mixed = codesOf((input) => { input.draft.takeaways[0]!.text = 'The plant ships in mid-2027.'; });
    expect(mixed.failures).toContain('G4_FIGURE_UNSUPPORTED');
    expect(mixed.notes).not.toContain('G4_NAME_UNSUPPORTED');
    const name = codesOf((input) => { input.draft.takeaways[0]!.text = 'The plant is the second Harlow plant to receive arms.'; });
    expect(name.failures).not.toContain('G4_NAME_UNSUPPORTED');
    expect(name.notes).toContain('G4_NAME_UNSUPPORTED');
    // The exception in the sentence: the first word of a sentence is not read as a name, so an invented name that opens one is not even noted.
    const first = codesOf((input) => { input.draft.takeaways[0]!.text = 'Tarnmoor shipped.'; });
    expect(first.failures).not.toContain('G4_NAME_UNSUPPORTED');
    expect(first.notes).not.toContain('G4_NAME_UNSUPPORTED');
  });
});

describe('holdsPageIntro', () => {
  const START = 'A hold is a draft the gate did not clear.';
  const END =
    'This page lists when each hold happened, which beats the draft was filed under, and the reasons the gate gave. It never shows the held text, because a draft that was stopped is text this site does not vouch for.';
  const OFF = `${START} It is not published, and once the pipeline runs it will wait for the owner. ${END}`;
  const ON = `${START} It is not published: it waits for the owner. ${END}`;

  it.each(CASES)('says a hold waits for the owner only when the Desk publishes (%s)', (_name, live) => {
    expect(holdsPageIntro(live)).toBe(live.publishing ? ON : OFF);
  });

  it('says in both tenses that the held text is never shown', () => {
    for (const live of [NONE, ALL]) expect(holdsPageIntro(live)).toContain('It never shows the held text');
  });
});

describe('heldOutcomeText', () => {
  const OFF = 'A draft did not clear the gate, and once the pipeline runs it will wait for the owner. Nothing was published.';
  const ON = 'A draft did not clear the gate and waits for the owner. Nothing was published.';

  it.each(CASES)('says a held draft waits for the owner only when the Desk publishes (%s)', (_name, live) => {
    expect(heldOutcomeText(live)).toBe(live.publishing ? ON : OFF);
  });

  it('says in both tenses that nothing was published', () => {
    for (const live of [NONE, ALL]) expect(heldOutcomeText(live).endsWith('Nothing was published.')).toBe(true);
  });
});

describe('statusPageIntro', () => {
  const OFF =
    'This page will show the record the Desk will keep of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is built from that record, so it stays empty until the Desk runs.';
  const ON =
    'This page shows the record the Desk keeps of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is built from that record.';

  it.each(CASES)('speaks of the record of the Desk in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(statusPageIntro(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('sourcesText', () => {
  const TIERS =
    "A tier 1 source is a primary one: a company's own announcement or datasheet, a paper, a regulatory filing, a standard, a results sheet.";
  const OFF = `${TIERS} The Desk will write from tier 1 sources. A tier 2 source is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it will never state a fact on that authority. The gate already enforces the rest of the rule: a claim that has only a tier 2 source can appear only as an attribution that names the outlet, and the article labels it Unconfirmed in its body. A headline or a description built on such a claim names the outlet and carries no label, and a piece that rests entirely on another outlet's reporting will be published without a human when the gate and the model check clear it. If a story has no reachable primary source, the Desk will not rewrite a competitor's reporting as its own: every fact from it will be attributed to the outlet by name.`;
  const ON = `${TIERS} The Desk writes from tier 1 sources. A tier 2 source is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it never states a fact on that authority. A claim that has only a tier 2 source can appear only as an attribution that names the outlet, and the article labels it Unconfirmed in its body. A headline or a description built on such a claim names the outlet and carries no label, and a piece that rests entirely on another outlet's reporting is published without a human when the gate and the model check clear it. If a story has no reachable primary source, the Desk does not rewrite a competitor's reporting as its own: every fact from it is attributed to the outlet by name.`;

  it.each(CASES)('says what the Desk does in the present tense only when it publishes (%s)', (_name, live) => {
    expect(sourcesText(live)).toBe(live.publishing ? ON : OFF);
  });

  it('keeps the definition of the two tiers and the rule of the gate in both tenses', () => {
    for (const live of [NONE, ALL]) {
      expect(sourcesText(live)).toContain(TIERS);
      expect(sourcesText(live)).toContain('can appear only as an attribution that names the outlet');
    }
  });

  // A piece may rest entirely on another outlet's reporting and publish by itself: its body is labelled, and the page says so plainly.
  it.each([NONE, ALL])('says that another outlet is attributed and labelled, and that a piece which uses it is not held for that', (live) => {
    const text = sourcesText(live);
    expect(text).toContain('the article labels it Unconfirmed in its body');
    expect(text).not.toMatch(/\bheld\b/);
    expect(text).not.toContain('for the owner');
  });

  // The label is written by renderBody for the body only, and a title or a description that rests on another outlet has none: the page says so.
  it.each([NONE, ALL])('says that a headline or a description built on another outlet names it and has no label, and that a piece may rest entirely on it', (live) => {
    const text = sourcesText(live);
    expect(text).toContain('A headline or a description built on such a claim names the outlet and carries no label');
    expect(text).toMatch(/a piece that rests entirely on another outlet's reporting (?:is|will be) published without a human when the gate and the model check clear it/);
  });
});

describe('neverDoes', () => {
  const OFF = [
    'It will contact no one. It will send no email to a company and ask nobody for comment, so no piece will say "we asked and did not hear back".',
    'It will not republish its sources. A piece will quote short passages, each attributed and at most 300 characters, and will not copy articles.',
    'It will use no photographs. Each piece already gets a fact card drawn from its own claims.',
    "It will not rewrite another outlet's reporting as its own. A fact that only another outlet reports will be attributed to it by name and labelled Unconfirmed in the body of the article.",
    'It will not publish a sentence the gate cannot trace to a source, and the gate already refuses one.',
  ];
  const ON = [
    'It contacts no one. It sends no email to a company and asks nobody for comment, so no piece says "we asked and did not hear back".',
    'It does not republish its sources. A piece quotes short passages, each attributed and at most 300 characters, and does not copy articles.',
    'It uses no photographs. Each piece gets a fact card drawn from its own claims.',
    "It does not rewrite another outlet's reporting as its own. A fact that only another outlet reports is attributed to it by name and labelled Unconfirmed in the body of the article.",
    'It does not publish a sentence the gate cannot trace to a source.',
  ];

  it.each(CASES)('lists five things, in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(neverDoes(live)).toEqual(live.publishing ? ON : OFF);
  });

  it('says in the future tense that the card is already drawn and the gate already refuses, which the code does today', () => {
    expect(neverDoes(NONE)[2]).toContain('already gets a fact card');
    expect(neverDoes(NONE)[4]).toContain('the gate already refuses one');
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
    expect(exported.length).toBeGreaterThanOrEqual(19);
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
    ['a hold that waits for the owner', /waits for the owner/i],
    ['the record the Desk keeps of its own runs', /record the Desk keeps/i],
    ['what the Desk never does', /\bIt (?:contacts no one|does not republish its sources|uses no photographs|does not rewrite another outlet|does not publish a sentence)/],
    ['the sources the Desk writes from', /The Desk writes from tier 1 sources|never states a fact on that authority|the Desk does not rewrite a competitor/i],
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
    expect(pkg.description).toMatch(/^Agentic Media House: /);
  });
});
