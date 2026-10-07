// What the tests of a pull request share: reading markdown the way GitHub does, as far as the Desk needs to know where text is data.

/** The lines of markdown that are not inside a fenced block, and how many fenced blocks there are (CommonMark: a fence is closed by a fence of the same character that is at least as long). */
export function outsideFences(markdown: string): { outside: string[]; blocks: number; closed: boolean } {
  const outside: string[] = [];
  let open: { char: string; length: number } | undefined;
  let blocks = 0;
  for (const line of markdown.split('\n')) {
    if (open === undefined) {
      const start = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line);
      if (start === null) {
        outside.push(line);
        continue;
      }
      open = { char: (start[1] as string)[0] as string, length: (start[1] as string).length };
      blocks += 1;
      continue;
    }
    const end = /^ {0,3}(`+|~+)\s*$/.exec(line);
    if (end !== null && (end[1] as string)[0] === open.char && (end[1] as string).length >= open.length) open = undefined;
  }
  return { outside, blocks, closed: open === undefined };
}
