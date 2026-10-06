import { describe, expect, it } from 'vitest';
import { isAllowed, parseRobots, productToken } from '../../src/fetch/robots';

// robots.txt is how a site says what a program may fetch. The Desk obeys it and never works around it,
// so the reading of the file has to be exact: the standard (RFC 9309) decides every case below.

const TOKEN = 'AgenticMediaHouseDesk';
const file = (...lines: string[]): string => lines.join('\n');

describe('productToken', () => {
  it('is the name at the start of the user agent, before the version and the comment', () => {
    expect(productToken('AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)')).toBe('AgenticMediaHouseDesk');
    expect(productToken('Some_Bot-2 extra words')).toBe('Some_Bot-2');
  });

  it('refuses a user agent that does not start with a name', () => {
    expect(() => productToken(' AgenticMediaHouseDesk/0.1')).toThrow('has no product token');
    expect(() => productToken('')).toThrow('has no product token');
  });
});

describe('isAllowed: what a file allows', () => {
  const CASES: [string, string, string, boolean][] = [
    // [what the case shows, the file, the path, is it allowed]
    ['an empty file allows everything', '', '/anything', true],
    ['a file of comments allows everything', file('# nothing here', ''), '/anything', true],
    ['Disallow: / for everyone blocks the whole site', file('User-agent: *', 'Disallow: /'), '/', false],
    ['Disallow: / blocks a deep path', file('User-agent: *', 'Disallow: /'), '/news/2026/a', false],
    ['an empty Disallow allows everything', file('User-agent: *', 'Disallow:'), '/news', true],
    ['an empty Allow does not allow what a Disallow blocks', file('User-agent: *', 'Disallow: /x', 'Allow:'), '/x', false],
    ['a Disallow blocks by prefix: the path itself', file('User-agent: *', 'Disallow: /private'), '/private', false],
    ['a Disallow blocks by prefix: below it', file('User-agent: *', 'Disallow: /private'), '/private/a', false],
    ['a Disallow blocks by prefix: a longer name that starts with it', file('User-agent: *', 'Disallow: /private'), '/privateer', false],
    ['a Disallow leaves other paths alone', file('User-agent: *', 'Disallow: /private'), '/public', true],
    ['a Disallow with a trailing slash leaves the path without it alone', file('User-agent: *', 'Disallow: /private/'), '/private', true],
    ['paths are case-sensitive', file('User-agent: *', 'Disallow: /Private'), '/private', true],
    ['a longer Allow beats a shorter Disallow', file('User-agent: *', 'Disallow: /news', 'Allow: /news/public'), '/news/public/a', true],
    ['a longer Disallow beats a shorter Allow', file('User-agent: *', 'Allow: /news', 'Disallow: /news/secret'), '/news/secret/a', false],
    ['the shorter Disallow still applies where the longer Allow does not', file('User-agent: *', 'Disallow: /news', 'Allow: /news/public'), '/news/secret', false],
    ['the order of the lines does not matter', file('User-agent: *', 'Allow: /news/public', 'Disallow: /news'), '/news/public/a', true],
    ['when an Allow and a Disallow match equally, the Allow wins', file('User-agent: *', 'Disallow: /page', 'Allow: /page'), '/page', true],
    ['when an Allow and a Disallow match equally, the Allow wins, whatever the order', file('User-agent: *', 'Allow: /page', 'Disallow: /page'), '/page', true],
    ['a star matches any run of characters', file('User-agent: *', 'Disallow: /*/drafts/'), '/a/drafts/1', false],
    ['a star needs the text around it to match', file('User-agent: *', 'Disallow: /*/drafts/'), '/drafts/1', true],
    ['a star may match nothing', file('User-agent: *', 'Disallow: /a*b'), '/ab', false],
    ['a star in the middle matches', file('User-agent: *', 'Disallow: /a*b'), '/a-long-way-b/c', false],
    ['a star in the middle leaves a path without the end alone', file('User-agent: *', 'Disallow: /a*b'), '/a-long-way', true],
    ['two stars in order', file('User-agent: *', 'Disallow: /a*b*c'), '/a1b2c3', false],
    ['two stars out of order', file('User-agent: *', 'Disallow: /a*b*c'), '/a1c2b3', true],
    ['a dollar sign anchors the end of the path', file('User-agent: *', 'Disallow: /*.pdf$'), '/files/report.pdf', false],
    ['a dollar sign: a query after the name is not the end', file('User-agent: *', 'Disallow: /*.pdf$'), '/files/report.pdf?download=1', true],
    ['a dollar sign: a longer name is not the end', file('User-agent: *', 'Disallow: /*.pdf$'), '/files/report.pdfx', true],
    ['a dollar sign with no star is an exact match', file('User-agent: *', 'Disallow: /exact$'), '/exact', false],
    ['a dollar sign with no star does not match below the path', file('User-agent: *', 'Disallow: /exact$'), '/exact/more', true],
    ['the dollar sign of an anchored star can be matched by an empty star', file('User-agent: *', 'Disallow: /*.pdf$'), '/.pdf', false],
    ['a dollar sign that is not at the end is an ordinary character', file('User-agent: *', 'Disallow: /a$b'), '/a$b/c', false],
    ['a pattern that starts with a star, and not with a slash', file('User-agent: *', 'Disallow: *.pdf'), '/a/b.pdf', false],
    ['a pattern that starts with a star leaves other paths alone', file('User-agent: *', 'Disallow: *.pdf'), '/a/b.txt', true],
    ['a middle piece of a pattern that the path does not have', file('User-agent: *', 'Disallow: /a*b*c'), '/a1c2', true],
    ['the pieces of a pattern are found one after the other and do not overlap', file('User-agent: *', 'Disallow: /a*bb*b'), '/a1bb', true],
    ['the pieces of a pattern that follow one another', file('User-agent: *', 'Disallow: /a*bb*b'), '/a1bb2b', false],
    ['a bare star blocks everything', file('User-agent: *', 'Disallow: *'), '/anything', false],
    ['the query string is part of what is matched', file('User-agent: *', 'Disallow: /*?session='), '/page?session=1', false],
    ['a path with no query is not blocked by a rule about one', file('User-agent: *', 'Disallow: /*?session='), '/page', true],
    ['a path with no slash is read as the root', file('User-agent: *', 'Disallow: /'), '', false],
    ['directive names are not case-sensitive', file('USER-AGENT: *', 'DISALLOW: /x'), '/x', false],
    ['no space after the colon', file('User-agent:*', 'Disallow:/x'), '/x', false],
    ['a tab after the colon', 'User-agent:\t*\nDisallow:\t/x', '/x', false],
    ['spaces around the colon and the value do not matter', file('User-agent :   *  ', 'Disallow :   /x   '), '/x', false],
    ['a comment after a rule is not part of the rule', file('User-agent: *', 'Disallow: /x # because'), '/x/y', false],
    ['a comment after a rule is not part of the rule: the rest of the site is open', file('User-agent: *', 'Disallow: /x # because'), '/y', true],
    ['windows line endings', 'User-agent: *\r\nDisallow: /x\r\n', '/x', false],
    ['old mac line endings', 'User-agent: *\rDisallow: /x\r', '/x', false],
    ['a byte order mark at the start of the file', `${String.fromCharCode(0xfeff)}User-agent: *\nDisallow: /x`, '/x', false],
    ['a group for another agent does not apply', file('User-agent: otherbot', 'Disallow: /'), '/news', true],
    ['a group for another agent does not apply: the star group does', file('User-agent: otherbot', 'Disallow: /', '', 'User-agent: *', 'Disallow: /x'), '/news', true],
    ['our own group applies', file('User-agent: AgenticMediaHouseDesk', 'Disallow: /'), '/news', false],
    ['the name of the agent is not case-sensitive', file('User-agent: agenticmediahousedesk', 'Disallow: /'), '/news', false],
    ['only the whole name matches: a longer name is another agent', file('User-agent: AgenticMediaHouseDeskPlus', 'Disallow: /'), '/news', true],
    ['only the whole name matches: a shorter name is another agent', file('User-agent: AgenticMediaHouse', 'Disallow: /'), '/news', true],
    ['a version after the name does not match, the name alone is the token', file('User-agent: AgenticMediaHouseDesk/0.1', 'Disallow: /'), '/news', true],
    ['our group replaces the star group: the star group is not added to it', file('User-agent: *', 'Disallow: /', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /secret'), '/news', true],
    ['our group replaces the star group: our own rules still apply', file('User-agent: *', 'Disallow: /', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /secret'), '/secret', false],
    ['our group may allow what the star group blocks', file('User-agent: *', 'Disallow: /', '', 'User-agent: AgenticMediaHouseDesk', 'Allow: /'), '/news', true],
    ['an agent line before ours shares its group with ours', file('User-agent: otherbot', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /x'), '/x', false],
    ['an agent line after ours shares its group with ours', file('User-agent: AgenticMediaHouseDesk', 'User-agent: otherbot', 'Disallow: /x'), '/x', false],
    ['a blank line does not end a list of agents', file('User-agent: otherbot', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /x'), '/x', false],
    ['an agent line after a rule starts a new group', file('User-agent: otherbot', 'Disallow: /x', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /y'), '/x', true],
    ['two groups of the same agent are one group: the first', file('User-agent: AgenticMediaHouseDesk', 'Disallow: /a', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /b'), '/a', false],
    ['two groups of the same agent are one group: the second', file('User-agent: AgenticMediaHouseDesk', 'Disallow: /a', '', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /b'), '/b', false],
    ['a Sitemap line is not a rule', file('Sitemap: https://www.fixture-robotics.example/sitemap.xml', 'User-agent: *', 'Disallow: /x'), '/x', false],
    ['a Sitemap line between agents does not break the list', file('User-agent: otherbot', 'Sitemap: https://www.fixture-robotics.example/s.xml', 'User-agent: AgenticMediaHouseDesk', 'Disallow: /x'), '/x', false],
    ['a Crawl-delay line is not a rule', file('User-agent: *', 'Crawl-delay: 10'), '/x', true],
    ['a rule before any User-agent line is ignored', file('Disallow: /', 'User-agent: *', 'Disallow: /x'), '/news', true],
    ['a pattern that does not start with a slash is ignored', file('User-agent: *', 'Disallow: private'), '/private', true],
    ['a line that is not a directive is ignored', file('User-agent: *', 'this line has no colon', 'Disallow: /x'), '/x', false],
    ['a page that is not a robots.txt allows everything', '<!DOCTYPE html><html><body>Page not found</body></html>', '/news', true],
  ];

  it.each(CASES)('%s', (_name, text, path, allowed) => {
    expect(isAllowed(text, TOKEN, path)).toBe(allowed);
  });

  it('is not slowed down by a pattern with many stars, which a backtracking matcher would take forever over', () => {
    const text = file('User-agent: *', `Disallow: /${'a*'.repeat(60)}b`);
    expect(isAllowed(text, TOKEN, `/${'a'.repeat(100_000)}`)).toBe(true);
  });
});

describe('parseRobots', () => {
  it('lists the groups, with the agents in lowercase and the rules in file order', () => {
    const parsed = parseRobots(file('User-agent: AgenticMediaHouseDesk', 'User-agent: OtherBot', 'Disallow: /a', 'Allow: /a/b', '', 'User-agent: *', 'Disallow: /'));
    expect(parsed.groups).toEqual([
      {
        agents: ['agenticmediahousedesk', 'otherbot'],
        rules: [
          { allow: false, pattern: '/a' },
          { allow: true, pattern: '/a/b' },
        ],
      },
      { agents: ['*'], rules: [{ allow: false, pattern: '/' }] },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('has no group and no warning for an empty file', () => {
    expect(parseRobots('')).toEqual({ groups: [], warnings: [] });
  });

  it('keeps a group that has agents and no rules', () => {
    expect(parseRobots('User-agent: *').groups).toEqual([{ agents: ['*'], rules: [] }]);
  });

  it('gives no warning for a file that is well formed, with comments, blank lines and directives it does not use', () => {
    const text = file('# robots', 'Sitemap: https://www.fixture-robotics.example/s.xml', '', 'User-agent: *', 'Crawl-delay: 5', 'Disallow: /x # why', '');
    expect(parseRobots(text).warnings).toEqual([]);
  });

  it('warns about a rule before any agent, and says which line', () => {
    expect(parseRobots(file('# top', 'Disallow: /x', 'User-agent: *')).warnings).toEqual(['line 2: the rule "Disallow: /x" is before any User-agent line, so it is ignored']);
  });

  it('says Allow when it is an Allow line that comes before any agent', () => {
    expect(parseRobots(file('Allow: /x', 'User-agent: *')).warnings).toEqual(['line 1: the rule "Allow: /x" is before any User-agent line, so it is ignored']);
  });

  it('does not take a line of nothing but white space for a problem, and does not show the white space round a line that is one', () => {
    expect(parseRobots('User-agent: *\n   \t \nDisallow: /x').warnings).toEqual([]);
    expect(parseRobots('User-agent: *\n   what is this   ').warnings).toEqual(['line 2 is not a directive and is ignored: "what is this"']);
  });

  it('warns about a pattern that does not start with a slash', () => {
    expect(parseRobots(file('User-agent: *', 'Disallow: private')).warnings).toEqual(['line 2: the pattern "private" does not start with / or *, so the rule is ignored']);
  });

  it('warns about an empty agent name', () => {
    expect(parseRobots(file('User-agent:', 'Disallow: /x')).warnings).toEqual(['line 1: a User-agent line with no name is ignored', 'line 2: the rule "Disallow: /x" is before any User-agent line, so it is ignored']);
  });

  it('warns about a line that is not a directive, and shows the start of it', () => {
    const warnings = parseRobots(file('User-agent: *', 'what is this', 'Disallow: /x')).warnings;
    expect(warnings).toEqual(['line 2 is not a directive and is ignored: "what is this"']);
  });

  it('shortens a long line that is not a directive in its warning', () => {
    const [warning] = parseRobots(`User-agent: *\n${'x'.repeat(200)}`).warnings;
    expect(warning).toBe(`line 2 is not a directive and is ignored: "${'x'.repeat(40)}..."`);
  });

  it('shows a line of 40 characters whole, and shortens one of 41', () => {
    expect(parseRobots(`User-agent: *\n${'x'.repeat(40)}`).warnings).toEqual([`line 2 is not a directive and is ignored: "${'x'.repeat(40)}"`]);
    expect(parseRobots(`User-agent: *\n${'x'.repeat(41)}`).warnings).toEqual([`line 2 is not a directive and is ignored: "${'x'.repeat(40)}..."`]);
  });

  it('says a page that is not a robots.txt is not one, and that everything is allowed', () => {
    const { groups, warnings } = parseRobots('<!DOCTYPE html>\n<html><body>Page not found</body></html>');
    expect(groups).toEqual([]);
    expect(warnings).toContain('the file has no robots.txt directive in it, so everything is allowed');
    expect(warnings).toHaveLength(3);
  });

  it('does not say that for a file of comments alone', () => {
    expect(parseRobots('# only a comment\n\n').warnings).toEqual([]);
  });

  it('does not say that for a file with only a Sitemap line', () => {
    expect(parseRobots('Sitemap: https://www.fixture-robotics.example/s.xml').warnings).toEqual([]);
  });

  it('lists 20 problems without a word about more, and says that there are more when there is a 21st', () => {
    const problems = (count: number) => parseRobots(['User-agent: *', ...Array.from({ length: count }, (_, index) => `junk ${index}`)].join('\n')).warnings;
    expect(problems(20)).toHaveLength(20);
    expect(problems(20)).not.toContain('more problems in the file are not listed');
    expect(problems(21)).toHaveLength(21);
    expect(problems(21)[20]).toBe('more problems in the file are not listed');
    expect(problems(22)).toHaveLength(21);
  });

  it('lists at most 20 warnings, and says that there were more', () => {
    const { warnings } = parseRobots(Array.from({ length: 1000 }, (_, index) => `junk ${index}`).join('\n'));
    expect(warnings).toHaveLength(22);
    expect(warnings[0]).toBe('line 1 is not a directive and is ignored: "junk 0"');
    expect(warnings[19]).toBe('line 20 is not a directive and is ignored: "junk 19"');
    expect(warnings[20]).toBe('more problems in the file are not listed');
    expect(warnings[21]).toBe('the file has no robots.txt directive in it, so everything is allowed');
  });
});
