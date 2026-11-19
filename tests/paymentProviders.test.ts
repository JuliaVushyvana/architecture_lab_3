import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentGateway, type PaymentStatus } from "../src/payments/index.ts";
import { normalizeSandboxPayStatus, SandboxPayAdapter } from "../src/payments/internal/sandboxpay/SandboxPayAdapter.ts";
import { SandboxPayClient, type SandboxPayRequest } from "../src/payments/internal/sandboxpay/SandboxPayClient.ts";
import { CheckoutController } from "../src/checkout/CheckoutController.ts";
import { OrderService } from "../src/orders/index.ts";
import { Inventory } from "../src/inventory/index.ts";
import { resetDatabase } from "../src/database.ts";

const outcomes: Array<[token: string, status: PaymentStatus]> = [
  ["tok_valid", "paid"],
  ["pending_review", "processing"],
  ["fail_card", "failed"],
];

for (const provider of ["stripe", "sandboxpay"]) {
  for (const [token, status] of outcomes) {
    test(`${provider}: ${token} authorizes as ${status}`, async () => {
      const result = await createPaymentGateway(provider).authorize({
        orderId: "o-1",
        paymentToken: token,
        amount: 120,
        currency: "UAH",
      });
      assert.equal(result.status, status);
      assert.equal(typeof result.paymentId, "string");
    });
  }

  test(`${provider}: Checkout API is unchanged when this provider is selected`, async () => {
    resetDatabase();
    new Inventory().restock("book", 5);
    const checkout = new CheckoutController(new OrderService(createPaymentGateway(provider)));

    const response = await checkout.checkout({
      orderId: "order-1",
      paymentToken: "tok_valid",
      currency: "UAH",
      lines: [{ productId: "book", unitPrice: 100, quantity: 2 }],
    });

    assert.deepEqual(response, { orderId: "order-1", status: "confirmed", total: 240, paymentStatus: "paid" });
  });
}

test("SandboxPay statuses are normalized, unknown fails closed", () => {
  assert.equal(normalizeSandboxPayStatus("APPROVED"), "paid");
  assert.equal(normalizeSandboxPayStatus("PENDING_REVIEW"), "processing");
  assert.equal(normalizeSandboxPayStatus("REJECTED"), "failed");
  assert.equal(normalizeSandboxPayStatus("CHARGEBACK"), "failed");
});

test("SandboxPay adapter builds its own request format", async () => {
  const sent: SandboxPayRequest[] = [];
  const client = new SandboxPayClient();
  client.submitPayment = async (request) => {
    sent.push(request);
    return { transactionRef: "sbx-1", outcome: "APPROVED" };
  };

  await new SandboxPayAdapter(client).authorize({ orderId: "o-1", paymentToken: "tok", amount: 240.5, currency: "UAH" });

  assert.deepEqual(sent, [{ merchantReference: "o-1", cardToken: "tok", amountText: "240.50", currencyCode: "UAH" }]);
});

test("provider can be selected through PAYMENT_PROVIDER", async () => {
  const saved = process.env.PAYMENT_PROVIDER;
  process.env.PAYMENT_PROVIDER = "sandboxpay";
  try {
    const result = await createPaymentGateway().authorize({ orderId: "o-9", paymentToken: "tok", amount: 1, currency: "UAH" });
    assert.match(result.paymentId, /^sbx-/);
  } finally {
    if (saved === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = saved;
  }
});

test("unknown provider is rejected at composition time", () => {
  assert.throws(() => createPaymentGateway("paypal"), /Unknown payment provider "paypal"/);
});
