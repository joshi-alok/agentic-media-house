import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { renderCardSvg } from '../src/lib/card';
import { cardPng } from '../src/lib/card-png';

const FIXTURES = new URL('../src/content-fixtures/', import.meta.url);
const GOLDEN = LedgerEntry.parse(JSON.parse(readFileSync(new URL('ledger/fixture-robotics-ships-fx-1-to-second-plant.json', FIXTURES), 'utf8')));
const SVG = renderCardSvg(GOLDEN);

describe('cardPng', () => {
  it('is a PNG: it starts with the PNG signature', async () => {
    const png = await cardPng(SVG);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('is 1200 by 630 pixels, the size social networks show', async () => {
    const meta = await sharp(await cardPng(SVG)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
  });

  it('has a white field and a hairline frame in the frame colour', async () => {
    const { data, info } = await sharp(await cardPng(SVG)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(pixel(5, 5)).toEqual([255, 255, 255]);
    expect(pixel(600, 300)).toEqual([255, 255, 255]);
    // The frame is the one-pixel rectangle that starts 24 pixels in.
    expect(pixel(24, 300)).toEqual([0xc9, 0xcd, 0xd2]);
    expect(pixel(25, 300)).toEqual([255, 255, 255]);
  });

  it('shows the basis of the figures under their labels, and nothing there for a piece whose numbers all come from another outlet', async () => {
    // The band between the labels and the rule above the counts: 480 to 508 pixels from the top, 72 to 1128 from the left.
    const inkInBasisBand = async (entry: LedgerEntry): Promise<number> => {
      const { data, info } = await sharp(await cardPng(renderCardSvg(entry))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let ink = 0;
      for (let y = 480; y < 508; y++) {
        for (let x = 72; x < 1128; x++) {
          const at = (y * info.width + x) * info.channels;
          if (data[at] !== 255 || data[at + 1] !== 255 || data[at + 2] !== 255) ink++;
        }
      }
      return ink;
    };
    expect(await inkInBasisBand(GOLDEN)).toBeGreaterThan(500);
    const other = structuredClone(GOLDEN);
    for (const claim of other.claims) claim.source.tier = 2;
    expect(await inkInBasisBand(other)).toBe(0);
  });

  it('gives the same picture for the same card', async () => {
    const [first, second] = await Promise.all([cardPng(SVG), cardPng(SVG)]);
    expect(first.equals(second)).toBe(true);
  });

  it('refuses text that is not an SVG', async () => {
    await expect(cardPng('not a picture')).rejects.toThrow();
  });
});
