import type { CartLine } from "../shared/calculateTotal.ts";
import { createPaymentGateway, type PaymentGateway } from "../payments/index.ts";
import { Inventory } from "../inventory/index.ts";
import { applyPaymentStatus, createOrder } from "./internal/orderStore.ts";

export type PlaceOrderCommand = {
  orderId: string;
  lines: readonly CartLine[];
  total: number;
  currency: string;
  paymentToken: string;
};

export class OrderService {
  private readonly payments: PaymentGateway;
  private readonly inventory: Inventory;

  constructor(payments: PaymentGateway = createPaymentGateway(), inventory = new Inventory()) {
    this.payments = payments;
    this.inventory = inventory;
  }

  async placeOrder(command: PlaceOrderCommand) {
    this.inventory.reserve(command.lines);
    createOrder(command.orderId, command.total);

    const payment = await this.payments.authorize({
      orderId: command.orderId,
      paymentToken: command.paymentToken,
      amount: command.total,
      currency: command.currency,
    });

    return applyPaymentStatus(command.orderId, payment.status);
  }
}
