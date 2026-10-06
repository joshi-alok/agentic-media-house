import type { z } from 'zod';

/**
 * The problems of a failed parse as one line of text, one phrase each: where the
 * problem is (the names of the fields leading to it, joined with dots) and what is
 * wrong with it. A problem with the value as a whole has no place, only its message.
 */
export const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`)).join('; ');
