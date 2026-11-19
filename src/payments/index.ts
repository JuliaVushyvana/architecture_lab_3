import type { PaymentGateway } from "./contract.ts";
import { StripeAdapter } from "./internal/stripe/StripeAdapter.ts";

export type {
  AuthorizePaymentRequest,
  PaymentGateway,
  PaymentResult,
  PaymentStatus,
} from "./contract.ts";

export function createPaymentGateway(): PaymentGateway {
  return new StripeAdapter();
}
