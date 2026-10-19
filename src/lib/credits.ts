import { api } from "./api";
import { ApiError, type Page, pageQuery, request } from "./requests";

export type CreditTransaction = {
  id: string;
  /** Positive = credit, negative = debit */
  amount: number;
  balance_after: number;
  /** adjustment: a manual correction, positive or negative */
  kind:
    | "signup_bonus"
    | "purchase"
    // A purchase's credits taken back (its PIX was refunded or disputed)
    | "purchase_reversal"
    | "summary"
    | "translation"
    | "refund"
    | "adjustment";
  summary_id: string | null;
  /** null when there's no summary, or once it's deleted from the history */
  summary_title: string | null;
  created_at: string;
};

export async function getBalance(token: string, signal: AbortSignal) {
  const body = await request<{ balance: number }>("/credits", {
    token,
    signal,
  });
  return body.balance;
}

export function listTransactions(
  token: string,
  cursor: string | null,
  signal: AbortSignal,
) {
  return request<Page<CreditTransaction>>(
    `/credits/transactions?${pageQuery(cursor)}`,
    { token, signal },
  );
}

/** A credit pack sold by PIX (GET /credits/packs); prices come from the DB */
export type CreditPack = {
  id: string;
  /** What the price buys */
  credits: number;
  /** Extra on top (0 for none) */
  bonus_credits: number;
  /** What the user gets: credits + bonus */
  total_credits: number;
  /** In the currency's minor unit */
  price_cents: number;
  /** ISO 4217 */
  currency: string;
};

export type CreditPacks = {
  packs: CreditPack[];
  /** false: show the packs, but nothing can be bought */
  purchases_enabled: boolean;
};

export type PurchaseStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed"
  // Only after "paid": reversed at the bank, its credits taken back
  | "refunded"
  | "disputed";

/** A PIX charge for a pack (POST /credits/purchases and GET …/{id}) */
export type Purchase = {
  id: string;
  pack_id: string;
  credits: number;
  bonus_credits: number;
  /** What a payment adds to the balance */
  total_credits: number;
  amount_cents: number;
  status: PurchaseStatus;
  /** A sandbox charge: can be paid with "simulate", no money moves */
  dev_mode: boolean;
  /** PIX "copia e cola" */
  br_code: string;
  /** The QR code, as a data: URL */
  br_code_base64: string;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  credit_balance: number;
};

/** Public */
export async function getPacks(signal: AbortSignal): Promise<CreditPacks> {
  const response = await api("/credits/packs", { signal });
  if (!response.ok) throw new ApiError(response.status, {});
  return response.json();
}

/**
 * Creates the PIX for a pack; while one for the same pack is still valid, the
 * API returns that one (200) instead of a new charge
 */
export function createPurchase(token: string, packId: string) {
  return request<Purchase>("/credits/purchases", {
    method: "POST",
    token,
    body: { pack_id: packId },
  });
}

/** The API checks the payment provider itself: polling this is enough */
export function getPurchase(token: string, id: string, signal: AbortSignal) {
  return request<Purchase>(`/credits/purchases/${encodeURIComponent(id)}`, {
    token,
    signal,
  });
}

/** Sandbox only (404 for real charges): pays the PIX at once */
export function simulatePurchase(token: string, id: string) {
  return request<Purchase>(
    `/credits/purchases/${encodeURIComponent(id)}/simulate`,
    { method: "POST", token },
  );
}
