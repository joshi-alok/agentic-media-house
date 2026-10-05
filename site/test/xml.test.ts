import { describe, expect, it } from 'vitest';
import { xmlProblem } from '../scripts/audit/xml.mjs';

// The feed, the sitemap and the share cards are XML. A parser that is
// forgiving would let a broken one through, so the check is strict.

describe('xmlProblem', () => {
  it.each([
    ['a document with a declaration, attributes and escaped text', '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>A &amp; B</title></channel></rss>'],
    ['an SVG with a namespace', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="1" y="2">Fish &amp; chips</text></svg>'],
    ['an element that closes itself', '<a><b/></a>'],
    ['a comment after the root', '<a>text</a><!-- end -->'],
  ])('finds nothing wrong with %s', (_name, xml) => {
    expect(xmlProblem(xml)).toBeUndefined();
  });

  it.each([
    ['a tag closed by the wrong name', '<a><b></a>', "Expected closing tag 'b'"],
    ['a bare ampersand', '<a>fish & chips</a>', "char '&' is not expected"],
    ['a bare less-than sign', '<a>1 < 2</a>', "Invalid space after '<'"],
    ['an attribute with no quotes', '<a x=1/>', "Attribute 'x' is without value"],
    ['an attribute given twice', '<a b="1" b="2"/>', "Attribute 'b' is repeated"],
    ['two root elements', '<a/><b/>', 'Multiple possible root nodes found'],
    ['text after the root', '<a>x</a>trailing', 'Extra text at the end'],
    ['an empty document', '', 'Start tag expected'],
    ['a document of spaces', '   \n', 'Start tag expected'],
    ['text that is not XML', 'just text', "char 'j' is not expected"],
  ])('reports %s', (_name, xml, fragment) => {
    expect(xmlProblem(xml)).toContain(fragment);
  });

  it('says where the problem is', () => {
    expect(xmlProblem('<a>\n  <b>\n</a>')).toMatch(/line 3, column \d+\)$/);
  });
});
