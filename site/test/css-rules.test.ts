import { describe, expect, it } from 'vitest';
import { cssViolations } from '../scripts/audit/css-rules.mjs';

// The design register has four rules about CSS: nothing is italic, there are no
// web fonts, corners are square and a border is never wider than a pixel. The
// source test and the audit of the built site both use this one detector, so
// it must read minified CSS as well as the files people write.

describe('cssViolations', () => {
  it.each([
    ['italic text', '.a { font-style: italic; }', 'italic', 'uses font-style: italic'],
    ['italic text, minified', '.a{font-style:italic}', 'italic', 'uses font-style: italic'],
    ['a web font', '@font-face { font-family: X; src: url(x.woff2); }', 'font-face', 'declares a web font with @font-face'],
    ['a web font, minified', '@font-face{font-family:X;src:url(x.woff2)}', 'font-face', 'declares a web font with @font-face'],
    ['a rounded corner', '.a { border-radius: 4px; }', 'radius', 'has a rounded corner: border-radius: 4px'],
    ['a rounded corner on one corner', '.a { border-top-left-radius: 50%; }', 'radius', 'has a rounded corner: border-top-left-radius: 50%'],
    ['a rounded corner, minified', '.a{border-radius:.25rem}', 'radius', 'has a rounded corner: border-radius:.25rem'],
    ['a square corner next to a rounded one', '.a { border-radius: 0 4px; }', 'radius', 'has a rounded corner: border-radius: 0 4px'],
    ['a rounded corner before a closing brace', '.a { border-radius: 4px }', 'radius', 'has a rounded corner: border-radius: 4px'],
    ['a wide border before a closing brace', '.a { border: 2px solid red }', 'border', 'has a border wider than 1px: border: 2px solid red'],
    ['a two-pixel border', '.a { border: 2px solid red; }', 'border', 'has a border wider than 1px: border: 2px solid red'],
    ['a three-pixel bottom border', '.a { border-bottom: 3px solid red; }', 'border', 'has a border wider than 1px: border-bottom: 3px solid red'],
    ['a border width in rem', '.a { border-width: 0.5rem; }', 'border', 'has a border wider than 1px: border-width: 0.5rem'],
    ['a thick border', '.a { border: thick solid; }', 'border', 'has a border wider than 1px: border: thick solid'],
    ['a two-pixel border, minified', '.a{border-top:2px solid var(--line)}', 'border', 'has a border wider than 1px: border-top:2px solid var(--line)'],
  ])('flags %s', (_name, css, rule, message) => {
    expect(cssViolations(css)).toEqual([{ rule, message }]);
  });

  it.each([
    ['a hairline border', '.a { border: 1px solid var(--line); }'],
    ['a hairline border, minified', '.a{border:1px solid var(--line)}'],
    ['a hairline in rem', '.a{border-bottom:.0625rem solid red}'],
    ['no border', '.a { border: none; border-top: 0; }'],
    ['square corners', '.a { border-radius: 0; border-radius: 0 !important; }'],
    ['square corners, minified', '*,:before,:after{box-sizing:border-box;border-radius:0}'],
    ['important square corners, minified', '.a{border-radius:0!important}'],
    ['a two-pixel outline, which is not a border', '.a { outline: 2px solid var(--link); }'],
    ['a two-pixel underline thickness', '.a { text-decoration-thickness: 2px; }'],
    ['a fractional hairline', '.a { border-bottom: 0.5px solid red; }'],
    ['normal text', '.a { font-style: normal; }'],
    ['a one-pixel border written with a capital unit', '.a { border: 1PX solid red; }'],
    ['box-sizing, which has the word border in it', '.a { box-sizing: border-box; }'],
  ])('allows %s', (_name, css) => {
    expect(cssViolations(css)).toEqual([]);
  });

  it('ignores a rule that is only mentioned in a comment', () => {
    expect(cssViolations('/* no font-style: italic here, and no border: 3px solid */ .a { color: red; }')).toEqual([]);
  });

  it('reports every violation', () => {
    const css = '.a { font-style: italic; } .b { border: 2px solid red; }';
    expect(cssViolations(css).map((violation) => violation.rule)).toEqual(['italic', 'border']);
  });
});
