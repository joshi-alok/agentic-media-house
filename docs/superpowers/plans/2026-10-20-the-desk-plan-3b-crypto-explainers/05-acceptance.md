## Plan 3b (part 5) — Acceptance

**Goal:** know, from real runs, whether the explainer path works, before anything is published. After this part the labelled set of the model check covers the new domain and the new kinds of item (headings, analysis, attribution), the model check has been measured on a real model and its floors chosen, six real explainers have been written by the Desk and read by the owner, and the runbook says how to rehearse a hold, how to choose pages and what was decided.

| Task | What it does |
|---|---|
| 17 | The labelled set grows from 60 to 90 sentences (30 more, in the domain: a heading, an analysis sentence, an invented name, a letter-and-digit figure, an attribution, a plan told as done, a date moved, a comparison swapped, two passages put together); the harness judges headings and analysis; the scripted verifier gives the new reply. |
| 18 | **Paid, needs the owner's go.** The model check is measured on the 90 sentences with the real model, and the floors are chosen from the numbers. |
| 19 | **Paid, needs the owner's go.** Six real pages go through the explainer path with `desk tune`; the drafts are read; what the prompts need is written down. |
| 20 | A hold can be rehearsed with one line of change; the runbook is brought to the explainer path; the questions the trials left open are answered or kept. |

**Starting state:** Part 04 done; `npm run verify` green. Tasks 18 and 19 spend money and publish nothing; Task 20 changes no code of the pipeline.

**Rules for every task in this part:** those of Part 01. Tasks 18 and 19 are executed by the person who runs them with the key read from its file for one command (`ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)"`), never written anywhere, and never printed. Each says what it costs; the sum of the two is about US$1 to US$1.5, inside the US$10 of the plan.

---

### Task 17: The labelled set covers the domain and the new kinds of item

The set has sixty sentences about a made-up robot arm. It cannot tell whether the model check catches the faults that matter now: an invented project, a figure with a letter in it, a plan told as done, an outlet named wrongly, a heading that promises more than its section, an analysis sentence that predicts. Thirty sentences are added, in ten sets of passages, each set with one sentence that the passages support, one that says what they do not, and one that changes them a little; two of the ten are about headings and about analysis, so that the harness has to judge those too.

**Files:**
- Modify: `desk/evals/verifier-set.json`, `desk/evals/run-verifier.ts`, `desk/evals/scripted.ts`, `desk/test/evals/verifier-set.test.ts`, `desk/test/evals/run-verifier.test.ts`, `docs/runbook.md` (step 20), `README.md` (where it says sixty sentences: `grep -n "sixty\|60 sentences" README.md docs/runbook.md desk/test/*.ts`)

- [ ] **Step 1: Write the failing tests**

`desk/test/evals/verifier-set-agents.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EvalItem, evaluateVerifier, loadVerifierSet, planOf } from '../../evals/run-verifier';
import { lazyVerifier, perfectVerifier, strictVerifier } from '../../evals/scripted';

const SET = loadVerifierSet();
const NEW = SET.items.slice(60);

describe('the ten sets of passages added for AI agents in crypto', () => {
  it('are thirty items, e-61 to e-90, ten of each label in triples that share their passages', () => {
    expect(NEW.map((item) => item.id)).toEqual(Array.from({ length: 30 }, (_, at) => `e-${String(at + 61)}`));
    for (let at = 0; at < 30; at += 3) {
      const triple = NEW.slice(at, at + 3);
      expect(triple.map((item) => item.label)).toEqual(['supported', 'unsupported', 'distorted']);
      expect(triple[1]?.passages).toEqual(triple[0]?.passages);
      expect(triple[2]?.passages).toEqual(triple[0]?.passages);
    }
  });

  it('have one set of headings and one of analysis, and facts in the rest', () => {
    expect(NEW.filter((item) => item.kind === 'heading').map((item) => item.id)).toEqual(['e-61', 'e-62', 'e-63']);
    expect(NEW.filter((item) => item.kind === 'analysis').map((item) => item.id)).toEqual(['e-76', 'e-77', 'e-78']);
    expect(NEW.filter((item) => item.kind === undefined)).toHaveLength(24);
  });

  it('name an outlet for the set that another outlet reported, and use the bases of the domain', () => {
    const passages = NEW.flatMap((item) => item.passages);
    expect(passages.some((passage) => passage.basis === 'reported' && passage.outlet === 'Mercer Wire')).toBe(true);
    expect(new Set(passages.map((passage) => passage.basis))).toEqual(new Set(['docs', 'announcement', 'reported', 'filing', 'paper', 'demo']));
  });

  it('refuse a kind that is not fact, analysis or heading', () => {
    expect(EvalItem.safeParse({ ...NEW[0], kind: 'quote' }).success).toBe(false);
  });
});

describe('planOf: kinds', () => {
  it('puts a heading in the headings of the plan with an id that starts with h, and the others in the sentences, analysis marked as such', () => {
    const plan = planOf(SET.items.slice(60, 70));
    expect(plan.headings.map((heading) => heading.id)).toEqual(['h0', 'h1', 'h2']);
    expect(plan.headings[0]).toMatchObject({ text: 'How a payment is settled', claimIds: ['c-1'] });
    expect(plan.sentences.map((sentence) => sentence.id)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8', 's9']);
    expect(plan.sentences.every((sentence) => sentence.kind === 'fact')).toBe(true);
    const analysis = planOf(SET.items.slice(75, 78));
    expect(analysis.headings).toEqual([]);
    expect(analysis.sentences.map((sentence) => sentence.kind)).toEqual(['analysis', 'analysis', 'analysis']);
  });
});

describe('evaluateVerifier on the ninety', () => {
  it('scores a verifier that knows the answers perfectly, in nine calls, headings and analysis included', async () => {
    const report = await evaluateVerifier(perfectVerifier(SET), SET, { model: 'm' });
    expect(report.items).toBe(90);
    expect(report.calls).toBe(9);
    expect(report.accuracy).toBe(1);
  });

  it('finds a lazy verifier wrong on every item that is not supported, and a strict one wrong on every supported item', async () => {
    const lazy = await evaluateVerifier(lazyVerifier(SET), SET, { model: 'm' });
    expect(lazy.perLabel.unsupported.recall).toBe(0);
    expect(lazy.perLabel.distorted.recall).toBe(0);
    const strict = await evaluateVerifier(strictVerifier(SET), SET, { model: 'm' });
    expect(strict.perLabel.supported.recall).toBe(0);
  });
});
```

Update `desk/test/evals/verifier-set.test.ts` and `desk/test/evals/run-verifier.test.ts` by **Rule R12:** every number that counts the set becomes the number for ninety: sixty → ninety, twenty of each label → thirty, `e-01` to `e-60` → `e-01` to `e-90`, forty flaws → sixty, six calls → nine; the loop over triples runs to 90; the test that the set is made up allows the new names (add `Pay|Wallet|Protocol|Registry|Labs|Network|Exchange` to the suffixes of the expression and `Harbor Pay`, `Lumen Wallet`, `Ketch Protocol`, `Ember Registry`, `Mallow Labs`, `Tessel Network`, `Vantage Exchange` to the sorted list of names, and keep `Mercer Wire` and `Gantry Daily` where they are); the test that says there are passages of at least six bases keeps its number. `grep -n "60\|sixty\|twenty\|forty\|six calls\|6 calls" desk/test/evals/*.ts` finds them.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/desk -- test/evals/verifier-set-agents.test.ts`
Expected: FAIL (the set has sixty items).

- [ ] **Step 3: The thirty items**

Append these to `items` in `desk/evals/verifier-set.json`, after `e-60`, in this order (the file is JSON: keep two-space indents and commas, and keep every character ASCII). Each triple shares its passages. A `kind` is given only where it is not a fact.

```json
{ "id": "e-61", "label": "supported", "kind": "heading", "sentence": "How a payment is settled",
  "passages": [{ "quote": "Harbor Pay settles each agent payment in a single on-chain transfer of USDC, with no intermediary holding the funds.", "basis": "docs", "status": "deployed" }] },
{ "id": "e-62", "label": "unsupported", "kind": "heading", "sentence": "Why Harbor Pay will win the market",
  "passages": [{ "quote": "Harbor Pay settles each agent payment in a single on-chain transfer of USDC, with no intermediary holding the funds.", "basis": "docs", "status": "deployed" }],
  "flaw": "Nothing in the passage says that Harbor Pay will win a market." },
{ "id": "e-63", "label": "distorted", "kind": "heading", "sentence": "How a payment is settled through an escrow",
  "passages": [{ "quote": "Harbor Pay settles each agent payment in a single on-chain transfer of USDC, with no intermediary holding the funds.", "basis": "docs", "status": "deployed" }],
  "flaw": "The passage says that no intermediary holds the funds, so there is no escrow." },

{ "id": "e-64", "label": "supported", "sentence": "Lumen Wallet adds session keys, which let an agent sign only the payments that its owner has allowed.",
  "passages": [{ "quote": "Lumen Wallet adds session keys, so that an agent can sign only the payments that its owner has allowed, up to a limit set by the owner.", "basis": "docs", "status": "deployed" }] },
{ "id": "e-65", "label": "unsupported", "sentence": "Lumen Wallet adds session keys, built with Ketch Protocol, which let an agent sign only the payments that its owner has allowed.",
  "passages": [{ "quote": "Lumen Wallet adds session keys, so that an agent can sign only the payments that its owner has allowed, up to a limit set by the owner.", "basis": "docs", "status": "deployed" }],
  "flaw": "The passage does not say that session keys were built with Ketch Protocol." },
{ "id": "e-66", "label": "distorted", "sentence": "Lumen Wallet adds session keys, so that an agent can sign any payment, up to a limit set by Lumen Wallet.",
  "passages": [{ "quote": "Lumen Wallet adds session keys, so that an agent can sign only the payments that its owner has allowed, up to a limit set by the owner.", "basis": "docs", "status": "deployed" }],
  "flaw": "The agent signs only the payments its owner allowed, and the owner sets the limit, not the wallet." },

{ "id": "e-67", "label": "supported", "sentence": "Ember Registry cut the cost of registering an agent identity from 4 dollars to 2 dollars.",
  "passages": [{ "quote": "Ember Registry lowered the cost of registering an agent identity from 4 dollars to 2 dollars.", "basis": "announcement", "status": "unspecified" }] },
{ "id": "e-68", "label": "unsupported", "sentence": "Ember Registry cut the cost of registering an agent identity from 4 dollars to 2 dollars, and made renewals free.",
  "passages": [{ "quote": "Ember Registry lowered the cost of registering an agent identity from 4 dollars to 2 dollars.", "basis": "announcement", "status": "unspecified" }],
  "flaw": "The passage says nothing about renewals." },
{ "id": "e-69", "label": "distorted", "sentence": "Ember Registry raised the cost of registering an agent identity from 2 dollars to 4 dollars.",
  "passages": [{ "quote": "Ember Registry lowered the cost of registering an agent identity from 4 dollars to 2 dollars.", "basis": "announcement", "status": "unspecified" }],
  "flaw": "The direction of the change is reversed." },

{ "id": "e-70", "label": "supported", "sentence": "Mallow Labs expects its agent runtime to reach general availability in the third quarter of 2027.",
  "passages": [{ "quote": "Mallow Labs expects its agent runtime to reach general availability in the third quarter of 2027, after a beta that began in March 2027.", "basis": "announcement", "status": "planned" }] },
{ "id": "e-71", "label": "unsupported", "sentence": "Mallow Labs expects its agent runtime to reach general availability in the third quarter of 2027 and to run ten times as many agents as its beta.",
  "passages": [{ "quote": "Mallow Labs expects its agent runtime to reach general availability in the third quarter of 2027, after a beta that began in March 2027.", "basis": "announcement", "status": "planned" }],
  "flaw": "The passage gives no figure for how many agents the runtime will run." },
{ "id": "e-72", "label": "distorted", "sentence": "Mallow Labs says its agent runtime reached general availability in the third quarter of 2027.",
  "passages": [{ "quote": "Mallow Labs expects its agent runtime to reach general availability in the third quarter of 2027, after a beta that began in March 2027.", "basis": "announcement", "status": "planned" }],
  "flaw": "A plan for the third quarter of 2027 is reported as done." },

{ "id": "e-73", "label": "supported", "sentence": "Mercer Wire reports that Tessel Network froze withdrawals after an agent drained funds from a vault.",
  "passages": [{ "quote": "Tessel Network has frozen withdrawals after an agent drained funds from a vault, Mercer Wire reported.", "basis": "reported", "status": "unspecified", "outlet": "Mercer Wire" }] },
{ "id": "e-74", "label": "unsupported", "sentence": "Gantry Daily reports that Tessel Network froze withdrawals after an agent drained funds from a vault.",
  "passages": [{ "quote": "Tessel Network has frozen withdrawals after an agent drained funds from a vault, Mercer Wire reported.", "basis": "reported", "status": "unspecified", "outlet": "Mercer Wire" }],
  "flaw": "The report is Mercer Wire's, not Gantry Daily's." },
{ "id": "e-75", "label": "distorted", "sentence": "Mercer Wire reports that Tessel Network froze withdrawals after a hacker drained funds from a vault.",
  "passages": [{ "quote": "Tessel Network has frozen withdrawals after an agent drained funds from a vault, Mercer Wire reported.", "basis": "reported", "status": "unspecified", "outlet": "Mercer Wire" }],
  "flaw": "An agent has become a hacker." },

{ "id": "e-76", "label": "supported", "kind": "analysis", "sentence": "For an agent, proving who controls it is one signed transaction, which keeps the check simple.",
  "passages": [{ "quote": "Ketch Protocol lets an agent prove who controls it by signing a challenge with the key of its owner. The check takes one transaction.", "basis": "docs", "status": "deployed" }] },
{ "id": "e-77", "label": "unsupported", "kind": "analysis", "sentence": "This is likely to make Ketch Protocol the default identity layer for agents on Ethereum.",
  "passages": [{ "quote": "Ketch Protocol lets an agent prove who controls it by signing a challenge with the key of its owner. The check takes one transaction.", "basis": "docs", "status": "deployed" }],
  "flaw": "A prediction about adoption that the passage does not support." },
{ "id": "e-78", "label": "distorted", "kind": "analysis", "sentence": "This shows that an agent must send a transaction for every payment it makes.",
  "passages": [{ "quote": "Ketch Protocol lets an agent prove who controls it by signing a challenge with the key of its owner. The check takes one transaction.", "basis": "docs", "status": "deployed" }],
  "flaw": "The passage describes one transaction for the identity check, not one for each payment." },

{ "id": "e-79", "label": "supported", "sentence": "Vantage Exchange plans to let agents trade through an API.",
  "passages": [{ "quote": "Vantage Exchange plans to let agents trade through an API, with a launch date to be announced.", "basis": "announcement", "status": "planned" }] },
{ "id": "e-80", "label": "unsupported", "sentence": "Vantage Exchange plans to let agents trade through an API from the first quarter, with a fee of 0.1 percent.",
  "passages": [{ "quote": "Vantage Exchange plans to let agents trade through an API, with a launch date to be announced.", "basis": "announcement", "status": "planned" }],
  "flaw": "The passage gives no quarter and no fee." },
{ "id": "e-81", "label": "distorted", "sentence": "Vantage Exchange lets agents trade through an API.",
  "passages": [{ "quote": "Vantage Exchange plans to let agents trade through an API, with a launch date to be announced.", "basis": "announcement", "status": "planned" }],
  "flaw": "A plan is reported as something that already exists." },

{ "id": "e-82", "label": "supported", "sentence": "The Lowmoor Safety Board invited comments on its guidance on agent wallets until 30 April 2027.",
  "passages": [{ "quote": "The Lowmoor Safety Board published its guidance on agent wallets on 12 March 2027 and invited comments until 30 April 2027.", "basis": "filing", "status": "unspecified" }] },
{ "id": "e-83", "label": "unsupported", "sentence": "The Lowmoor Safety Board invited comments on its guidance on agent wallets until 30 April 2027, and will make the guidance binding in 2028.",
  "passages": [{ "quote": "The Lowmoor Safety Board published its guidance on agent wallets on 12 March 2027 and invited comments until 30 April 2027.", "basis": "filing", "status": "unspecified" }],
  "flaw": "The passage says nothing about the guidance becoming binding." },
{ "id": "e-84", "label": "distorted", "sentence": "The Lowmoor Safety Board invited comments on its guidance on agent wallets until 12 March 2027.",
  "passages": [{ "quote": "The Lowmoor Safety Board published its guidance on agent wallets on 12 March 2027 and invited comments until 30 April 2027.", "basis": "filing", "status": "unspecified" }],
  "flaw": "The date of publication has been given as the date when comments close." },

{ "id": "e-85", "label": "supported", "sentence": "In the test, Harbor Pay finished 1,000 payments faster than Ketch Protocol.",
  "passages": [{ "quote": "In the test, Harbor Pay finished 1,000 payments in 40 seconds, while Ketch Protocol took 90 seconds.", "basis": "docs", "status": "demonstrated" }] },
{ "id": "e-86", "label": "unsupported", "sentence": "In the test, Harbor Pay finished 1,000 payments faster than Ketch Protocol, and at a lower cost.",
  "passages": [{ "quote": "In the test, Harbor Pay finished 1,000 payments in 40 seconds, while Ketch Protocol took 90 seconds.", "basis": "docs", "status": "demonstrated" }],
  "flaw": "The passage says nothing about cost." },
{ "id": "e-87", "label": "distorted", "sentence": "In the test, Ketch Protocol finished 1,000 payments in 40 seconds, faster than Harbor Pay.",
  "passages": [{ "quote": "In the test, Harbor Pay finished 1,000 payments in 40 seconds, while Ketch Protocol took 90 seconds.", "basis": "docs", "status": "demonstrated" }],
  "flaw": "The two times are swapped between the two projects." },

{ "id": "e-88", "label": "supported", "sentence": "Lumen Wallet supports session keys, which reduced approval prompts by 80 percent in the authors' evaluation.",
  "passages": [{ "quote": "Lumen Wallet supports session keys.", "basis": "docs", "status": "deployed" }, { "quote": "In the authors' evaluation, session keys reduced approval prompts by 80 percent.", "basis": "paper", "status": "unspecified" }] },
{ "id": "e-89", "label": "unsupported", "sentence": "Lumen Wallet supports session keys, which reduced approval prompts by 80 percent for every user.",
  "passages": [{ "quote": "Lumen Wallet supports session keys.", "basis": "docs", "status": "deployed" }, { "quote": "In the authors' evaluation, session keys reduced approval prompts by 80 percent.", "basis": "paper", "status": "unspecified" }],
  "flaw": "The 80 percent is from the authors' evaluation, not from every user." },
{ "id": "e-90", "label": "distorted", "sentence": "Lumen Wallet supports session keys, which reduced approval prompts by 80 percent in Lumen Wallet's own evaluation.",
  "passages": [{ "quote": "Lumen Wallet supports session keys.", "basis": "docs", "status": "deployed" }, { "quote": "In the authors' evaluation, session keys reduced approval prompts by 80 percent.", "basis": "paper", "status": "unspecified" }],
  "flaw": "The evaluation was the authors', not that of Lumen Wallet." }
```

**Changes made after the review of this task (the JSON above is the first form; the file holds the changed one).** Task 18 pays to read this set, and a passage whose basis or status a careful model must reject becomes a label failure that flags a supported item, so the set must not carry that noise. (1) The first passage of e-61 to e-66, e-76 to e-78 and e-88 to e-90 has `"status": "unspecified"`, not `deployed`: the Extract prompt gives `deployed` only to a source that says the thing is live or used outside the team, and "settles", "adds", "lets" and "supports" do not say that (the old items follow this). (2) e-85 to e-87 have `"basis": "demo"` (a test), so the test of the bases below expects `docs`, `announcement`, `reported`, `filing`, `paper` and `demo`. (3) The second passage of e-88 to e-90 reads `In the authors' independent evaluation, Lumen Wallet's session keys reduced approval prompts by 80 percent.` (it named no project, so the link of e-88 was stated by no passage). (4) The quote of e-82 to e-84 reads `In a notice filed on 12 March 2027, the Lowmoor Safety Board published its guidance on agent wallets and invited comments until 30 April 2027.` (a publication of guidance is not a filing). (5) e-76 reads `For an agent, proving who controls it takes one transaction, which keeps the check simple.` (the passage signs a challenge; it does not say the transaction is signed). Kept as they are, with the reasons: e-74 (a wrong outlet is `unsupported` in the second place of the triple; read misses of attribution by kind), e-77 (rejected on three grounds: a new entity, a new claim, a prediction). Task 18 reads the failures by kind (`label`, or the id of a sentence or heading), so that a label failure is not read as a miss of entailment.

and change the `about` of the file to `Ninety sentences for measuring the verifier of the Desk: for each of thirty sets of passages, one sentence (or heading, or analysis sentence) that the passages support, one that says something they do not say, and one that changes what they say in a small way. The first sixty are about a made-up robot arm, the last thirty about made-up projects in AI agents and crypto. Everything in it is made up.`

- [ ] **Step 4: The harness and the scripted verifier**

`desk/evals/run-verifier.ts`:
1. Import `HeadingItem` beside `SentenceItem`: `import type { HeadingItem, SentenceItem, VerifyPlan } from '../src/stages/verify-model';`.
2. `EvalItem` gains, after `sentence`: `kind: z.enum(['fact', 'analysis', 'heading']).optional(),` with the comment `/** What the text is: a statement of fact (the default), an analysis sentence, or the heading of a section. The verifier judges each by its own rule. */`.
3. `planOf` becomes

```ts
export function planOf(items: readonly EvalItem[]): VerifyPlan {
  const claims: Claim[] = [];
  const sentences: SentenceItem[] = [];
  const headings: HeadingItem[] = [];
  items.forEach((item, at) => {
    const claimIds = item.passages.map((passage) => {
      const claim = claimOf(`c-${claims.length + 1}`, passage);
      claims.push(claim);
      return claim.id;
    });
    if (item.kind === 'heading') {
      headings.push({ id: `h${at}`, text: item.sentence, where: `heading ${at + 1} of the batch`, claimIds });
    } else {
      sentences.push({ id: `s${at}`, kind: item.kind === 'analysis' ? 'analysis' : 'fact', section: 'body', where: `sentence ${at + 1} of the batch`, text: item.sentence, claimIds });
    }
  });
  return { sentences, headings, claims };
}
```

   and its doc comment: "…a sentence for each item (`s0`, `s1` and so on; a heading is `h0`, `h1`, numbered by the place of the item in the batch)…".
4. In `evaluateVerifier` replace the body of the `batch.forEach` with

```ts
    const planned = [...plan.sentences, ...plan.headings];
    batch.forEach((item, at) => {
      const entry = planned.find((candidate) => candidate.id === `${item.kind === 'heading' ? 'h' : 's'}${at}`) as SentenceItem | HeadingItem;
      const failed = judged.outcome.failures.some((failure) => failure.id === entry.id || (failure.kind === 'label' && entry.claimIds.includes(failure.id)));
      results.push({ id: item.id, label: item.label, cleared: !failed });
    });
```

`desk/evals/scripted.ts`: in `scriptedVerifier` change the filter to `/^[sh]\d+$/` and the entry to

```ts
          const verdict = decide(item);
          return { id: block.id, reason: 'Scripted.', missing: verdict === 'not_entailed' ? ['what the passages do not say'] : [], verdict };
```

   (the key order is the order of the schema: reason, missing, verdict).

- [ ] **Step 5: Run the new test, apply Rule R12, run everything**

Run: `npm test --workspace @robywire/desk -- test/evals`. All pass after Rule R12. Then the runbook and README: step 20 says "The labelled set of 60 sentences (20 supported, 20 unsupported, 20 distorted) goes to the real model in 6 calls" and `**Expect:** verifier evaluation: 60 sentences in 6 calls`: change to 90 (30 of each) and 9 calls, and tell that the first sixty are about a made-up robot arm and the last thirty about the domain. `grep -n "60 sentences\|sixty" README.md docs/runbook.md desk/test/*.ts` finds each; the tests that quote them (`desk/test/runbook.test.ts`, `desk/test/readme.test.ts`) change with them.

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
npm run evals:verifier
```

Expected: green; the last command (the scripted client, free) prints `verifier evaluation: 90 sentences in 9 calls, model claude-sonnet-5-5` with accuracy 1.00.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(evals): the labelled set of the model check has thirty more sentences about AI agents in crypto, with headings, analysis and attribution, and the harness judges them" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Measure the model check on a real model (paid, needs the owner's go)

This is step 20 of the runbook, on the new set, and then step 27 for the floors. It is not code. It needs the owner's explicit go: it spends about US$0.3 (nine calls of about 4,000 tokens in and 2,500 out each, on the model of the verifier).

- [ ] **Step 1: Ask for the go**

Say, in one line: "Task 18 measures the model check on 90 sentences with the real model: 9 calls, about US$0.3, publishes nothing. Go?" Do not run anything until the answer is yes.

- [ ] **Step 2: Run it**

```bash
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run evals:verifier -- --client api | tee runs/verifier-3b-1.out
```

Expected: `verifier evaluation: 90 sentences in 9 calls, model claude-sonnet-5-5`, a table of the recall for each label, the precision and recall of what it cleared and of what it flagged, the accuracy and the tokens. Exit code 0. `runs/` is ignored by git; the output holds no key.

- [ ] **Step 3: Read it, per kind, not only in total**

The table is by label. Look at the items it got wrong, by id: `node -e` over `runs/verifier-3b-1.out` does not show them (the report has no list of wrong items); add `--batch 3` to a second run only if a label's recall is below 0.8, and ask which of the thirty new items were wrong by running the harness through `tsx` in a scratch file that prints `report.results.filter((r) => r.cleared !== (r.label === 'supported'))`. Say which kinds of item the model check missed: headings (e-61 to e-63), analysis (e-76 to e-78), attribution (e-73 to e-75), plans told as done (e-70 to e-72, e-79 to e-81), moved dates and swapped comparisons (e-82 to e-87).

- [ ] **Step 4: Decide, and record**

| What the numbers say | What happens |
|---|---|
| Recall of each label at least 0.80, precision of what it cleared and of what it flagged at least 0.85 | Choose the floors (runbook step 27) at 0.05 under the lowest of the measured scores, rounded down to 0.05; say them to the owner for a yes; they are the arguments of `--min-precision` and `--min-recall` in the command that is run after every change to `desk/src/prompts/verify.ts` |
| A recall of a label under 0.80, or a precision under 0.85 | Stop. Do not choose floors. Report the table and the items it got wrong; the owner decides between changing the prompt of the model check (an ordinary task with a test first, and the measurement run again, about US$0.3) and turning the analysis check off (`verifyPlanOf` keeps `kind === 'fact'`, a one-line change that the tests of Task 4 show) |
| An exit of 1, an error of the schema, or a reply that judges what was not asked | Stop and report the message; the harness fails closed, and the cause is in the prompt of Task 2 |

Also count how often the Desk overruled the model's verdict: nothing records it, but the reason of the failure starts with `the verifier said entailed, but` or `the verifier said not entailed but named nothing` (in `runs/.../06-verify.json`, or in the notes the harness prints for a failed item); a verifier that is overruled often is a prompt to fix, and the second case is a confident rejection that was recoded to ambiguous. Report both counts.

Write the result in the plan index under "Results" (the numbers, the cost, the floors chosen or the reason none), commit that with `docs: Plan 3b records the measure of the model check`.

---

### Task 19: Six real explainers (paid, needs the owner's go)

This is runbook steps 17 to 19 for the explainer path: real pages, the real model, the whole pipeline from Extract to Verify, the drafts read by a person. It is `desk tune` (nothing is published or committed) with the profile of `desk.config.yml`, which is `explainer`. It needs the owner's go and the owner's choice of the six pages. About US$0.15 for each page: Extract once, Compose once, the model check once for each draft and a revision for each failure, so 3 to 9 calls; the cap of 60 calls makes the worst case US$1.

- [ ] **Step 1: Find candidate pages, free**

```bash
npm run desk -- sources-check --items --config desk.config.yml
```

Expected: the table of Task 13, with under each feed that was read the newest three items that hold a keyword and link to a primary page, each as a date, a title and an address. Choose, with the owner, **six pages of six different kinds**: a standard or a proposal (an ERC or an EIP, a page of the Model Context Protocol or of the Agent2Agent protocol), a thread of Ethereum Magicians or of Ethereum Research, a paper's abstract (arXiv or IACR), a post of a project (Stripe, Cloudflare, a16z crypto, the Ethereum Foundation), a statement of a regulator (SEC, CFTC, the Federal Reserve) and a page of documentation (x402). Prefer pages that are about agents, and one that is a page with little to say, to see a day with no story. Write the six addresses to `runs/tune-urls-explainers.txt`, one to a line, each with a `#` comment that says why it was chosen. **Show the six to the owner and wait for a yes.** A page that `robots.txt` does not allow is replaced by another.

- [ ] **Step 2: Ask for the go**

Say, in one line: "Task 19 runs six pages through the explainer path with the real model: up to 60 calls, about US$0.9, nothing is published. Go?" Do not run anything until the answer is yes.

- [ ] **Step 3: One page first**

```bash
grep -m 1 '^https' runs/tune-urls-explainers.txt > runs/tune-first-explainer.txt
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run desk -- tune --urls runs/tune-first-explainer.txt --config desk.config.yml --max-calls 12
```

Expected: `profile: explainer` in the first lines, then the block of the page. If it fails for a reason that is a bug (not a result), stop and report; do not go on to the six.

- [ ] **Step 4: The six**

```bash
ANTHROPIC_API_KEY="$(cat ~/.config/agentic-media-house/anthropic.key)" npm run desk -- tune --urls runs/tune-urls-explainers.txt --config desk.config.yml --max-calls 60 | tee runs/tune-explainers-1.out
```

Expected: a block for each page and `total: 6 pages, 6 trials, M of 60 model calls, ...`.

- [ ] **Step 5: Read every draft, as a reader and as the owner**

For each page open `runs/tune/<stamp>/<nn>/trial-1/05-compose.json` (the last draft is the last element of `drafts`), `06-verify.json` and `log.txt`, and answer, in a table (page, claims kept, route, model check, rounds, notes, would you publish it, why not):

1. **Would you publish it?** Could a reader check every sentence against its quotation? Is it an explainer, or a list of facts?
2. **Is every note under "What we couldn't verify" a sentence you can read?** (Task 1.)
3. **Where did the model check reject, and was it right?** Read the reasons and the lists of `missing`. A rejection that was wrong is a cost; a clearance that was wrong is a danger and the most important row.
4. **Which claims were dropped, and why?** (`quote-not-found`, `label-not-in-quote`, ...) A pattern is a fix for a prompt.
5. **Did the extra round (Task 3) change an outcome?** (`rounds` above `maxRevisionRounds`.)
6. **What did a page cost?**
7. **Which codes of the gate fired most?** `G4_FIGURE_UNSUPPORTED` on the name of a protocol (`x402`, `ERC-8004`, a hex address) means the writer used a name that only another claim has; the revision tells it which claim to cite. If a generic name that no passage needs to vouch for (such as `L2` or `Web3`) is blocked again and again, add it to `DEFAULT_NAME_ALLOW_LIST` of `gate/src/config.ts` in a task of its own, with a test; the rule is not loosened.

- [ ] **Step 6: Decide, and record**

| What the six show | What happens |
|---|---|
| At least four publish by the criterion of `desk tune` (three or more claims, route `publish`, the model check passed), and the owner would publish at least three | The explainer path works. Go to Task 20 |
| Fewer, and the causes are in what the models are told | An ordinary task of the plan for each cause, a test first, in `desk/src/prompts/` only (the rules of the gate and of the extraction are not loosened); then this task's Step 4 is run again on the pages that failed. Ask the owner before each paid run |
| Fewer, and a cause is a rule that is too strict for good pieces | Report it with the three examples; the owner decides. Do not change the rule |
| Fewer than three claims on most pages | `minClaims` is the lever (decision 8 of the index); report the claims that were kept and dropped for each page before changing it |

Write the table, the cost and the decision in the plan index under "Results", and commit it with `docs: Plan 3b records the six explainers`.

---

### Task 20: A hold can be rehearsed, and the runbook says the explainer's way

Step 23 of the runbook rehearses a held piece, in a private repository of its own. It forced a hold by a registry with no primary source; with explainers that makes a day with no story, not a hold, and the step says so ("a way that does is a task"). This is the task. One line of change in the private copy makes every draft fail a blocker that no rewritten sentence can mend, so that the run holds after the first draft without using a revision round: the least number of sections a piece must have is raised to 99. The same task brings the other steps of the runbook that the plan changed to the explainer path.

**Files:**
- Modify: `docs/runbook.md` (steps 17, 20 (done in Task 17), 23, 28 and the sentence that opens Part 6), `desk/test/runbook.test.ts`
- Modify (only if a test names a changed sentence): `README.md`, `desk/test/readme.test.ts`

- [ ] **Step 1: Write the failing tests**

In `desk/test/runbook.test.ts` replace the two tests that start `forces a hold in the rehearsal by a command that makes a registry that is valid ...` (around line 360) with:

```ts
  it('forces a hold in the rehearsal by a command that makes the least number of sections 99, so that no draft can be mended by a sentence', () => {
    const rehearsal = stepTitled(/^Rehearse a held piece/);
    const command = rehearsal.blocks.flatMap((block) => block.lines).find((line) => line.startsWith('node -e "'))!;
    const dir = scratch();
    mkdirSync(path.join(dir, 'gate/src/checks'), { recursive: true });
    writeFileSync(path.join(dir, 'gate/src/checks/g2-structure.ts'), readFileSync(`${ROOT}gate/src/checks/g2-structure.ts`, 'utf8'));
    execFileSync('bash', ['--noprofile', '--norc', '-e', '-c', command], { cwd: dir });
    const changed = readFileSync(path.join(dir, 'gate/src/checks/g2-structure.ts'), 'utf8');
    expect(changed).toContain('const MIN_SECTIONS = 99;');
    expect(changed).not.toContain('const MIN_SECTIONS = 2;');
    // Only that line changed.
    expect(changed.replace('const MIN_SECTIONS = 99;', 'const MIN_SECTIONS = 2;')).toBe(readFileSync(`${ROOT}gate/src/checks/g2-structure.ts`, 'utf8'));
  });

  it('says that the rehearsal holds by the sections and at the first draft, and no longer says that a registry with no primary source makes a hold certain', () => {
    const text = stepTitled(/^Rehearse a held piece/).text;
    expect(text).toContain('G2_SECTIONS_MIN');
    expect(text).toContain('without using a round of revision');
    expect(text).not.toContain('A registry with no primary source no longer makes a hold certain');
  });
```

(`scratch`, `ROOT`, `stepTitled`, `execFileSync`, `mkdirSync`, `writeFileSync` and `readFileSync` are what that test file already imports and uses; add the two `fs` names if one is missing. `stepTitled(...)` returns a step with `.blocks`; if it has no `.text`, use the field that holds the prose of the step: read the `Step` type at line 70 of the file.)

Add to the same file:

```ts
  it('tells the pages for the trials to be the pages a story is written from, and to look at them first with sources-check', () => {
    const step = stepTitled(/^Choose the pages/);
    expect(step.text).toContain('sources-check');
    expect(step.text).toContain('a standard or a proposal');
  });

  it('records, in the questions that the trials left open, that the model check judges analysis', () => {
    const step = stepTitled(/^Decide what the trials left open/);
    expect(step.text).toContain('Decided in Plan 3b: yes');
    expect(step.text).not.toContain('the model check never sees them');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts`
Expected: FAIL (the command still edits `sources.yml`).

- [ ] **Step 3: Edit the runbook**

`docs/runbook.md`:

**Step 17 (Choose the pages).** Replace the paragraph that begins `` `desk tune` takes a list `` with:

> `desk tune` takes a list of addresses of real pages and tells what each step of the pipeline found. The Desk writes an explainer from one primary page, so choose **three to six** pages that a story would be written from: a standard or a proposal, a thread of a forum of proposals, a paper's abstract, a project's post or documentation, a regulator's statement. Look first at what the sources have: `npm run desk -- sources-check --items --config desk.config.yml` fetches every entry of `sources.yml` as the Desk does (free, no key) and lists the newest three items of each feed that hold a keyword and link to a primary page. Use pages that are public and that `robots.txt` allows: the command says if one is not allowed, and does not fetch it. A line that is not an address is refused with its number. The file is in `runs/`, which git ignores.

and the example comment line in the `text` block becomes `# a proposal for agents, published this week`.

**Step 23.** Replace the command line `node -e "const fs=require('fs');const {parse,stringify}=...` with

```
node -e "const fs=require('fs');const f='gate/src/checks/g2-structure.ts';const t=fs.readFileSync(f,'utf8');if(!t.includes('const MIN_SECTIONS = 2;'))throw new Error('MIN_SECTIONS not found');fs.writeFileSync(f,t.replace('const MIN_SECTIONS = 2;','const MIN_SECTIONS = 99;'))"
```

and the next line `git commit -q -a -m "rehearsal: no primary source"` with `git commit -q -a -m "rehearsal: no draft can have enough sections"`. Replace the sentence that explains the copy ("in which the registry of sources has no primary source at all (so every story ... instead of holding one)") with: "in which the least number of sections a piece must have is 99 (check G2, `G2_SECTIONS_MIN`: no draft can have that many, and the failure is one that no rewritten sentence can mend, so the run holds after its first draft, without using a round of revision, whatever the model writes; this costs two calls of the model)". In the **Expect** paragraph replace the three sentences that begin `**If the run publishes instead**` and end `a way that does is a task.` with: "**If the run ends `no-story`** (there was no story with a primary page that day, or too few claims), no hold was tried: delete the repository and rehearse again on another day."

**Step 28, question 1.** Replace the text of item 1 with: "**Should the model check (G10) judge the analysis sentences?** Decided in Plan 3b: yes. The model check reads every analysis sentence beside the passages of the claims it cites and rejects one that adds an entity, an event, a figure or a claim of fact that they do not support; the code checks of G7 stay as a second line. Evidence to keep reading: the sentences labelled Analysis in the drafts of the week, and the rejections of the model check on them. If it rejects good analysis often, report it with the examples; the lever is the prompt of the model check, not the rule."

**Part 6 opening paragraph.** After "the verifier was measured (step 20)" add ", the six explainers of Plan 3b were read by the owner (step 19)".

- [ ] **Step 4: Run, then fix what quotes the changed sentences**

Run: `npm test --workspace @robywire/desk -- test/runbook.test.ts` → PASS. **Rule R13:** other tests that quote a sentence of steps 17, 23 or 28 (`grep -rn "no primary source\|three to five\|never sees them" desk/test site/test`) quote the new sentence. The test that every `bash` block of the runbook parses (if the file has one) must accept the new `node -e` line.

- [ ] **Step 5: Run everything and commit**

```bash
npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check
git add -A
git commit -m "docs: the runbook rehearses a hold with one line of change, chooses pages for explainers, and records that the model check judges analysis" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: green.

---

## What is left after this plan, and who does it

- **The owner:** the extra projects, exchanges and wallets for `sources.yml`; the six pages of Task 19; the floors of Task 18; the five days of the shadow week (runbook steps 22 to 26, on the explainer path now); the legal read, if wanted; rotating the Anthropic key and the Console spend cap; the choice of a domain; `DESK_SCHEDULE=on` (step 30); the merge of both branches.
- **Plan 3c:** the digest (see the index).
- **Later, when there is a reader for them:** the bases for chain data and for source code; JSON APIs; JavaScript-only sites.
