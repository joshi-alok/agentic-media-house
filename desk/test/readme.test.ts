import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The README says what the Desk does and does not do, and a sentence that a later change makes untrue must fail a test. These tests
// read the README of the repository and check the sections that state limits.

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

/** The text of a section of the README, from its heading to the next heading of the same level; throws when there is none. */
function section(heading: string): string {
  const start = README.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`the README has no section "${heading}"`);
  const rest = README.slice(start + 1);
  const next = rest.indexOf('\n## ', 3);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('the README: what the Desk is tested with', () => {
  const desk = (): string => section('The desk workspace');

  it('does not say that a test fails if anything reaches for a network, which nothing guarantees', () => {
    expect(README).not.toContain('a test fails if anything reaches for a network');
  });

  it('says what the guard of the tests does, and that it is a safety net and not a proof', () => {
    expect(desk()).toContain('`fetch`, `net.connect`, `http.request` and `https.request`');
    expect(desk()).toContain('network is not available in tests');
    expect(desk()).toContain('a safety net and not a proof');
  });

  it('says what the demo proves: the plumbing and the replay, and not the quality of a model', () => {
    const demo = section('The desk command');
    expect(demo).toContain('desk demo: ok: completed as published (dry run, scripted model and verifier): this proves the plumbing and replay equality, not model quality');
  });

  it('says that --config takes a file of settings, and that a live run needs a user agent that is not a placeholder', () => {
    const command = section('The desk command');
    expect(command).toContain('[--config <path>]');
    expect(command).toContain('a user agent that links to an `.example` address is refused');
  });
});

describe('the README: how a replay knows how the run was made', () => {
  it('says that the record of a run says how it was made, that a replay needs no flag for it, and that a flag that contradicts the record is refused', () => {
    const command = section('The desk command');
    expect(section('The desk workspace')).toContain('which client answered the model, where the stories came from, and which try of its day it was');
    expect(command).toContain('The record of the run says which client and which sources it used, so a replay needs no flag for them');
    expect(command).toContain('one that contradicts the record is refused with exit code 2');
    expect(command).toContain('A record from before records said how a run was made has no such information and needs `--sources`');
  });
});

describe('the README: a day whose run failed', () => {
  it('says that a failed day is run again with no flag, how many runs a day may have, where the earlier run is kept, and what --force-new is for', () => {
    const workspace = section('The desk workspace');
    const command = section('The desk command');
    expect(workspace).toContain('a day whose run failed is run again with no flag, up to `maxAttemptsPerDay` runs a day (3 unless the settings say otherwise');
    expect(workspace).toContain('`runs/<date>.failed-<n>/` or `runs/<date>.replaced-<n>/`, never removed');
    expect(workspace).toContain('A day that published, was held or found no story is not run again unless `--force-new` says so');
    expect(command).toContain('the run after the `maxAttemptsPerDay`th of a day is refused (exit code 1, nothing run)');
    expect(command).toContain('how many runs one day may have (`maxAttemptsPerDay`)');
  });
});

describe('the README: money is not spent on a made-up world', () => {
  it('says that --client api with --sources fixtures is refused, and why', () => {
    const command = section('The desk command');
    expect(command).toContain('`--client api` with `--sources fixtures` is refused with exit code 2');
    expect(command).toContain('it would spend money on the answers of a model about pages that are made up');
  });
});

describe('the README: the normalised form of a value', () => {
  it('says that Extract holds the normalised form of every value to its raw text, and which values are not compared', () => {
    expect(section('The desk workspace')).toContain("and holds every value's normalised form and unit to its raw text");
    expect(section('What the Desk does not check')).toContain('**Values that are not compared.**');
    expect(section('What the Desk does not check')).toContain('not compared with its normalised form');
  });
});

describe('the README: what status says', () => {
  it('says what status prints: the last run with its day and try, the holds, the corrections and the retractions, and where the try comes from', () => {
    const command = section('The desk command');
    expect(command).toContain('`npm run desk -- status [--config <path>]` prints the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions in the desk state.');
    expect(command).toContain('The try is read from the record of the run (`runs/<date>/run.json`), which only the machine that made the run has');
  });
});

describe('the README: holds and corrections', () => {
  const holds = (): string => section('Holds and corrections');

  it('no longer says that the pull request of a hold or the command for a correction is not built', () => {
    expect(section('The desk workspace')).not.toContain('the pull request that carries a hold to the owner');
    expect(section('The desk workspace')).not.toContain('the command that records a correction or a retraction');
  });

  it('says that a held piece goes to the owner as a draft pull request from a branch made beside the checkout, in the order that it is done, and that the hold has the address', () => {
    expect(holds()).toContain('A held piece goes to the owner as a draft pull request.');
    expect(holds()).toContain('`hold/<day>-<slug>`');
    expect(holds()).toContain('The branch is made beside the checkout, from the commit that `main` is on, so the checkout is never changed');
    expect(holds()).toContain('`release: owner`');
    expect(holds()).toContain('Only then does it record the hold in the desk state, with the address of the pull request as `prUrl`');
    expect(holds()).toContain('A dry run never touches GitHub.');
    expect(holds()).toContain('it has never been run against GitHub itself');
  });

  it('says how the owner publishes the piece and how the owner discards it', () => {
    expect(holds()).toContain('marking the pull request ready for review and merging it');
    expect(holds()).toContain('You discard it by closing the pull request.');
  });

  it('says what the program needs, and that nothing is run through a shell', () => {
    expect(holds()).toContain('`git` and `gh`');
    expect(holds()).toContain('a remote called `origin`');
    expect(holds()).toContain('the checkout on `main`');
    expect(holds()).toContain('never through a shell');
    expect(holds()).toContain('the body of the pull request is passed as a file');
  });

  it('says that a step that fails fails the run at the stage hold, what is left, and the one case that is not a failure', () => {
    expect(holds()).toContain('It ends `failed` at the stage `hold`');
    expect(holds()).toContain('`main` gains only the record that the run failed');
    expect(holds()).toContain('| The pull request, after the push |');
    expect(holds()).toContain('open the pull request from it by hand, or delete the branch');
    expect(holds()).toContain('the hold is recorded without an address');
  });

  it('says what a correction does and does not do: it never deletes, the reason goes nowhere but the desk state, and it does not push or deploy', () => {
    expect(holds()).toContain('`npm run desk -- retract <slug> --reason <text>`');
    expect(holds()).toContain('sets `updatedAt` in the frontmatter of the piece to the UTC day of the record');
    expect(holds()).toContain('at most 500 characters');
    expect(holds()).toContain('it goes into the desk state as the note and nowhere else');
    expect(holds()).toContain('The rest of the piece is the same, byte for byte');
    expect(holds()).toContain('It does not push or deploy');
    expect(holds()).toContain('a piece that was held is on its pull request until you merge it');
  });

  it('lists retract among the commands, and in the exit codes', () => {
    const command = section('The desk command');
    expect(command).toContain('`npm run desk -- retract <slug> --reason <text> [--kind correction|retraction] [--dry]`');
    expect(command).toContain('for a correction that was made');
    expect(command).toContain('for a correction that was refused or failed');
    expect(README).toContain('`run`, `replay`, `status` and `retract`');
  });
});

describe('the README: the evidence store', () => {
  const store = (): string => section('The evidence store');

  it('no longer says that the bucket is not built, and says that it is built and has never been used against Cloudflare', () => {
    expect(section('Which parts are live')).not.toContain('the bucket is not built');
    expect(section('Which parts are live')).toContain('has never been used against Cloudflare');
    expect(section('The desk workspace')).not.toContain('the private evidence bucket,');
    expect(store()).toContain('It has never been used against Cloudflare');
  });

  it('says what a snapshot is: the text of a page named by its SHA-256, with where it came from, never changed, and refused when it no longer matches its hash', () => {
    expect(store()).toContain('the text of the page, named by its SHA-256');
    expect(store()).toContain('putting a text that is kept already changes nothing');
    expect(store()).toContain('refused when it is read back');
  });

  it('says which store the settings choose, that the folder is the default, and that the bucket is reached through the S3 interface of R2 with a signature that the Desk writes itself and tests against the examples of Amazon', () => {
    expect(store()).toContain('`evidence.kind`');
    expect(store()).toContain('`local`, the default, is a folder');
    expect(store()).toContain('`r2` is a **private bucket on Cloudflare R2**');
    expect(store()).toContain('desk/src/run/sigv4.ts');
    expect(store()).toContain('AWS Signature Version 4 written with `node:crypto`');
    expect(store()).toContain('worked examples that Amazon publishes');
    expect(store()).toContain('No package was added.');
  });

  it('says that the bucket is described by four variables of the environment and never by a file, that there is no flag, and what a run does without them', () => {
    for (const name of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) expect(store()).toContain(`\`${name}\``);
    expect(store()).toContain('They are never read from a file of settings');
    expect(store()).toContain('there is no flag to choose the store');
    expect(store()).toContain('refused with exit code 2, naming the ones that are missing and never what any of them holds');
    expect(store()).toContain('No message, log, record or artifact of the Desk has a key in it');
    expect(store()).toContain('`--sources fixtures`, the made-up world, is refused with `r2`');
  });

  it('says which keys the store writes, when, and for how long, in a table of the two prefixes', () => {
    expect(store()).toContain('| `pending/<hash>` |');
    expect(store()).toContain('| `published/<hash>` |');
    expect(store()).toContain('By the bucket, 90 days after it was written');
    expect(store()).toContain('| Never |');
    expect(store()).toContain('`<hash>` is 64 lowercase hex characters.');
    expect(store()).toContain('a dry run puts and reads but never keeps');
    expect(store()).toContain('leave their snapshots in `pending/` only');
  });

  it('says what a run does with the store, where it ends when the store fails, and the four kinds of trouble', () => {
    expect(store()).toContain('(the stage `evidence`)');
    expect(store()).toContain('Publish keeps the snapshots that the piece cites before it writes the piece');
    expect(store()).toContain('ends the run `failed` at the stage `fetch`, `evidence` or `publish`, with nothing published');
    for (const kind of ['unreachable', 'denied', 'tampered', 'missing']) expect(store()).toContain(`\`${kind}\``);
  });

  it('says who can read the snapshots, and that page text is not in the repository or in what a workflow uploads', () => {
    expect(store()).toContain('The bucket is private: no public access, no `r2.dev` address and no custom domain');
    expect(store()).toContain('the Desk never sends an access-control header');
    expect(store()).toContain('by no one else');
    expect(store()).toContain('at most 300 characters');
    expect(store()).toContain('must not have page text');
  });

  it('says how the bucket is made, and that the runbook makes it', () => {
    expect(store()).toContain('The runbook makes it, once, outside this plan');
    expect(store()).toContain('deletes the objects of the prefix `pending/` 90 days after they were written');
    expect(store()).toContain('an API token that may read and write objects, limited to this bucket');
  });

  it('says in the settings that the evidence setting chooses the store and that a file that carries a key is refused', () => {
    const command = section('The desk command');
    expect(command).toContain('The setting `evidence` (`kind: local` or `kind: r2`) chooses the evidence store');
    expect(command).toContain('a file that carries one is refused like any other setting that does not exist');
  });

  it('says the limits that the store has: the evidence of a piece that the owner releases, no retries, copies of an unpublished piece, and a record that is too long', () => {
    const limits = section('What the Desk does not check');
    expect(limits).toContain('**Evidence of a piece that the owner releases.**');
    expect(limits).toContain('a command that keeps the snapshots that a piece on the site cites is not built');
    expect(limits).toContain('**The store does not retry.**');
    expect(limits).toContain('**Copies of snapshots of a piece that was not published.**');
    expect(limits).toContain('**A record that is too long.**');
  });
});

describe('the README: what the Desk does not check', () => {
  const limits = (): string => section('What the Desk does not check');

  it('says that text hidden by a style sheet is read as text of the page, and what is left out of it', () => {
    expect(limits()).toContain('style sheets');
    expect(limits()).toContain('`hidden`');
    expect(limits()).toContain('`aria-hidden="true"`');
    expect(limits()).toContain('`display:none`');
    expect(limits()).toContain('`<template>`');
  });

  it('says that the date a page gives itself is its own word, and what it is a check against', () => {
    expect(limits()).toContain('`publishedAt`');
    expect(limits()).toContain('A page can say what it likes about itself');
    expect(limits()).toContain('`stale-or-undated`');
  });

  it('says which addresses the fetcher refuses, and the one way round the check that is left', () => {
    expect(limits()).toContain('`HttpFetcher` looks a host up before the first request and before every hop of a redirect');
    expect(limits()).toContain('the error kind `address`');
    expect(limits()).toContain('DNS rebinding');
  });

  it('says that analysis sentences are read by code only and never by the model check, and that a model-written id is filtered before a prompt', () => {
    expect(limits()).toContain('**Analysis sentences.**');
    expect(limits()).toContain('the model check (G10) is never asked about them');
    expect(limits()).toContain('**Claim ids in a prompt.**');
  });

  it('says that the headline is in the title of a pull request and not in a fenced block, and that a pushed branch can be left without a pull request', () => {
    expect(limits()).toContain('**The headline in a pull request.**');
    expect(limits()).toContain('the title is the one place where it is not');
    expect(limits()).toContain('**A branch with no pull request.**');
    expect(limits()).toContain('stays on the remote');
  });

  it('says that the content of a details element is kept, on purpose', () => {
    expect(limits()).toContain('`<details>`');
    expect(limits()).toContain('on purpose');
  });
});

describe('the README: the file of settings of the daily run', () => {
  it('says that desk.config.yml is the file of the daily run, what it holds, and that it holds no secret and names no model', () => {
    const command = section('The desk command');
    expect(command).toContain('`desk.config.yml` at the root of the repository is the file of settings of the daily run');
    expect(command).toContain('`evidence: { kind: r2 }`');
    expect(command).toContain('it holds no secret, and it names no model');
    expect(command).toContain('come from the environment, never from this file');
  });
});

describe('the README: the daily workflow', () => {
  const workflow = (): string => section('The daily workflow');

  it('says when it starts, that it runs one at a time, and the command that it runs', () => {
    expect(workflow()).toContain('04:30, 06:30 and 08:30 UTC every day and by hand');
    expect(workflow()).toContain('the concurrency group `desk`, which never cancels a run that has started');
    expect(workflow()).toContain('`npm run desk -- run --config desk.config.yml --skip-if-done`');
  });

  it('says where the secrets go and that a test fails if that stops being true', () => {
    expect(workflow()).toContain('given to the one step that runs the Desk, in its `env`, and nowhere else');
    expect(workflow()).toContain('A test fails if that stops being true.');
  });

  it('says what is pushed, why the last step starts the deploy by hand, and what is kept as an artifact and why no page text is in it', () => {
    expect(workflow()).toContain('`git rev-list @{u}..HEAD`');
    expect(workflow()).toContain('A push by the token of a workflow starts no other workflow');
    expect(workflow()).toContain('kept as an artifact for 14 days, even when the run failed, except `runs/tune/`');
    expect(workflow()).toContain('no page text goes there');
    expect(workflow()).toContain('shares more than the length of a quotation (300 characters) with a page');
  });

  it('says that nothing could run it, that the versions of the actions were not checked, and what it assumes of the repository', () => {
    expect(workflow()).toContain('A workflow cannot be run anywhere but on GitHub');
    expect(workflow()).toContain('were not checked against GitHub');
    expect(workflow()).toContain('no branch protection that forbids it');
  });

  it('is no longer listed as not built, and the schedule is said to have never run', () => {
    expect(section('The desk workspace')).not.toContain('the GitHub Actions workflow that runs the Desk every day');
    expect(section('Which parts are live')).toContain('`.github/workflows/desk.yml`, which tests read and which has never run on GitHub');
  });
});

describe('the README: a day that is done, for a schedule', () => {
  it('says what --skip-if-done does, what it needs and does not need, and what it does not change', () => {
    const command = section('The desk command');
    expect(command).toContain('[--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]');
    expect(command).toContain('The command prints `outcome: refused-already-done` and exits 0, and runs nothing (asks no model, fetches nothing, writes nothing, and needs no key and no bucket)');
    expect(command).toContain('The desk state is the record that a scheduled job has, because it starts from a fresh checkout and has no folder of runs.');
    expect(command).toContain('Every other refusal is still exit code 1, and `--skip-if-done` cannot be given with `--force-new`.');
    expect(command).toContain('and for a day that `--skip-if-done` left alone');
  });
});

