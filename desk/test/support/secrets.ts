// What a secret looks like, for the tests of the files that the repository publishes about its own running (the settings of the daily run, the workflows, the
// Cloudflare settings and the runbook). A safety net and not a proof: it knows the shapes of the keys that this project uses, and a secret of another shape gets through.
// It never says what it found, only which kind and on which line, so that a test that fails does not print the secret.

/** A token of the shape of a secret of an access key or of Cloudflare: forty characters or more of the characters that such secrets are made of. */
const LONG_TOKEN = /[A-Za-z0-9+/_=-]{40,}/g;

/** The fixed shapes: a name for what it is, and the pattern. */
const SHAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: 'an Anthropic key', pattern: /sk-ant-/ },
  { name: 'an access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'a token of GitHub', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** What kind of long token `token` is, if it is shaped like a secret: capitals, small letters and digits all together, or forty hexadecimal digits with letters among them. */
function kindOfToken(token: string): string | undefined {
  if (/^[0-9a-f]+$/.test(token) && /[0-9]/.test(token) && /[a-f]/.test(token)) return 'a long hexadecimal token';
  if (/[A-Z]/.test(token) && /[a-z]/.test(token) && /[0-9]/.test(token)) return 'a long mixed token';
  return undefined;
}

/**
 * What in `text` is shaped like a secret: one string for each kind that is on a line, in the order of the lines, such as `an Anthropic key (line 3)`. An empty list when
 * there is nothing. The text that matched is never in the answer.
 */
export function secretsIn(text: string): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, at) => {
    const kinds = new Set<string>();
    for (const { name, pattern } of SHAPES) if (pattern.test(line)) kinds.add(name);
    for (const match of line.matchAll(LONG_TOKEN)) {
      const kind = kindOfToken(match[0]);
      if (kind !== undefined) kinds.add(kind);
    }
    for (const kind of kinds) found.push(`${kind} (line ${at + 1})`);
  });
  return found;
}
