import { type Page, pageQuery, request } from "./requests";

export type CreditTransaction = {
  id: string;
  /** Positive = credit, negative = debit */
  amount: number;
  balance_after: number;
  /** adjustment: a manual correction, positive or negative */
  kind: "signup_bonus" | "summary" | "translation" | "refund" | "adjustment";
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
