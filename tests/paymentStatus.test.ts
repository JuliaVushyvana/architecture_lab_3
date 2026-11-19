import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStripeStatus, StripeAdapter } from "../src/payments/internal/stripe/StripeAdapter.ts";
import { StripeClient, type StripePayload } from "../src/payments/internal/stripe/StripeClient.ts";

test("succeeded is normalized to paid", () => {
  assert.equal(normalizeStripeStatus("succeeded"), "paid");
});

test("requires_action is normalized to processing", () => {
  assert.equal(normalizeStripeStatus("requires_action"), "processing");
});

test("declined is normalized to failed", () => {
  assert.equal(normalizeStripeStatus("declined"), "failed");
});

test("unknown provider status fails closed", () => {
  assert.equal(normalizeStripeStatus("disputed"), "failed");
  assert.equal(normalizeStripeStatus(""), "failed");
  assert.equal(normalizeStripeStatus("toString"), "failed");
});

test("Stripe adapter builds the provider payload inside Payments", async () => {
  const sent: StripePayload[] = [];
  const client = new StripeClient();
  client.createCharge = async (payload) => {
    sent.push(payload);
    return { charge_id: "ch_1", state: "succeeded" };
  };

  const result = await new StripeAdapter(client).authorize({
    orderId: "order-1",
    paymentToken: "tok_valid",
    amount: 240.5,
    currency: "UAH",
  });

  assert.deepEqual(sent, [{ id: "tok_valid", amount: 24050, currency: "UAH", metadata: { orderId: "order-1" } }]);
  assert.deepEqual(result, { paymentId: "ch_1", status: "paid" });
});
