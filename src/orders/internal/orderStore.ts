import { database, type OrderRow } from "../../database.ts";
import type { PaymentStatus } from "../../payments/index.ts";

export function createOrder(orderId: string, total: number): void {
  database.orders.set(orderId, { id: orderId, status: "created", total });
}

export function applyPaymentStatus(orderId: string, paymentStatus: PaymentStatus): OrderRow {
  const order = database.orders.get(orderId)!;
  order.paymentStatus = paymentStatus;
  order.status = paymentStatus === "paid" ? "confirmed" : "payment_pending";
  return { ...order };
}
