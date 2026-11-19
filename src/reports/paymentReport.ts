import type { PaymentStatus } from "../payments/index.ts";

export function countByPaymentStatus(statuses: readonly PaymentStatus[]): Record<PaymentStatus, number> {
  const counts: Record<PaymentStatus, number> = { paid: 0, processing: 0, failed: 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}
