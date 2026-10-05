import { CHECK_IDS } from '@robywire/gate';
import type { Basis, CheckId, CheckResult, LedgerEntry, Route, Status } from '@robywire/gate';
import { reasonLabel } from './reasons';

// The receipts page, as data. The page only lays this out, so what it says can
// be tested without building the site.

export interface ReceiptClaim {
  /** The number shown on the article's marker for this claim: its position in the order, from 1. */
  marker: number;
  id: string;
  label: string;
  text: string;
  /** The passage of the source that supports the claim, word for word. */
  quote: string;
  source: { url: string; tier: 1 | 2; outlet?: string; retrievedAt: string };
  /** The first 12 characters of the snapshot hash. */
  hash: string;
  basis: Basis;
  status: Status;
  /** The 0-based indexes, in the ledger's sentence list, of the sentences that cite this claim. */
  citedBy: number[];
  /** True for a claim from a tier-2 source (another outlet's reporting): the article labels the sentences that cite it "Unconfirmed.". */
  unconfirmed: boolean;
}

/** A reason the gate asked for a hold: its code, and the same in plain English. */
export interface HoldReason {
  code: string;
  label: string;
}

export interface GateSummary {
  route: Route;
  checks: { id: CheckId; result: CheckResult }[];
  holdReasons: HoldReason[];
}

export interface ReceiptsView {
  slug: string;
  title: string;
  claims: ReceiptClaim[];
  gate: GateSummary;
  verifier?: { model: string; passed: boolean; notes: string[] };
}

/** Everything the receipts page shows, from a piece's ledger entry. */
export function receiptsView(ledger: LedgerEntry): ReceiptsView {
  const byId = new Map(ledger.claims.map((claim) => [claim.id, claim]));
  for (const id of ledger.order) {
    if (!byId.has(id)) throw new Error(`receiptsView: the order lists ${id}, but the ledger holds no such claim`);
  }
  for (const claim of ledger.claims) {
    if (!ledger.order.includes(claim.id)) throw new Error(`receiptsView: the ledger holds ${claim.id}, but the order does not list it`);
  }

  const claims = ledger.order.map((id, at): ReceiptClaim => {
    const claim = byId.get(id)!;
    const { url, tier, outlet, retrievedAt } = claim.source;
    return {
      marker: at + 1,
      id,
      label: claim.label,
      text: claim.text,
      quote: claim.span.quote,
      source: outlet === undefined ? { url, tier, retrievedAt } : { url, tier, outlet, retrievedAt },
      hash: claim.source.snapshotHash.slice(0, 12),
      basis: claim.basis,
      status: claim.status,
      citedBy: ledger.sentences.filter((sentence) => sentence.claimIds.includes(id)).map((sentence) => sentence.index),
      unconfirmed: tier === 2,
    };
  });

  const view: ReceiptsView = {
    slug: ledger.slug,
    title: ledger.title,
    claims,
    gate: {
      route: ledger.gate.route,
      checks: CHECK_IDS.map((id) => ({ id, result: ledger.gate.checks[id] })),
      holdReasons: ledger.gate.holdReasons.map((code) => ({ code, label: reasonLabel(code) })),
    },
  };
  if (ledger.verifier !== undefined) view.verifier = { ...ledger.verifier, notes: [...ledger.verifier.notes] };
  return view;
}
