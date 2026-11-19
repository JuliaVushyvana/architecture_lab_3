import test from "node:test";
import assert from "node:assert/strict";
import { OrderService } from "../src/orders/index.ts";
import { Inventory } from "../src/inventory/index.ts";
import type { AuthorizePaymentRequest, PaymentGateway, PaymentStatus } from "../src/payments/index.ts";
import { database, resetDatabase } from "../src/database.ts";

function fakeGateway(status: PaymentStatus, calls: AuthorizePaymentRequest[] = []): PaymentGateway {
  return {
    async authorize(request) {
      calls.push(request);
      return { paymentId: "pay_1", status };
    },
  };
}

test.beforeEach(() => {
  resetDatabase();
  new Inventory().restock("book", 5);
});

test("Orders talks to Payments only through the neutral contract", async () => {
  const calls: AuthorizePaymentRequest[] = [];
  const order = await new OrderService(fakeGateway("paid", calls)).placeOrder({
    orderId: "o-1",
    lines: [{ productId: "book", unitPrice: 100, quantity: 2 }],
    total: 240,
    currency: "UAH",
    paymentToken: "tok_valid",
  });

  assert.deepEqual(calls, [{ orderId: "o-1", paymentToken: "tok_valid", amount: 240, currency: "UAH" }]);
  assert.deepEqual(order, { id: "o-1", status: "confirmed", total: 240, paymentStatus: "paid" });
});

for (const status of ["processing", "failed"] as const) {
  test(`${status} payment leaves the order pending`, async () => {
    const order = await new OrderService(fakeGateway(status)).placeOrder({
      orderId: "o-2",
      lines: [{ productId: "book", unitPrice: 100, quantity: 1 }],
      total: 120,
      currency: "UAH",
      paymentToken: "tok",
    });
    assert.equal(order.status, "payment_pending");
    assert.equal(order.paymentStatus, status);
  });
}

test("out-of-stock order is neither created nor charged", async () => {
  const calls: AuthorizePaymentRequest[] = [];
  await assert.rejects(
    new OrderService(fakeGateway("paid", calls)).placeOrder({
      orderId: "o-3",
      lines: [{ productId: "book", unitPrice: 100, quantity: 6 }],
      total: 720,
      currency: "UAH",
      paymentToken: "tok",
    }),
    /Insufficient stock/,
  );
  assert.equal(calls.length, 0);
  assert.equal(database.orders.has("o-3"), false);
});
