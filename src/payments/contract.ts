// Public, provider-neutral contract of Payments. Consumers import it via payments/index.ts.
export type PaymentStatus = "paid" | "processing" | "failed";

export type AuthorizePaymentRequest = {
  orderId: string;
  paymentToken: string;
  // Major currency units (e.g. 240.5 UAH); each adapter converts to its own format.
  amount: number;
  currency: string;
};

export type PaymentResult = {
  paymentId: string;
  status: PaymentStatus;
};

export interface PaymentGateway {
  authorize(request: AuthorizePaymentRequest): Promise<PaymentResult>;
}
