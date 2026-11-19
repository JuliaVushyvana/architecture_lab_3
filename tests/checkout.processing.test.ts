import test from "node:test";
import assert from "node:assert/strict";
import { CheckoutController } from "../src/checkout/CheckoutController.ts";
import { database, resetDatabase } from "../src/database.ts";
import { auditLog, runtimeConfig } from "../src/config.ts";

test.beforeEach(() => {
  resetDatabase();
  auditLog.length = 0;
  runtimeConfig.taxRate = 0.2;
  runtimeConfig.discountPercent = 0;
  database.stock.set("book", { productId: "book", available: 5 });
});

test("processing payment keeps the order pending", async () => {
  const response = await new CheckoutController().checkout({
    orderId: "order-4",
    paymentToken: "pending_3ds",
    currency: "UAH",
    lines: [{ productId: "book", unitPrice: 100, quantity: 1 }],
  });

  assert.deepEqual(response, {
    orderId: "order-4",
    status: "payment_pending",
    total: 120,
    paymentStatus: "processing",
  });
});
