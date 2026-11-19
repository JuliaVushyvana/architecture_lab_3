import type { PaymentStatus } from "../contract.ts";

export type StatusTable = Readonly<Record<string, PaymentStatus>>;

// The single normalization policy for every provider.
// Unknown states fail closed: an order is never confirmed without a known "paid".
export function normalizeStatus(table: StatusTable, providerStatus: string): PaymentStatus {
  return Object.hasOwn(table, providerStatus) ? table[providerStatus] : "failed";
}
