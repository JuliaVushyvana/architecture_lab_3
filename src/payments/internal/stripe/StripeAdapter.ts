import type { AuthorizePaymentRequest, PaymentGateway, PaymentResult, PaymentStatus } from "../../contract.ts";
import { normalizeStatus, type StatusTable } from "../normalizeStatus.ts";
import { StripeClient, type StripePayload } from "./StripeClient.ts";

const STRIPE_STATUS: StatusTable = {
  succeeded: "paid",
  requires_action: "processing",
  declined: "failed",
};

export function normalizeStripeStatus(state: string): PaymentStatus {
  return normalizeStatus(STRIPE_STATUS, state);
}

export class StripeAdapter implements PaymentGateway {
  private readonly client: StripeClient;

  constructor(client = new StripeClient()) {
    this.client = client;
  }

  async authorize(request: AuthorizePaymentRequest): Promise<PaymentResult> {
    const payload: StripePayload = {
      id: request.paymentToken,
      amount: Math.round(request.amount * 100),
      currency: request.currency,
      metadata: { orderId: request.orderId },
    };
    const response = await this.client.createCharge(payload);
    return { paymentId: response.charge_id, status: normalizeStripeStatus(response.state) };
  }
}
