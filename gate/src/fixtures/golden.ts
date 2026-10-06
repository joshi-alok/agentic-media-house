import { createHash } from 'node:crypto';
import { DESK_AUTHOR_NAME } from '../constants';
import { buildLimitations } from '../limitations';
import type { AnalysisSentence, Claim, ClaimValue, Draft, FactSentence } from '../schemas';
import { citedClaims } from '../sentences';

// The golden fixture: one complete, fictional news piece that passes every
// check. Fixture Robotics, the FX-1 arm, Brindle Logistics and every URL on a
// *.example domain are invented. Tests copy it (cloneGolden), change one thing
// and expect the matching check to notice.

const RETRIEVED_AT = '2026-10-04T04:30:00Z';

const RELEASE = 'https://fixture-robotics.example/news/fx-1-second-plant';
const DATASHEET = 'https://fixture-robotics.example/products/fx-1/datasheet';
const FILING = 'https://filings.example/fixture-robotics/offering-2026';
const CUSTOMER = 'https://brindle-logistics.example/news/ashvale-results';
const DEMO_DAY = 'https://fixture-robotics.example/events/demo-day';

const name = (raw: string): ClaimValue => ({ kind: 'name', raw, normalised: raw.toLowerCase() });
const date = (raw: string, normalised: string): ClaimValue => ({ kind: 'date', raw, normalised });
const number = (raw: string, normalised: string, unit?: string): ClaimValue =>
  unit === undefined ? { kind: 'number', raw, normalised } : { kind: 'number', raw, normalised, unit };

interface ClaimSpec extends Omit<Claim, 'source' | 'span'> {
  url: string;
  start: number;
  quote: string;
}

// The snapshot hash is the SHA-256 of the URL followed by the quote: not the
// hash of a real page, but deterministic and different for every claim.
function claim({ url, start, quote, ...rest }: ClaimSpec): Claim {
  return {
    ...rest,
    source: {
      url,
      tier: 1,
      snapshotHash: createHash('sha256')
        .update(url + quote)
        .digest('hex'),
      retrievedAt: RETRIEVED_AT,
    },
    span: { start, end: start + quote.length, quote },
  };
}

// The originals are frozen all the way down, so a test that forgets to copy
// them fails loudly instead of changing the fixture for every later test.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Twenty-eight claims from five sources. The bases are press-release,
// datasheet, filing, measured and demo; the statuses are unspecified,
// deployed, demonstrated and planned.
const CLAIMS: Claim[] = [
  // --- Fixture Robotics press release ---
  claim({
    id: 'c-1',
    text: 'Fixture Robotics has begun shipping FX-1 warehouse arms to the second Brindle Logistics plant, at Tarnmoor.',
    label: 'second plant',
    type: 'event',
    url: RELEASE,
    start: 112,
    quote:
      'Fixture Robotics has begun shipping FX-1 warehouse arms, built for tote picking and trailer unloading, to Brindle Logistics for its second plant, at Tarnmoor.',
    basis: 'press-release',
    status: 'unspecified',
    values: [name('Fixture Robotics'), name('FX-1'), name('Brindle Logistics'), name('Tarnmoor')],
  }),
  claim({
    id: 'c-2',
    text: 'Fixture Robotics announced on 1 October 2026 that deliveries have started.',
    label: 'deliveries started',
    type: 'date',
    url: RELEASE,
    start: 0,
    quote: 'Tarnmoor, 1 October 2026: Fixture Robotics announced that deliveries have started.',
    basis: 'press-release',
    status: 'unspecified',
    values: [date('1 October 2026', '2026-10-01')],
  }),
  claim({
    id: 'c-3',
    text: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage.',
    label: 'existing conveyor frames',
    type: 'spec',
    url: RELEASE,
    start: 278,
    quote: 'The FX-1 mounts on existing conveyor frames and needs no new safety cage, the company said.',
    basis: 'press-release',
    status: 'unspecified',
    values: [name('FX-1')],
  }),
  claim({
    id: 'c-4',
    text: 'Fixture Robotics lists the FX-1 from $38,000, with delivery within 12 weeks of an order.',
    label: 'per arm',
    type: 'number',
    url: RELEASE,
    start: 391,
    quote: 'Fixture Robotics lists the FX-1 from $38,000 per arm, with delivery within 12 weeks of an order.',
    basis: 'press-release',
    status: 'unspecified',
    values: [number('$38,000', '38000', 'USD'), number('12', '12'), name('Fixture Robotics'), name('FX-1')],
  }),
  claim({
    id: 'c-5',
    text: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    label: 'arms due at Tarnmoor',
    type: 'event',
    url: RELEASE,
    start: 498,
    quote: 'Tarnmoor is due to receive 60 arms by 30 November 2026.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Tarnmoor'), number('60', '60'), date('30 November 2026', '2026-11-30')],
  }),
  claim({
    id: 'c-6',
    text: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    label: 'FX-1 arms in 2027',
    type: 'event',
    url: RELEASE,
    start: 559,
    quote: 'Fixture Robotics expects to build 500 FX-1 arms in 2027.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Fixture Robotics'), name('FX-1'), number('500', '500'), date('2027', '2027')],
  }),
  claim({
    id: 'c-7',
    text: 'Fixture Robotics will use the funds to expand FX-1 production.',
    label: 'expand FX-1 production',
    type: 'event',
    url: RELEASE,
    start: 620,
    quote: 'Fixture Robotics said it will use the funds to expand FX-1 production.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Fixture Robotics'), name('FX-1')],
  }),
  // --- FX-1 datasheet ---
  claim({
    id: 'c-8',
    text: 'The FX-1 is rated for a payload of 12 kg at full reach.',
    label: 'payload',
    type: 'spec',
    url: DATASHEET,
    start: 340,
    quote: 'Rated payload: 12 kilograms at full reach.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('12 kilograms', '12', 'kg')],
  }),
  claim({
    id: 'c-9',
    text: 'The FX-1 has a maximum reach of 1.4 m.',
    label: 'reach',
    type: 'spec',
    url: DATASHEET,
    start: 392,
    quote: 'Maximum reach: 1.4 metres from the base.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('1.4 metres', '1.4', 'm')],
  }),
  claim({
    id: 'c-10',
    text: 'The FX-1 has a peak tool speed of 2.3 m/s.',
    label: 'top speed',
    type: 'spec',
    url: DATASHEET,
    start: 441,
    quote: 'Peak tool speed: 2.3 metres per second.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('2.3 metres per second', '2.3', 'm/s')],
  }),
  claim({
    id: 'c-11',
    text: 'The FX-1 repeats a position to within 0.05 mm.',
    label: 'repeatability',
    type: 'spec',
    url: DATASHEET,
    start: 488,
    quote: 'Repeatability: 0.05 mm.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('0.05 mm', '0.05', 'mm')],
  }),
  claim({
    id: 'c-12',
    text: 'The FX-1 can pick up to 1,200 items an hour.',
    label: 'pick rate',
    type: 'spec',
    url: DATASHEET,
    start: 520,
    quote: 'Throughput: up to 1.2k picks an hour.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('1.2k', '1200')],
  }),
  claim({
    id: 'c-13',
    text: 'The FX-1 weighs 38 kg.',
    label: 'arm mass',
    type: 'spec',
    url: DATASHEET,
    start: 575,
    quote: 'Arm mass: 38 kg.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('38 kg', '38', 'kg')],
  }),
  claim({
    id: 'c-14',
    text: 'The FX-1 draws 650 W in typical use.',
    label: 'power draw',
    type: 'spec',
    url: DATASHEET,
    start: 600,
    quote: 'Typical power draw: 650 W.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [number('650 W', '650', 'W')],
  }),
  claim({
    id: 'c-15',
    text: 'The FX-1 has an ingress protection rating of IP54.',
    label: 'ingress protection',
    type: 'spec',
    url: DATASHEET,
    start: 640,
    quote: 'Ingress protection: IP54, suitable for dusty warehouse floors.',
    basis: 'datasheet',
    status: 'unspecified',
    values: [name('IP54')],
  }),
  // --- Regulatory filing ---
  claim({
    id: 'c-16',
    text: 'The offering recorded in the filing had its first sale on 29 September 2026.',
    label: 'first-sale date',
    type: 'date',
    url: FILING,
    start: 210,
    quote: 'Date of first sale: 2026-09-29',
    basis: 'filing',
    status: 'unspecified',
    values: [date('2026-09-29', '2026-09-29')],
  }),
  claim({
    id: 'c-17',
    text: 'The offering raised USD 450 million.',
    label: 'funding round',
    type: 'number',
    url: FILING,
    start: 268,
    quote: 'Total amount sold: USD 450 million',
    basis: 'filing',
    status: 'unspecified',
    values: [number('USD 450 million', '450000000', 'USD')],
  }),
  claim({
    id: 'c-18',
    text: 'Corvane Partners led the offering.',
    label: 'lead investor',
    type: 'name',
    url: FILING,
    start: 330,
    quote: 'Lead investor: Corvane Partners',
    basis: 'filing',
    status: 'unspecified',
    values: [name('Corvane Partners')],
  }),
  claim({
    id: 'c-19',
    text: 'Seven investors took part in the offering.',
    label: 'investor count',
    type: 'number',
    url: FILING,
    start: 372,
    quote: 'Total number of investors: 7',
    basis: 'filing',
    status: 'unspecified',
    values: [number('7', '7')],
  }),
  // --- Brindle Logistics results ---
  claim({
    id: 'c-20',
    text: 'Brindle Logistics measured an 18 per cent cut in cycle time at Ashvale.',
    label: 'cycle-time cut',
    type: 'number',
    url: CUSTOMER,
    start: 84,
    quote:
      'At Ashvale, Brindle Logistics measured an 18 per cent cut in cycle time on tote-picking cells, comparing the four weeks before and after the FX-1 arms went live.',
    basis: 'measured',
    status: 'deployed',
    values: [number('18 per cent', '18', '%'), number('four', '4'), name('Ashvale'), name('Brindle Logistics'), name('FX-1')],
  }),
  claim({
    id: 'c-21',
    text: 'Ashvale averaged 940 picks an hour per arm over the same weeks.',
    label: 'measured pick rate',
    type: 'number',
    url: CUSTOMER,
    start: 251,
    quote: 'Across the same weeks, Ashvale averaged 940 picks an hour per arm.',
    basis: 'measured',
    status: 'deployed',
    values: [number('940', '940'), name('Ashvale')],
  }),
  claim({
    id: 'c-22',
    text: 'Dana Whitcombe of Brindle Logistics said the plant went from pilot to production in nine weeks.',
    label: 'pilot-to-production time',
    type: 'quote',
    url: CUSTOMER,
    start: 410,
    quote:
      '"We went from pilot to production in nine weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.',
    basis: 'press-release',
    status: 'deployed',
    values: [name('Dana Whitcombe'), name('Brindle Logistics')],
  }),
  claim({
    id: 'c-23',
    text: 'Brindle Logistics runs 40 FX-1 arms at its Ashvale plant.',
    label: 'Ashvale installation',
    type: 'event',
    url: CUSTOMER,
    start: 0,
    quote: 'Brindle Logistics now runs 40 FX-1 arms at its Ashvale plant.',
    basis: 'press-release',
    status: 'deployed',
    values: [number('40', '40'), name('Brindle Logistics'), name('FX-1'), name('Ashvale')],
  }),
  claim({
    id: 'c-24',
    text: 'The Brindle Logistics installation at Ashvale went live on 18 August 2026.',
    label: 'Ashvale go-live date',
    type: 'date',
    url: CUSTOMER,
    start: 62,
    quote: 'The Brindle Logistics installation at Ashvale went live on 18 August 2026.',
    basis: 'press-release',
    status: 'deployed',
    values: [date('18 August 2026', '2026-08-18'), name('Brindle Logistics'), name('Ashvale')],
  }),
  claim({
    id: 'c-25',
    text: 'Brindle Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.',
    label: 'Tarnmoor use',
    type: 'event',
    url: CUSTOMER,
    start: 520,
    quote: 'Brindle Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Brindle Logistics'), name('Tarnmoor')],
  }),
  claim({
    id: 'c-26',
    text: 'Brindle Logistics plans to add a third site in 2027.',
    label: 'third-site rollout',
    type: 'event',
    url: CUSTOMER,
    start: 604,
    quote: 'Brindle Logistics plans to add a third site in 2027.',
    basis: 'press-release',
    status: 'planned',
    values: [name('Brindle Logistics'), date('2027', '2027')],
  }),
  // --- Demo day ---
  claim({
    id: 'c-27',
    text: 'Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.',
    label: 'trailer unloading',
    type: 'event',
    url: DEMO_DAY,
    start: 150,
    quote: 'At its demo day, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.',
    basis: 'demo',
    status: 'demonstrated',
    values: [name('Fixture Robotics'), name('FX-1')],
  }),
  claim({
    id: 'c-28',
    text: 'The demo day was held on 24 September 2026.',
    label: 'demo day',
    type: 'date',
    url: DEMO_DAY,
    start: 20,
    quote: 'Demo day was held on 24 September 2026 in the three-bay test hall.',
    basis: 'demo',
    status: 'demonstrated',
    values: [date('24 September 2026', '2026-09-24'), number('three', '3')],
  }),
];

export const GOLDEN_CLAIMS: Claim[] = deepFreeze(CLAIMS);

const fact = (text: string, ...claimIds: string[]): FactSentence => ({ kind: 'fact', text, claimIds });
const analysis = (text: string, ...claimIds: string[]): AnalysisSentence => ({ kind: 'analysis', text, claimIds });

// The draft without its limitations. They are built from the claims the rest of the piece cites.
const BODY: Draft = {
  slug: 'fixture-robotics-ships-fx-1-to-second-plant',
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: DESK_AUTHOR_NAME },
  title: fact('Fixture Robotics ships its FX-1 warehouse arm to a second plant', 'c-1'),
  description: fact(
    'Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor.',
    'c-1',
    'c-8',
  ),
  opening: [
    fact(
      'Fixture Robotics has begun shipping its FX-1 warehouse arm to a second plant run by Brindle Logistics, at Tarnmoor.',
      'c-1',
    ),
    fact('The first site, at Ashvale, now runs 40 of the arms, and a third site is planned.', 'c-23', 'c-26'),
    fact(
      'The company also reported a $450 million funding round, led by Corvane Partners, in a regulatory filing.',
      'c-17',
      'c-18',
    ),
  ],
  takeaways: [
    fact('Tarnmoor is the second Brindle Logistics plant to receive FX-1 arms.', 'c-1'),
    fact('The datasheet lists a 12 kg rated payload and a 1.4 m maximum reach.', 'c-8', 'c-9'),
    fact('Brindle Logistics measured an 18% cut in cycle time at Ashvale.', 'c-20'),
    fact('The filing dates the first sale of the $450 million round to 29 September 2026.', 'c-16', 'c-17'),
  ],
  sections: [
    {
      heading: 'What shipped',
      paragraphs: [
        [
          fact(
            "Fixture Robotics announced on 1 October 2026 that deliveries of the FX-1 warehouse arm to Brindle Logistics have started at Tarnmoor, the customer's second plant.",
            'c-1',
            'c-2',
          ),
          fact('The company says the arm is built for tote picking and trailer unloading.', 'c-1'),
          fact('It also says the arm mounts on existing conveyor frames without a new safety cage.', 'c-3'),
          fact('Fixture Robotics lists the arm from $38,000, with delivery within 12 weeks of an order.', 'c-4'),
        ],
        [
          fact(
            'The datasheet lists a rated payload of 12 kg at full reach and a maximum reach of 1.4 m from the base.',
            'c-8',
            'c-9',
          ),
          fact('Peak tool speed is 2.3 m/s, and repeatability is 0.05 mm.', 'c-10', 'c-11'),
          fact('The same document gives a throughput of up to 1,200 picks an hour.', 'c-12'),
          fact('The arm itself weighs 38 kg and draws 650 W in typical use.', 'c-13', 'c-14'),
          fact(
            'It lists an ingress protection rating of IP54, which the company describes as suitable for dusty warehouse floors.',
            'c-15',
          ),
        ],
        [
          fact('At Ashvale, the first Brindle Logistics plant, 40 FX-1 arms are now running.', 'c-23'),
          fact('Tarnmoor is due to receive 60 arms by 30 November 2026.', 'c-5'),
          fact('Brindle Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.', 'c-25'),
        ],
      ],
    },
    {
      heading: 'What the customer reports',
      paragraphs: [
        [
          fact('At Ashvale, Brindle Logistics measured an 18% cut in cycle time on its tote-picking cells.', 'c-20'),
          fact('It compared the four weeks before and after the arms went live.', 'c-20'),
          fact('The installation at Ashvale went live on 18 August 2026, according to Brindle Logistics.', 'c-24'),
          fact(
            '"We went from pilot to production in nine weeks," said Dana Whitcombe, chief operating officer of Brindle Logistics.',
            'c-22',
          ),
        ],
        [
          fact('Across the same weeks, Ashvale averaged 940 picks an hour per arm.', 'c-21'),
          analysis(
            'The measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.',
            'c-21',
            'c-12',
          ),
          fact(
            'At a demo day on 24 September 2026, Fixture Robotics showed an FX-1 arm unloading mixed cartons from a trailer.',
            'c-27',
            'c-28',
          ),
          fact("The demonstration took place in the company's three-bay test hall.", 'c-28'),
        ],
        [
          fact('Brindle Logistics plans to add a third site in 2027.', 'c-26'),
          analysis(
            "The customer's results and the company's schedule together describe a rollout that is still at an early stage.",
            'c-21',
            'c-26',
          ),
        ],
      ],
    },
    {
      heading: 'What the filing shows',
      paragraphs: [
        [
          fact(
            'The round, led by Corvane Partners, totals $450 million, according to a regulatory filing.',
            'c-17',
            'c-18',
          ),
          fact('The filing records the first sale on 29 September 2026.', 'c-16'),
          fact('It lists 7 investors in the round.', 'c-19'),
        ],
        [
          fact('Fixture Robotics said it will use the funds to expand FX-1 production.', 'c-7'),
          fact('It expects to build 500 FX-1 arms in 2027.', 'c-6'),
          analysis('The stated use of the funds matches the production plan that the company describes.', 'c-7', 'c-6'),
        ],
      ],
    },
  ],
  limitations: [],
};

// The limitation sentences come from `buildLimitations`, the same function the
// pipeline will use, so the fixture and the gate's templates cannot drift apart.
const DRAFT: Draft = { ...BODY, limitations: buildLimitations(citedClaims(BODY, CLAIMS)) };

export const GOLDEN_DRAFT: Draft = deepFreeze(DRAFT);

/** A deep copy of the golden draft and claims, in the shape the gate takes. Tests change copies, never the originals. */
export function cloneGolden(): { draft: Draft; claims: Claim[] } {
  return structuredClone({ draft: GOLDEN_DRAFT, claims: GOLDEN_CLAIMS });
}
