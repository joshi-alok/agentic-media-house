import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { describeIssues } from '../src/issues';

// A failed parse is reported as one line of plain text: where each problem is, and what is wrong with it.

const Shape = z.strictObject({
  answer: z.string(),
  items: z.array(z.strictObject({ name: z.string() })).optional(),
});

/** The error of parsing `value` with `Shape`; the test fails if the value is accepted. */
function errorOf(value: unknown): z.ZodError {
  const parsed = Shape.safeParse(value);
  if (parsed.success) throw new Error(`Shape accepted ${JSON.stringify(value)}`);
  return parsed.error;
}

describe('describeIssues', () => {
  it('names the place of a problem and says what is wrong with it', () => {
    expect(describeIssues(errorOf({ answer: 5 }))).toBe('answer: Invalid input: expected string, received number');
  });

  it('names a place inside a list by its position, joined with dots', () => {
    expect(describeIssues(errorOf({ answer: 'x', items: [{ name: 1 }] }))).toBe('items.0.name: Invalid input: expected string, received number');
  });

  it('gives only the message when the problem is with the value as a whole', () => {
    expect(describeIssues(errorOf({ answer: 'x', extra: 1 }))).toBe('Unrecognized key: "extra"');
    expect(describeIssues(errorOf('text'))).toBe('Invalid input: expected object, received string');
  });

  it('joins several problems with a semicolon, in the order Zod reports them', () => {
    expect(describeIssues(errorOf({ answer: 5, extra: 1 }))).toBe('answer: Invalid input: expected string, received number; Unrecognized key: "extra"');
  });
});
