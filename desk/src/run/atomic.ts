import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Write a text file so that nobody reading it ever sees half of it: the text goes to a temporary
 * file in the same folder, and the temporary file is renamed over the real one, which is a single
 * step. The folder is created if it is missing. If anything fails, the temporary file is removed
 * and the error is thrown; the file that was there before is untouched. The temporary name is
 * different for every call, so two writes at once do not meet.
 */
export async function writeFileAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
