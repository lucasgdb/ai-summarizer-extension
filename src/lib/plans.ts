/** A credit pack to buy (GET /credits/plans, once the API has it) */
export type CreditPlan = {
  id: string;
  /** Product name; not translated (like model names) */
  name: string;
  /** Credits the price buys */
  credits: number;
  /** Extra credits on top, the pack's discount */
  bonus_credits: number;
  /** In the currency's minor unit (cents) */
  price: number;
  /** ISO 4217 */
  currency: string;
  /** The one to highlight */
  featured: boolean;
};

// MOCK until the API serves the plans: same shape it will have. The base
// price is the API's documented one (1,000 credits = R$ 10), with a growing
// bonus on bigger packs. Replace listPlans with a request to the API.
const mockPlans: CreditPlan[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 500,
    bonus_credits: 0,
    price: 500,
    currency: "BRL",
    featured: false,
  },
  {
    id: "plus",
    name: "Plus",
    credits: 1000,
    bonus_credits: 100,
    price: 1000,
    currency: "BRL",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 2500,
    bonus_credits: 500,
    price: 2500,
    currency: "BRL",
    featured: true,
  },
  {
    id: "max",
    name: "Max",
    credits: 5000,
    bonus_credits: 1500,
    price: 5000,
    currency: "BRL",
    featured: false,
  },
];

export async function listPlans(signal: AbortSignal): Promise<CreditPlan[]> {
  // A real request's wait, so the loading state can be seen and validated
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 600);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
  return mockPlans;
}
