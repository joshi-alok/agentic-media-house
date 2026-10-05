// Fixture mode. The fixtures are fictional pieces used to build and test the
// site before the Desk has published anything. They are read only when the
// build is started with ROBYWIRE_FIXTURES=1 (`npm run build:fixtures`); a
// production build reads src/content/ and never touches src/content-fixtures/.

/** True when `env` asks for fixture content. Only the exact value "1" does. */
export function fixturesEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.ROBYWIRE_FIXTURES === '1';
}

/** True for this build. */
export const useFixtures: boolean = fixturesEnabled();

/** The folder under src/ that holds the content to read. */
export function contentFolder(fixtures: boolean = useFixtures): 'content' | 'content-fixtures' {
  return fixtures ? 'content-fixtures' : 'content';
}
