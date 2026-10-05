import type { LedgerEntry } from '@robywire/gate';
import type { APIContext } from 'astro';
import { renderCardSvg } from '../../../lib/card';
import { getPieces } from '../../../lib/pieces';

// /news/<slug>/card.svg: the fact card of a piece.
export async function getStaticPaths() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ params: { slug: piece.slug }, props: { ledger: piece.ledger } }));
}

export function GET({ props }: APIContext<{ ledger: LedgerEntry }>) {
  return new Response(renderCardSvg(props.ledger), { headers: { 'Content-Type': 'image/svg+xml' } });
}
