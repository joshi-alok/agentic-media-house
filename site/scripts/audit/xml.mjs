import { SyntaxValidator } from 'fast-xml-validator';

/**
 * What is wrong with an XML document, in words and with the line and column,
 * or undefined when it is well-formed. The check is strict: a second root
 * element, text after the root, a bare ampersand and an unquoted attribute
 * are all problems.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
export function xmlProblem(text) {
  try {
    SyntaxValidator.validate(text, { multipleRoots: false });
    return undefined;
  } catch (error) {
    // The validator throws a ValidationError with `line` and `col`.
    const { message, line, col } = /** @type {{ message: string; line: number; col: number }} */ (error);
    return `${message} (line ${line}, column ${col})`;
  }
}
