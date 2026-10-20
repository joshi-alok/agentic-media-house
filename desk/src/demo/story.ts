import { FakeClient, candidateId } from '../index';
import type { ModelRequest } from '../index';
import type { ComposeReply } from '../stages/draft-assembly';
import type { VerifyReply } from '../stages/verify-model';
import { DEMO_URLS } from './world';

// The story that the made-up world tells, as a scripted model would tell it: which story Select chooses, the claims that Extract proposes
// from the release of Fixture Robotics, the piece that Compose writes from them, and a verifier that clears it. It is a story of a company's own
// announcement, so every claim is from a primary source and nothing is attributed to another outlet. Every claim is word for word in the page of
// the release, and every sentence says only what the claims it cites say, so each stage of the pipeline passes it. It is a script for tests and for
// the dry-run demo; no real model wrote it, and nothing in it is real.

/** A claim as the extract model proposes it. `source` is the number of the page: the release of Fixture Robotics is page 1. */
export const DEMO_CLAIMS = [
  {
    text: 'Fixture Robotics has begun shipping FX-1 warehouse arms to the second Brindle Logistics plant, at Tarnmoor.',
    label: 'second plant',
    type: 'event',
    quote: 'Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.',
    values: [
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
      { kind: 'name', raw: 'Brindle Logistics', normalised: 'brindle logistics' },
      { kind: 'name', raw: 'Tarnmoor', normalised: 'tarnmoor' },
    ],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'Fixture Robotics announced on 1 October 2026 that deliveries have started.',
    label: 'deliveries started',
    type: 'date',
    quote: 'Tarnmoor, 1 October 2026: Fixture Robotics announced that deliveries have started.',
    values: [{ kind: 'date', raw: '1 October 2026', normalised: '2026-10-01' }],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage.',
    label: 'existing conveyor frames',
    type: 'spec',
    quote: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.',
    values: [{ kind: 'name', raw: 'FX-1', normalised: 'fx-1' }],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'Fixture Robotics lists the FX-1 from $38,000, with delivery within 12 weeks of an order.',
    label: 'per arm',
    type: 'number',
    quote: 'Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.',
    values: [
      { kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' },
      { kind: 'number', raw: '12', normalised: '12' },
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
    ],
    basis: 'press-release',
    status: 'unspecified',
    source: 1,
  },
  {
    text: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    label: 'arms due at Tarnmoor',
    type: 'event',
    quote: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    values: [
      { kind: 'name', raw: 'Tarnmoor', normalised: 'tarnmoor' },
      { kind: 'number', raw: '60', normalised: '60' },
      { kind: 'date', raw: '30 November 2026', normalised: '2026-11-30' },
    ],
    basis: 'press-release',
    status: 'planned',
    source: 1,
  },
  {
    text: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    label: 'FX-1 arms in 2027',
    type: 'event',
    quote: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    values: [
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
      { kind: 'number', raw: '500', normalised: '500' },
      { kind: 'date', raw: '2027', normalised: '2027' },
    ],
    basis: 'press-release',
    status: 'planned',
    source: 1,
  },
  {
    text: 'Fixture Robotics will use the funds to expand FX-1 production.',
    label: 'expand FX-1 production',
    type: 'event',
    quote: 'Fixture Robotics said it will use the funds to expand FX-1 production.',
    values: [
      { kind: 'name', raw: 'Fixture Robotics', normalised: 'fixture robotics' },
      { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
    ],
    basis: 'press-release',
    status: 'planned',
    source: 1,
  },
];

const fact = (text: string, ...claimIds: string[]) => ({ kind: 'fact' as const, text, claimIds });
const analysis = (text: string, ...claimIds: string[]) => ({ kind: 'analysis' as const, text, claimIds });

/**
 * The piece that the composer writes from the seven claims: sentences that cite them, and nothing else (the slug, the date, the author and the
 * limitation sentences are written by code). It is 628 words of body as the gate counts them (the opening, the takeaways, the four sections and the limitations that
 * code adds), with three sentences of analysis, and the gate clears it.
 */
export const DEMO_REPLY: ComposeReply = {
  categories: ['humanoids'],
  title: fact('Fixture Robotics begins FX-1 deliveries to a second Brindle Logistics plant', 'c-1'),
  description: fact('Fixture Robotics has started shipping FX-1 arms to Brindle Logistics for its second plant, at Tarnmoor, and lists the arm from $38,000.', 'c-1', 'c-4'),
  opening: [
    fact('Fixture Robotics has begun shipping FX-1 warehouse arms to Brindle Logistics for its second plant, at Tarnmoor.', 'c-1'),
    fact('The company announced on 1 October 2026 that deliveries have started.', 'c-2'),
    fact('It lists the arm from $38,000, with delivery within 12 weeks of an order, and says it needs no new safety cage.', 'c-4', 'c-3'),
  ],
  takeaways: [
    fact('Fixture Robotics has begun shipping FX-1 arms to a second Brindle Logistics plant, at Tarnmoor.', 'c-1'),
    fact('The company says the FX-1 mounts on existing conveyor frames and needs no new safety cage.', 'c-3'),
    fact('Tarnmoor is due to receive 60 arms by 30 November 2026.', 'c-5'),
    fact('Fixture Robotics expects to build 500 FX-1 arms in 2027.', 'c-6'),
  ],
  sections: [
    {
      heading: 'What was announced',
      paragraphs: [
        [
          fact('Fixture Robotics announced on 1 October 2026 that deliveries of its FX-1 warehouse arm have started.', 'c-2', 'c-1'),
          fact("The FX-1 arms are built for both tote picking and trailer unloading, and they are going to Brindle Logistics for its second plant, at Tarnmoor, according to the company's announcement.", 'c-1'),
          fact('The announcement is datelined Tarnmoor, which is also where the arms are being delivered.', 'c-2', 'c-1'),
          fact('Deliveries to the second plant have begun, according to the company, which announced them on 1 October 2026.', 'c-1', 'c-2'),
          fact('Brindle Logistics is the customer that the company names for the second plant, and that plant is at Tarnmoor.', 'c-1'),
        ],
        [
          fact('The company said that the FX-1 mounts on existing conveyor frames and needs no new safety cage.', 'c-3'),
          fact('A customer with conveyor frames in place can therefore fit the arm to them, as the company describes it, without a new safety cage.', 'c-3'),
          analysis('The announcement gives a price and a delivery time but no measurement of how the arm performs.', 'c-3', 'c-4'),
        ],
      ],
    },
    {
      heading: 'What it costs',
      paragraphs: [
        [
          fact('Fixture Robotics lists the FX-1 from $38,000 per arm.', 'c-4'),
          fact('It says that delivery takes place within 12 weeks of an order, as the company lists it.', 'c-4'),
          fact('The company gives the price per arm, so a buyer of one arm sees the figure that the company lists.', 'c-4'),
          analysis('A list price and a lead time are the terms a buyer needs first, though neither says what the arm achieves.', 'c-4'),
        ],
        [
          fact('The FX-1 needs no new safety cage, the company said, and it mounts on existing conveyor frames.', 'c-3'),
          fact('Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.', 'c-4'),
        ],
      ],
    },
    {
      heading: 'What comes next',
      paragraphs: [
        [
          fact('Tarnmoor is due to receive 60 arms by 30 November 2026.', 'c-5'),
          fact('The delivery to Tarnmoor is therefore a schedule that the company has set, with 30 November 2026 as its end.', 'c-5'),
          fact('Fixture Robotics expects to build 500 FX-1 arms in 2027.', 'c-6'),
          fact('The company expects the 2027 build to reach 500 FX-1 arms, as it says in its announcement.', 'c-6'),
        ],
        [
          fact('Fixture Robotics said it will use the funds to expand FX-1 production.', 'c-7'),
          fact('The expansion of FX-1 production is what the company says it will use the funds for, according to its own announcement.', 'c-7'),
          analysis('A plan to build more arms and a schedule of deliveries are both statements of intent, and neither is a delivered result.', 'c-5', 'c-6', 'c-7'),
        ],
      ],
    },
    {
      heading: 'What the announcement leaves open',
      paragraphs: [
        [
          fact('Fixture Robotics has begun shipping FX-1 arms to Brindle Logistics, and the company says that deliveries to its second plant, at Tarnmoor, have started.', 'c-1', 'c-2'),
          fact('The company lists the arm from $38,000 per arm and gives 12 weeks as the delivery time after an order.', 'c-4'),
          analysis('Every figure in this piece comes from the announcement of the company, so none of them is a measurement made by anyone else.', 'c-4'),
        ],
        [
          fact('Tarnmoor is due to receive 60 arms by 30 November 2026, and the company expects to build 500 FX-1 arms in 2027.', 'c-5', 'c-6'),
          fact('The company said it will use the funds to expand FX-1 production, and it expects to build 500 FX-1 arms in 2027.', 'c-7', 'c-6'),
          analysis('The delivery schedule and the production plan are both plans, so they say what the company intends and not what it has delivered.', 'c-5', 'c-6'),
        ],
      ],
    },
  ],
};

/** The ids of the blocks of a message, in order. */
const blockIds = (message: string): string[] => [...message.matchAll(/<source id="([^"]+)">/g)].map((match) => match[1] as string);

/**
 * The reply of a verifier that clears everything it is shown: every sentence and every heading (the blocks whose id is `s` or `h` and a number)
 * is entailed, and the basis and the status of every claim (the blocks whose id is `c-` and a number) are supported. It reads what to clear
 * from the message, so it clears any piece. It is the scripted stand-in for a model that finds nothing wrong, for tests and for the demo.
 */
export function clearingVerifier(request: ModelRequest<unknown>): VerifyReply {
  const ids = blockIds(request.user);
  return {
    verdicts: ids.filter((id) => /^[sh]\d+$/.test(id)).map((id) => ({ id, reason: 'The passages say it.', missing: [], verdict: 'entailed' as const })),
    labels: ids.filter((id) => /^c-\d+$/.test(id)).map((id) => ({ id, basisSupported: true, statusSupported: true, reason: 'The passage supports the label.' })),
  };
}

/** The reason that the scripted select model gives for its choice. */
export const DEMO_SELECT_REASON = 'A product reached a customer site.';

/**
 * A fake model that tells the story, one reply for each of the four calls of a clean run: Select chooses the report of Mercer Wire on the second
 * plant, Extract proposes the seven claims of the release, Compose writes the piece, and Verify clears it.
 */
export function demoClient(): FakeClient {
  return new FakeClient()
    .script('select', { chosenId: candidateId(DEMO_URLS.mercerArticle), reasons: [DEMO_SELECT_REASON] })
    .script('extract', { claims: DEMO_CLAIMS })
    .script('compose', DEMO_REPLY)
    .script('verify', clearingVerifier);
}
