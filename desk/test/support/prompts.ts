// What the tests of the prompts share: reading a message the way the model reads it, as the text of its blocks and the text outside them.

/** The text between the opening tag and the closing tag of each block of a message, with the id of the block. */
export function blocksOf(message: string): { id: string; text: string }[] {
  return [...message.matchAll(/<source id="([^"]+)">\n([\s\S]*?)\n<\/source>/g)].map((match) => ({ id: match[1] as string, text: match[2] as string }));
}

/** The message with every block taken out. */
export const outsideBlocks = (message: string): string => message.replace(/<source id="[^"]+">\n[\s\S]*?\n<\/source>/g, '');
