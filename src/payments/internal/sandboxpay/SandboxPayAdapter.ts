import type { AuthorizePaymentRequest, PaymentGateway, PaymentResult, PaymentStatus } from "../../contract.ts";
import { normalizeStatus, type StatusTable } from "../normalizeStatus.ts";
import { SandboxPayClient, type SandboxPayRequest } from "./SandboxPayClient.ts";

const SANDBOXPAY_STATUS: StatusTable = {
  APPROVED: "paid",
  PENDING_REVIEW: "processing",
  REJECTED: "failed",
};

export function normalizeSandboxPayStatus(outcome: string): PaymentStatus {
  return normalizeStatus(SANDBOXPAY_STATUS, outcome);
}

export class SandboxPayAdapter implements PaymentGateway {
  private readonly client: SandboxPayClient;

  constructor(client = new SandboxPayClient()) {
    this.client = client;
  }

  async authorize(request: AuthorizePaymentRequest): Promise<PaymentResult> {
    const providerRequest: SandboxPayRequest = {
      merchantReference: request.orderId,
      cardToken: request.paymentToken,
      amountText: request.amount.toFixed(2),
      currencyCode: request.currency,
    };
    const response = await this.client.submitPayment(providerRequest);
    return { paymentId: response.transactionRef, status: normalizeSandboxPayStatus(response.outcome) };
  }
}
