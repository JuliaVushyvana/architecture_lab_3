import test from "node:test";
import assert from "node:assert/strict";
import { CheckoutController } from "../src/checkout/CheckoutController.ts";
import { Inventory } from "../src/inventory/index.ts";
import { database, resetDatabase } from "../src/database.ts";
import { auditLog, runtimeConfig } from "../src/config.ts";

test.beforeEach(() => {
  resetDatabase();
  auditLog.length = 0;
  runtimeConfig.taxRate = 0.2;
  runtimeConfig.discountPercent = 0;
  const inventory = new Inventory();
  inventory.restock("book", 5);
  inventory.restock("pen", 1);
});

const cases = [
  { token: "tok_valid", status: "confirmed", paymentStatus: "paid" },
  { token: "pending_3ds", status: "payment_pending", paymentStatus: "processing" },
  { token: "fail_card", status: "payment_pending", paymentStatus: "failed" },
];

for (const { token, status, paymentStatus } of cases) {
  test(`public response shape is stable for ${paymentStatus}`, async () => {
    const response = await new CheckoutController().checkout({
      orderId: `order-${paymentStatus}`,
      paymentToken: token,
      currency: "UAH",
      lines: [{ productId: "book", unitPrice: 100, quantity: 1 }],
    });

    assert.deepEqual(response, { orderId: `order-${paymentStatus}`, status, total: 120, paymentStatus });
  });
}

test("checkout does not mutate request lines and audits once", async () => {
  const lines = [{ productId: "book", unitPrice: 100, quantity: 2 }];
  const snapshot = structuredClone(lines);

  await new CheckoutController().checkout({ orderId: "o-1", paymentToken: "tok", currency: "UAH", lines });

  assert.deepEqual(lines, snapshot);
  assert.deepEqual(auditLog, ["total_calculated:240"]);
});

test("pricing rules are injected at the orchestration level", async () => {
  const controller = new CheckoutController(undefined, () => ({ taxRate: 0, discountPercent: 50 }));
  const response = await controller.checkout({
    orderId: "o-2",
    paymentToken: "tok",
    currency: "UAH",
    lines: [{ productId: "book", unitPrice: 100, quantity: 2 }],
  });
  assert.equal(response.total, 100);
});

test("out-of-stock checkout leaves all stock unchanged", async () => {
  await assert.rejects(
    new CheckoutController().checkout({
      orderId: "o-3",
      paymentToken: "tok",
      currency: "UAH",
      lines: [
        { productId: "book", unitPrice: 100, quantity: 2 },
        { productId: "pen", unitPrice: 10, quantity: 2 },
      ],
    }),
    /Insufficient stock for pen/,
  );
  assert.equal(database.stock.get("book")?.available, 5);
  assert.equal(database.stock.get("pen")?.available, 1);
  assert.equal(database.orders.size, 0);
});
