// Stable payment status of the system. Provider-specific state names never leave Payments.
export type PaymentStatus = "paid" | "processing" | "failed";

const STRIPE_STATUS: Record<string, PaymentStatus> = {
  succeeded: "paid",
  requires_action: "processing",
  declined: "failed",
};

// Unknown provider states fail closed: an order is never confirmed without a known "paid".
export function normalizeStripeStatus(state: string): PaymentStatus {
  return Object.hasOwn(STRIPE_STATUS, state) ? STRIPE_STATUS[state] : "failed";
}
