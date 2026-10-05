import { expect } from 'vitest';
import type { z } from 'zod';

/** One line per validation issue, as `dotted.path: message`. The root path is `(root)`. */
export function issueLines(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

/** The dotted paths of every failing field. An empty list means the value is valid. */
export function failedPaths(schema: z.ZodType, value: unknown): string[] {
  return issueLines(schema, value).map((line) => line.slice(0, line.indexOf(': ')));
}

/** Assert that `value` parses, printing the validation issues if it does not. */
export function expectValid(schema: z.ZodType, value: unknown): void {
  const result = schema.safeParse(value);
  expect(result.success ? [] : result.error.issues).toEqual([]);
}

/**
 * Return a deep copy of `base` with the value at the dotted `path` replaced
 * (array indexes are path segments: `sections.0.heading`). Passing `undefined`
 * makes a required field look missing. The result is `unknown` on purpose: tests
 * use this to build values that are NOT valid, which the types would forbid.
 */
export function patch(base: unknown, path: string, value: unknown): unknown {
  const copy = structuredClone(base) as Record<string, unknown>;
  const keys = path.split('.');
  const last = keys[keys.length - 1] as string;
  let cursor = copy;
  for (const key of keys.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[last] = value;
  return copy;
}
