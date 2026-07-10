// Billing (Pro upgrade funnel + Stripe checkout) is enabled by default.
// NEXT_PUBLIC_BILLING_ENABLED=false is an explicit kill switch that hides all
// upgrade CTAs and redirects /pricing・/subscription to / (used during the
// v1.0 free-only launch).
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'false';
}
