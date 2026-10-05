import { LIVE } from './live';
import type { Live } from './live';
import { releaseNote } from './receipts';

// Every sentence of the site whose tense depends on a part of the Desk being
// live. Each function takes the switchboard (live.ts) and says in the future
// tense what is not running and in the present tense what is. A page or a
// function elsewhere must not write such a sentence itself, so that turning a
// flag on changes all of them together; site/test/copy.test.ts checks what
// each one says for every setting of the flags, and that no other file of the
// site says it.

/** The description of the site for search results and the feed. */
export function siteDescription(live: Live = LIVE): string {
  const rule = 'Every factual sentence links to the passage of a primary source that it rests on.';
  if (!live.publishing) return 'A robotics news site built so that every factual sentence links to the passage of a primary source it rests on. An automated pipeline will write it.';
  return live.scheduler ? `Daily robotics news written by an automated pipeline. ${rule}` : `Robotics news written by an automated pipeline. ${rule}`;
}

/** The disclosure in the footer of every page. It names no second model, human or editor, because the method page describes those as plans. */
export function disclosure(live: Live = LIVE): string {
  return live.publishing
    ? 'Robywire is written by an automated pipeline, the Desk. A piece is published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece has a receipts page that shows the trace.'
    : 'Robywire will be written by an automated pipeline, the Desk. A piece will be published only when every factual sentence in it is traced to a quoted passage in a primary source; each piece will have a receipts page that shows the trace.';
}

/** The introduction of a receipts page. */
export function receiptsIntro(live: Live = LIVE): string {
  const start =
    'Each sentence of the article links to the claims it rests on, listed below: the passage of the source that each claim rests on, word for word, and where and when that source was fetched.';
  const store = live.evidenceStore
    ? 'The full source snapshot is kept in a private evidence store; this public record keeps its hash, the retrieval time and the quoted passage.'
    : 'The full source snapshot will be kept in a private evidence store, which is not running yet; this public record keeps its hash, the retrieval time and the quoted passage.';
  return `${start} ${store}`;
}

/** The first paragraph of the method page. */
export function deskIntro(live: Live = LIVE): string {
  return live.publishing
    ? 'Robywire is a robotics news site. Its pieces are written by an automated pipeline, the Desk, and every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece is published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace is public. What the code cannot trace is not published.'
    : 'Robywire is a robotics news site, and the Desk is the automated pipeline that will write its pieces; every page of the site says so in the footer. The idea is simple: a model may propose, but code decides. A piece will be published without a human only when every factual sentence in it can be traced to a passage quoted from a primary source, and the trace will be public on its receipts page. What the code cannot trace will not be published.';
}

/** The parts that do not run, each with the flag that says it does, in the order the method page lists them. */
const NOT_RUNNING: readonly { flag: keyof Live; text: string }[] = [
  { flag: 'publishing', text: 'the pipeline that finds, fetches and writes stories' },
  { flag: 'evidenceStore', text: 'the private evidence store for the full text of each source' },
  { flag: 'verifier', text: 'the independent model check' },
  { flag: 'scheduler', text: 'the daily schedule' },
  { flag: 'publishing', text: 'the draft pull request that sends a held draft to the owner' },
  { flag: 'publishing', text: "the owner's release of a held draft" },
  { flag: 'publishing', text: 'the command that records a correction or a retraction' },
];

/** What is not running yet, one phrase for each part, for the list on the method page. Empty once every part is live. */
export function notRunningYet(live: Live = LIVE): string[] {
  return NOT_RUNNING.filter((part) => !live[part.flag]).map((part) => part.text);
}

/** The sentence under the list of what is not running, or undefined when every part is. */
export function notRunningNote(live: Live = LIVE): string | undefined {
  return notRunningYet(live).length === 0
    ? undefined
    : 'Where this page says what the Desk does in the present tense, it describes a rule that the gate already enforces or the way the Desk is designed to behave; the parts that are not running are described in the future tense.';
}

/** The trial the Desk will go through before it publishes by itself, or undefined once it does. */
export function trialText(live: Live = LIVE): string | undefined {
  return live.publishing
    ? undefined
    : 'Before the Desk publishes on its own it will run for five days in shadow, writing and checking but publishing nothing, and then for fourteen days in public, and a short written report will cover that trial.';
}

/** The paragraph that introduces the nine rules of the gate. */
export function gateIntro(live: Live = LIVE): string {
  return live.publishing
    ? 'The gate is code. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published; it goes back for revision with the exact failures. In plain English the rules are these.'
    : 'The gate is code, and it is built and tested. It runs nine checks, G1 to G9, on a draft before anything is published. The checks are plain functions with no network and no model, so the same draft always gets the same answer. If one fails, the draft is not published: the gate reports the exact failures, and the Desk will send the draft back for revision with them. In plain English the rules are these.';
}

/** The section about the independent model check. */
export function modelCheckText(live: Live = LIVE): string {
  return live.verifier
    ? 'On every piece, a second model call reads each factual sentence beside the passages it cites and judges whether they say the same thing, and whether the basis and status labels fit. It uses a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece is held. This check is a second layer on top of the nine rules, never the only one. Its accuracy was measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted, before it was relied on.'
    : 'On every piece, once the Desk is live, a second model call will read each factual sentence beside the passages it cites and judge whether they say the same thing, and whether the basis and status labels fit. It will use a different prompt from the model that wrote the piece. If it finds a sentence that is not supported, or cannot tell, the piece will be held. This check will be a second layer on top of the nine rules, never the only one. Before it is relied on, its accuracy will be measured on a labelled set of sentences, some supported, some unsupported and some subtly distorted. It is not running yet.';
}

/** The start of the section about holds: when a piece is held and where a held draft goes. The page adds what the holds page shows. */
export function holdsText(live: Live = LIVE): string {
  return live.publishing
    ? "The gate holds a piece when it cannot clear it: a check still fails after two rounds of revision, or a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting. A held draft is not published. It goes to the owner as a draft pull request that carries the gate report."
    : "The gate holds a piece when it cannot clear it: a rule asks for a human decision, as G6 does for any piece that uses another outlet's reporting, or, once the pipeline runs, a check still fails after two rounds of revision. A held draft is not published. It will go to the owner as a draft pull request that carries the gate report; that flow is not running yet.";
}

/** What the site shows for a held draft that the owner decides to publish. The words quoted are the ones the receipts page uses. */
export function ownerReleaseText(live: Live = LIVE): string {
  const note = releaseNote('owner');
  return live.publishing
    ? `A held draft is published only if the owner decides to release it, and the piece then says so: its receipts page reads "${note}", and each sentence that rests on another outlet is labelled "Unconfirmed." in the article.`
    : `A held draft will be published only if the owner decides to release it, and the piece will then say so: its receipts page will read "${note}", and each sentence that rests on another outlet will be labelled "Unconfirmed." in the article; the site already does both for a piece whose ledger says that the owner released it.`;
}

/** The paragraph about disclosure on the method page. It follows the footer. */
export function methodDisclosure(live: Live = LIVE): string {
  return live.publishing
    ? "Every page says in its footer that the site is written by an automated pipeline, and the byline of every article says the same. No piece carries a human author's name, and none pretends to have been reported by a person."
    : "Every page says in its footer that the site will be written by an automated pipeline, and the byline of every article already names the Desk and says the piece is automated. No piece carries a human author's name, and none pretends to have been reported by a person.";
}

/** The caveat of the scoreboard: what the number does and does not measure. The README says the same. */
export function scoreboardCaveat(live: Live = LIVE): string {
  const start =
    'The scoreboard is a floor, not a proof. It measures the checks against defects that were seeded on purpose, not how accurate the Desk is on live stories: it says nothing about the defects that nobody thought to seed.';
  return live.verifier
    ? `${start} The independent model check is not part of it; its accuracy is measured on its own labelled set.`
    : `${start} The independent model check is not part of it; that check is not running yet, and its accuracy will be measured on its own labelled set.`;
}

/** The last of the known limits of the checks: what no rule of code can see. */
export function meaningLimit(live: Live = LIVE): string {
  const start =
    'Meaning is not checked by code. The checks make sure that every figure, name and quotation in a sentence comes from a claim the sentence cites, not that the sentence says what the claim says, or that a paraphrase is fair.';
  return live.verifier ? `${start} That is the job of the independent model check.` : `${start} That will be the job of the independent model check, which is not running yet.`;
}
