import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStripeStatus } from "../src/payments/paymentStatus.ts";

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
