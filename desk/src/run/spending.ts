import type { ClientKind, SourcesKind } from './artifacts';

// What the Desk will not do with money. The model of the Anthropic API is paid for by the call, and the pages of the made-up world (`--sources fixtures`) are
// fictional: whatever a model said about them would be worth nothing, and there is no case in which it is wanted. So the pair is refused in one place, which every
// command that picks a client and a world asks (the command line when it reads its arguments, the orchestrator before it takes the lock, and the tuning command
// that comes later).

/**
 * Why the client `client` may not be used on the sources `sources`, as a sentence that names the two flags and says what to use instead; `undefined` when the
 * pair is allowed. Only the Anthropic API on the made-up world is refused. The scripted client and the recorded client cost nothing, and live sources are real pages.
 */
export function refuseApiOnFixtures(client: ClientKind, sources: SourcesKind): string | undefined {
  if (client !== 'api' || sources !== 'fixtures') return undefined;
  return '--client api with --sources fixtures would spend money on the answers of a model about made-up pages, which are worth nothing: use --client fake for the scripted story or --client recorded with --cassettes, or use --sources live for real pages';
}
