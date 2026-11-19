import type { PaymentGateway } from "./contract.ts";
import { SandboxPayAdapter } from "./internal/sandboxpay/SandboxPayAdapter.ts";
import { StripeAdapter } from "./internal/stripe/StripeAdapter.ts";

export type {
  AuthorizePaymentRequest,
  PaymentGateway,
  PaymentResult,
  PaymentStatus,
} from "./contract.ts";

const PROVIDERS = {
  stripe: () => new StripeAdapter(),
  sandboxpay: () => new SandboxPayAdapter(),
} satisfies Record<string, () => PaymentGateway>;

export type PaymentProvider = keyof typeof PROVIDERS;

// Provider is chosen at composition time; consumers only see PaymentGateway.
export function createPaymentGateway(
  provider: string = process.env.PAYMENT_PROVIDER ?? "stripe",
): PaymentGateway {
  if (!Object.hasOwn(PROVIDERS, provider)) {
    throw new Error(
      `Unknown payment provider "${provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return PROVIDERS[provider as PaymentProvider]();
}
