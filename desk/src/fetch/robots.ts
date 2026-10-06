// robots.txt: how a site says what a program may fetch. The Desk reads it before it fetches anything
// from a host, obeys it, and never works around it. This file only reads and matches; the fetcher
// (http.ts) decides what to do when the file cannot be fetched.
//
// The rules are those of RFC 9309. A file is made of groups: one or more `User-agent` lines, then
// the `Allow` and `Disallow` lines that apply to those agents. A program uses the groups that name
// its product token exactly (in any case), and only if there are none, the groups that name `*`;
// it never mixes the two. Within the groups it uses, the rule with the longest pattern that
// matches the path wins, and an `Allow` wins a tie. A pattern is a prefix of the path, where `*`
// matches any run of characters and a `$` at the end means the path ends there. Paths are
// case-sensitive; directive names and agent names are not. What is matched is the path with its
// query string. Left out on purpose: percent-encoding is compared as written, and `Crawl-delay`
// is ignored (the Desk makes at most one request per second to a host, whatever the site asks).

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  /** The agent names of the group, in lowercase; `*` is everyone. */
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  /** What was wrong with the file, one sentence each (at most 20, then a note that there were more). The file is still used. */
  warnings: string[];
}

const MAX_WARNINGS = 20;

/** The name a program is known by in a robots.txt: the letters, digits, hyphens and underscores at the start of its user agent. */
export function productToken(userAgent: string): string {
  const token = /^[A-Za-z0-9_-]+/.exec(userAgent)?.[0];
  if (token === undefined) throw new Error(`the user agent ${JSON.stringify(userAgent)} has no product token: it must start with a name such as ExampleDesk`);
  return token;
}

/** The start of a line, for a warning. */
const excerpt = (line: string): string => (line.length > 40 ? `${line.slice(0, 40)}...` : line);

/**
 * Read the text of a robots.txt. It never throws: a file that cannot be understood gives fewer groups
 * (a file that is not a robots.txt at all gives none, which allows everything) and warnings.
 */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const warnings: string[] = [];
  let problems = 0;
  const warn = (message: string): void => {
    problems++;
    if (problems <= MAX_WARNINGS) warnings.push(message);
    else if (problems === MAX_WARNINGS + 1) warnings.push('more problems in the file are not listed');
  };

  let current: RobotsGroup | undefined;
  // True while the lines so far in the group are agent lines, so that one more agent line joins the group.
  let collecting = false;
  let contentLines = 0;
  let directives = 0;

  // A byte order mark at the start of the file counts as white space, so the trim of the first line takes it off.
  const lines = text.split(/\r\n|\r|\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    contentLines++;
    const colon = line.indexOf(':');
    const field = colon === -1 ? '' : line.slice(0, colon).trim().toLowerCase();
    if (!/^[a-z][a-z-]*$/.test(field)) {
      warn(`line ${index + 1} is not a directive and is ignored: ${JSON.stringify(excerpt(line))}`);
      continue;
    }
    directives++;
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (value === '') {
        warn(`line ${index + 1}: a User-agent line with no name is ignored`);
        continue;
      }
      if (!collecting || current === undefined) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collecting = true;
    } else if (field === 'allow' || field === 'disallow') {
      const allow = field === 'allow';
      if (current === undefined) {
        warn(`line ${index + 1}: the rule "${allow ? 'Allow' : 'Disallow'}: ${value}" is before any User-agent line, so it is ignored`);
        continue;
      }
      collecting = false;
      // An empty value is not a rule: an empty Disallow allows everything, and an empty Allow says nothing.
      if (value === '') continue;
      if (!value.startsWith('/') && !value.startsWith('*')) {
        warn(`line ${index + 1}: the pattern ${JSON.stringify(value)} does not start with / or *, so the rule is ignored`);
        continue;
      }
      current.rules.push({ allow, pattern: value });
    }
    // Any other directive (Sitemap, Crawl-delay, Host) is not a rule and does not change the groups.
  }

  if (contentLines > 0 && directives === 0) warnings.push('the file has no robots.txt directive in it, so everything is allowed');
  return { groups, warnings };
}

/**
 * Does `pattern` match the start of `path`? `*` matches any run of characters, and a `$` at the very end of the
 * pattern means the path must end where the pattern ends. This is done piece by piece between the stars, taking
 * the first place each piece occurs, which is enough to decide a match and takes time in proportion to the
 * length of the path times the number of stars. A regular expression would not: a pattern with many stars
 * would make it backtrack for as long as a hostile file likes.
 */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const pieces = (anchored ? pattern.slice(0, -1) : pattern).split('*');
  const first = pieces[0] as string;
  if (!path.startsWith(first)) return false;
  let position = first.length;
  if (pieces.length === 1) return anchored ? position === path.length : true;
  for (const piece of pieces.slice(1, -1)) {
    const found = path.indexOf(piece, position);
    if (found === -1) return false;
    position = found + piece.length;
  }
  const last = pieces[pieces.length - 1] as string;
  if (!anchored) return path.indexOf(last, position) !== -1;
  return path.length - last.length >= position && path.endsWith(last);
}

/**
 * May the agent with this product token fetch this path (with its query string, if any)? It uses the groups
 * that name the token, or if there are none the groups that name `*`, or if there are none it may fetch anything.
 */
export function robotsAllows(parsed: ParsedRobots, userAgentToken: string, path: string): boolean {
  const token = userAgentToken.toLowerCase();
  const named = parsed.groups.filter((group) => group.agents.includes(token));
  const used = named.length > 0 ? named : parsed.groups.filter((group) => group.agents.includes('*'));
  const target = path.startsWith('/') ? path : `/${path}`;
  let best: RobotsRule | undefined;
  for (const rule of used.flatMap((group) => group.rules)) {
    if (!matches(rule.pattern, target)) continue;
    const longer = best === undefined || rule.pattern.length > best.pattern.length;
    const tieForAllow = best !== undefined && rule.pattern.length === best.pattern.length && rule.allow && !best.allow;
    if (longer || tieForAllow) best = rule;
  }
  return best === undefined || best.allow;
}

/** `robotsAllows` for the text of a file: the text is read, its warnings are dropped, and the question is answered. */
export function isAllowed(robotsText: string, userAgentToken: string, path: string): boolean {
  return robotsAllows(parseRobots(robotsText), userAgentToken, path);
}
