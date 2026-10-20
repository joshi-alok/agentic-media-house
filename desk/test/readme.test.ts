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

  it('says that analysis sentences are read by code and then by the model check, and that a model-written id is filtered before a prompt', () => {
    expect(limits()).toContain('**Analysis sentences.**');
    expect(limits()).toContain('the model check (G10) then judges each of them beside the passages of the claims it cites (all the claims the piece cites, when it cites none), and rejects one that adds an entity, an event, a figure or a claim of fact that they do not support');
    expect(limits()).not.toContain('is never asked about them');
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

describe('the README: what a message of the store says', () => {
  it('says what a message has, what it never has, with what each is replaced, and why', () => {
    const store = section('The evidence store');
    expect(store).toContain('**What a message of the store says, and does not.**');
    expect(store).toContain('It never has the address of the endpoint, which has the id of the Cloudflare account in it, the name of the bucket, or either key');
    expect(store).toContain('they are replaced by `<r2-endpoint>`, `<bucket>` and `<key>`');
    expect(store).toContain('GitHub hides only a whole secret and not an address that has an account id in it');
  });
});

describe('the README: the name of the branch of a hold', () => {
  const holds = (): string => section('Holds and corrections');

  it('says that each try has a name, how the next try finds a name that is free, and how a long slug is cut', () => {
    expect(holds()).toContain('**The name of the branch is a name for each try.**');
    expect(holds()).toContain('`hold/<day>-<slug>` for the first try of a day and `hold/<day>-<slug>-t<n>` for the n-th');
    expect(holds()).toContain('asks the remote which of the names from its own try on it already has (`git ls-remote`), and uses the first that it does not have');
    expect(holds()).toContain('cut at the last hyphen that fits in 80 characters, never in the middle of a word and never leaving a hyphen at the end');
    expect(holds()).toContain('accept exactly the same names');
  });

  it('says what a half-done hold leaves, and that the next try is not rejected', () => {
    expect(section('What the Desk does not check')).toContain('The error says its name and how to delete it (`git push origin --delete <branch>`)');
    expect(section('What the Desk does not check')).toContain('so it is never refused as a push that is not a fast-forward');
  });
});

describe('the README: a hold is remembered', () => {
  const holds = (): string => section('Holds and corrections');

  it('says what the desk state records with a hold, for how long it covers its story, and what that stops', () => {
    expect(holds()).toContain('**A hold is remembered, so that a story is not held twice.**');
    expect(holds()).toContain('the slug of the held piece and the address of the story that the Desk chose (`slug` and `sourceUrl`; a hold recorded before they existed has neither, and covers nothing)');
    expect(holds()).toContain('A hold covers its story for 14 days after it was recorded');
    expect(holds()).toContain('two runs in a row cannot open two pull requests for one story');
    expect(holds()).toContain('A hold from yesterday covers its story, a hold from 15 days ago does not.');
  });

  it('says how to let a discarded story go before the 14 days are over, and what is not remembered', () => {
    expect(holds()).toContain('A pull request that you close keeps its story out of the pipeline until the 14 days are over.');
    expect(holds()).toContain('delete its hold from `site/src/data/desk-state.json` (the Desk never deletes a hold itself), commit that, and, if the day already has a run that held, run `npm run desk -- run --force-new`');
    expect(holds()).toContain('the same story reported at another address is another candidate');
    expect(holds()).toContain('The holds page of the site shows the date, the beats and the reasons of a hold, and neither the slug nor the address.');
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
    expect(workflow()).toContain('`git rev-list --count origin/main..HEAD` (never from an upstream, which a checkout may not have)');
    expect(workflow()).toContain('It never fails open');
    expect(workflow()).toContain('the commits are pushed to the branch `desk-rescue/<day>-<run>`');
    expect(workflow()).toContain('A push by the token of a workflow starts no other workflow');
    expect(workflow()).toContain('A pack of the run is kept as an artifact for 14 days, even when the run failed, and the folder of the runs is not.');
    expect(workflow()).toContain('No reply of a model, reason of the verifier, sentence of a draft, quotation, title, address or word of a page is ever in it.');
    expect(workflow()).toContain('a pack of more than 24 KB (or a file of it of more than 8 KB) is an error and not a pack');
  });

  it('says that the site is built and audited before anything reaches main, and what happens when it is not', () => {
    expect(workflow()).toContain('reaches `main` only after the site has been built with it');
    expect(workflow()).toContain('a piece that clears the gate can still break the build');
    expect(workflow()).toContain('the step `desk push --branch-only` puts the commits on the branch `desk-build-failed/<day>-<run>` and opens a draft pull request on it');
    expect(workflow()).toContain('and nothing that the report says about a page, and the job fails');
    expect(workflow()).toContain('desk/test/workflows/build-before-push.test.ts');
    expect(section('What the Desk does not check')).toContain('three a day');
    expect(section('The desk command')).toContain('`--branch-only` is for commits that must not reach `main` because the site does not build with them');
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

describe('the README: a rehearsal, and the switch of the schedule', () => {
  it('says what the input dry does and does not do, and that the schedule runs only when the variable is on', () => {
    const workflow = section('The daily workflow');
    expect(workflow).toContain('**A rehearsal, and the switch of the schedule.** A start by hand has one input, `dry`');
    expect(workflow).toContain('It runs `desk run --dry` and not `--skip-if-done`');
    expect(workflow).toContain('the push, the branch of a build that failed and the deploy are skipped: they are conditions of the steps');
    expect(workflow).toContain('The job runs when the schedule starts it only if the variable `DESK_SCHEDULE` of the repository is `on`');
    expect(workflow).toContain('the first push of the repository cannot start a Desk that publishes');
  });
});

describe('the README: the pack of a run', () => {
  it('says what goes in, what never does, that nothing that is not named gets in, and what tries to make it', () => {
    const workflow = section('The daily workflow');
    expect(workflow).toContain('`npm run desk -- pack-artifact` makes, of the folder of the day, `run.json` and one small file for each stage, and each is made by naming the fields that go in, one by one');
    expect(workflow).toContain('A field that a stage adds later is not in the pack until somebody adds it to the list, a code that is not on the list is counted and not copied');
    expect(workflow).toContain('`desk/test/run/pack.test.ts` packs a run whose every free text is a hostile string of 10,000 characters and finds none of it');
    expect(section('The desk command')).toContain('`npm run desk -- pack-artifact <folder of a run> <folder for the pack>` makes the small files that are uploaded as the artifact of a run in place of its folder');
  });
});

describe('the README: what each step of a workflow can reach', () => {
  it('says that the checkout leaves no credential, who has the token and how git is given it, and what a child of the Desk is given', () => {
    const workflow = section('The daily workflow');
    expect(workflow).toContain('**What each step can reach.** The checkout is made with `persist-credentials: false`');
    expect(workflow).toContain('`npm ci`, which runs the install scripts of every package in the tree, runs with no token in reach');
    expect(workflow).toContain('given to the four steps that need it');
    expect(workflow).toContain('Git is given the token for github.com alone, by the environment, in one place (`.github/scripts/github-auth.sh`');
    expect(workflow).toContain('an allow-list of the environment (`PATH`, `HOME`, `LANG`, `TMPDIR`, the variables of git, and the token of GitHub for `gh` alone)');
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

describe('the README: the deploy workflow', () => {
  const deploy = (): string => section('The deploy workflow');

  it('says what it is: a Worker with static assets, started by a push to main and by hand, and why by hand', () => {
    expect(deploy()).toContain('as a Worker that serves static assets, not as a Pages project');
    expect(deploy()).toContain('It starts on every push to `main` and by hand');
    expect(deploy()).toContain('a push by the token of a workflow starts no other workflow');
  });

  it('says the steps, and that a step that fails stops the deploy', () => {
    expect(deploy()).toContain('`npm ci`, `npm run build`, `npm run audit:prod` and `npx wrangler deploy`');
    expect(deploy()).toContain('so a site that does not build or whose audit fails is never deployed');
  });

  it('says where the address of the site comes from, and what the settings file of Cloudflare holds', () => {
    expect(deploy()).toContain('`https://agentic-media-house.joshi-alok.workers.dev`');
    expect(deploy()).toContain('`assets.directory`, which is `./site/dist`');
    expect(deploy()).toContain('refuses to run at the root of an npm workspace');
  });

  it('says where the two secrets go, that the account id is in no committed file, and that no deploy has been made by the workflow', () => {
    expect(deploy()).toContain('`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are secrets of the repository, given to the one step that deploys');
    expect(deploy()).toContain('The account id is in no committed file.');
    expect(deploy()).toContain('no deploy has been made by this workflow: the one deploy that exists was made by hand');
  });

  it('is no longer listed as not built', () => {
    expect(section('The desk workspace')).not.toContain('the Cloudflare deploy');
  });
});

describe('the README: the tuning harness', () => {
  const tune = (): string => section('The tuning harness');

  it('is one of the commands, with its options, and says that it publishes and commits nothing', () => {
    expect(section('The desk command')).toContain('`npm run desk -- tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]`');
    expect(section('The desk command')).toContain('It publishes and commits nothing');
    expect(section('The desk command')).toContain('`npm run desk -- push [--branch-only] [--run-id <id>] [--output <file>] [--audit-log <file>]` pushes what the checkout has and `origin/main` has not');
  });

  it('says what the list is, what is fetched and how, what a page of no known kind and a redirect do, and what --client fake is', () => {
    expect(tune()).toContain('lists addresses, one to a line (`#` starts a comment)');
    expect(tune()).toContain('`robots.txt` honoured, at the pace of the settings');
    expect(tune()).toContain('an address on a host that the registry does not list is not fetched at all');
    expect(tune()).toContain('`--client fake` (a scripted model that proposes no claims: it tries the fetching and the sorting and costs nothing)');
  });

  it('says what the table has, and that a page that cannot be tried or a trial that fails does not make the exit code 1', () => {
    expect(tune()).toContain('the claims dropped (counted under each rule that dropped them)');
    expect(tune()).toContain('what the gate said of the first draft (its failure codes)');
    expect(tune()).toContain('what the model check said of the first draft that the gate cleared');
    expect(tune()).toContain('neither makes the exit code 1');
  });

  it('says that dollars come only from prices that the owner wrote, and when there are none', () => {
    expect(tune()).toContain('The Desk does not know what a model costs and never guesses.');
    expect(tune()).toContain('`inputPerMillion` and `outputPerMillion`');
    expect(tune()).toContain('it shows no dollars when extract, compose and verify are not one model');
  });

  it('says what the budget of calls is, how it is counted, what happens when it is spent, and that each trial also has the budget of the settings', () => {
    expect(tune()).toContain('`--max-calls M` (1 to 200, 40 by default) is the most model calls that the whole invocation may make, counted where a call reaches the model, each retry included');
    expect(tune()).toContain('with the reason in the table and on the error output and exit code 1, and what was done is kept');
    expect(tune()).toContain('Each trial is also held to the budget of the settings');
  });

  it('says where it writes and what it never touches, that the pages are not in the bucket, and that the workflow does not upload them', () => {
    expect(tune()).toContain('Only below `runs/tune/<stamp>/`');
    expect(tune()).toContain('It never touches `site/`, the desk state or git, and it never uses the evidence store of the settings');
    expect(tune()).toContain('the daily workflow does not upload it');
  });

  it('says that it has only been run on scripted models and made-up pages, and that prices are a setting', () => {
    expect(tune()).toContain('It has been run only against scripted models and made-up pages.');
    expect(section('The desk command')).toContain('and `prices` (what a million tokens cost, which only `desk tune` reads)');
    expect(section('The desk workspace')).toContain('`desk tune`, the command that measures them, is built and tested with scripted models and has never been run against a real one');
  });
});

describe('the README: the runbook', () => {
  const runbook = (): string => section('The runbook');

  it('is in the layout, and says what it is and its seven parts', () => {
    expect(section('Repository layout')).toContain('the runbook (`docs/runbook.md`): the operations that put the publication on the air');
    expect(runbook()).toContain('`docs/runbook.md` is the list of operations that put the publication on the air, in seven parts');
    expect(runbook()).toContain('rewrite the author and committer of every commit to the no-reply address of GitHub');
    expect(runbook()).toContain('going live (freezing the floor of the verifier, the four questions that the trials leave open, turning on the flags of `site/src/lib/live.ts` in a change of its own, switching on the schedule)');
    expect(runbook()).toContain('the schedule that stays off until a variable of the repository says `on`');
    expect(runbook()).toContain('a rehearsal on GitHub with `dry`, a rehearsal of a held piece in a private repository that is deleted afterwards');
    expect(runbook()).toContain('The US$10 of the plan is enforced by the spend limit that the owner sets on the key in the Anthropic Console: the Desk\'s own limits are of calls and tokens.');
  });

  it('says that an outward step is not run without the go-ahead of the owner, and that no secret is on a command line', () => {
    expect(runbook()).toContain('A step marked *outward* changes something outside the machine');
    expect(runbook()).toContain('is not run without the owner\'s go-ahead for that step');
    expect(runbook()).toContain('**No secret is on a command line.**');
    expect(runbook()).toContain('`gh secret set NAME < file`, `gh secret set --env-file file`, or `NAME="$(cat file)" command`');
  });

  it('says what the tests check of it, and what they cannot', () => {
    expect(runbook()).toContain('`desk/test/runbook.test.ts` fails when a step has no command or no expected result');
    expect(runbook()).toContain('when it names a check or a code of the gate that does not exist');
    expect(runbook()).toContain('when anything in it is shaped like a key or an e-mail address');
    expect(runbook()).toContain('so none can be run by a test');
  });

  it('no longer says that the runbook is yet to be written, where it is named', () => {
    expect(README).not.toContain('when it is written');
    expect(section('The daily workflow')).toContain('the first real run (docs/runbook.md) is the proof');
    expect(section('The tuning harness')).toContain('(docs/runbook.md, steps 17 to 21)');
  });
});

