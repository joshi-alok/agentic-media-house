import { candidateId } from '../../src/run/artifacts';
import type { Candidate } from '../../src/run/artifacts';

// What the tests of the stages share: a valid candidate that any field can be replaced in.
// All of it is made up: Mercer Wire is an outlet that does not exist, and so is Fixture Robotics.

/** The day the tests pretend a run happens. */
export const RUN_DATE = '2026-10-05';

/** A valid candidate. Its id is made from its url, so a test that changes the url gets a matching id. */
export function candidate(overrides: Partial<Candidate> = {}): Candidate {
  const url = overrides.url ?? 'https://www.mercer-wire.example/2026/10/fixture-robotics-ships-fx-1';
  return {
    id: candidateId(url),
    title: 'Fixture Robotics ships its first FX-1 to a customer',
    url,
    publishedAt: '2026-10-04T08:00:00.000Z',
    outlet: 'Mercer Wire',
    tier: 2,
    beats: ['payments-commerce'],
    origin: 'feed',
    ...overrides,
  };
}
