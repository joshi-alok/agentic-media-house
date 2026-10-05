import type { LedgerEntry } from '@robywire/gate';
import type { APIContext } from 'astro';
import { renderCardSvg } from '../../../lib/card';
import { cardPng } from '../../../lib/card-png';
import { getPieces } from '../../../lib/pieces';

// /news/<slug>/card.png: the same card as a picture, which is the share image of the article.
export async function getStaticPaths() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ params: { slug: piece.slug }, props: { ledger: piece.ledger } }));
}

export async function GET({ props }: APIContext<{ ledger: LedgerEntry }>) {
  const png = await cardPng(renderCardSvg(props.ledger));
  // A copy as a plain Uint8Array, which is what Response accepts as a body.
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
