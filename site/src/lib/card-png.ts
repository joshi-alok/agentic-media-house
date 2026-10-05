import sharp from 'sharp';
import { CARD_HEIGHT, CARD_WIDTH } from './card';

/**
 * The PNG of a fact card: the SVG from `renderCardSvg` drawn at 1200 by 630 pixels, the size that
 * social networks show. Throws if `svg` is not an SVG document.
 */
export async function cardPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(CARD_WIDTH, CARD_HEIGHT).png().toBuffer();
}
