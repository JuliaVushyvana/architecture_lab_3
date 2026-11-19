// Local simulation of a second, fictional provider with its own protocol.
// Token prefixes make the outcome deterministic.
export type SandboxPayRequest = {
  merchantReference: string;
  cardToken: string;
  amountText: string;
  currencyCode: string;
};

export type SandboxPayResponse = {
  transactionRef: string;
  outcome: "APPROVED" | "PENDING_REVIEW" | "REJECTED";
};

export class SandboxPayClient {
  async submitPayment(request: SandboxPayRequest): Promise<SandboxPayResponse> {
    const outcome = request.cardToken.startsWith("fail_")
      ? "REJECTED"
      : request.cardToken.startsWith("pending_")
        ? "PENDING_REVIEW"
        : "APPROVED";
    return { transactionRef: `sbx-${request.merchantReference}-${request.cardToken}`, outcome };
  }
}
