import { calculateTotal, type CartLine, type PricingRules } from "../shared/calculateTotal.ts";
import { OrderService } from "../orders/index.ts";
import { auditLog, runtimeConfig } from "../config.ts";

export type CheckoutRequest = {
  orderId: string;
  paymentToken: string;
  currency: string;
  lines: CartLine[];
};

export type CheckoutResponse = {
  orderId: string;
  status: string;
  total: number;
  paymentStatus: string | undefined;
};

export class CheckoutController {
  private readonly orders: OrderService;
  private readonly pricing: () => PricingRules;

  constructor(orders = new OrderService(), pricing: () => PricingRules = currentPricing) {
    this.orders = orders;
    this.pricing = pricing;
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutResponse> {
    const total = calculateTotal(request.lines, this.pricing());
    auditLog.push(`total_calculated:${total}`);

    const order = await this.orders.placeOrder({
      orderId: request.orderId,
      lines: request.lines,
      total,
      currency: request.currency,
      paymentToken: request.paymentToken,
    });

    return {
      orderId: order.id,
      status: order.status,
      total: order.total,
      paymentStatus: order.paymentStatus,
    };
  }
}

function currentPricing(): PricingRules {
  return { taxRate: runtimeConfig.taxRate, discountPercent: runtimeConfig.discountPercent };
}
