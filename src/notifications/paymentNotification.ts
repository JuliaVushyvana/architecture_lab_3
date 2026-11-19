import type { PaymentStatus } from "../payments/index.ts";

const MESSAGES: Record<PaymentStatus, string> = {
  paid: "payment received",
  processing: "payment is being processed",
  failed: "payment failed",
};

export function paymentNotificationText(orderId: string, status: PaymentStatus): string {
  return `Order ${orderId}: ${MESSAGES[status]}`;
}
