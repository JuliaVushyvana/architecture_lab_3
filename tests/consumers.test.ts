import test from "node:test";
import assert from "node:assert/strict";
import { countByPaymentStatus } from "../src/reports/paymentReport.ts";
import { paymentNotificationText } from "../src/notifications/paymentNotification.ts";

test("reports count normalized statuses", () => {
  assert.deepEqual(countByPaymentStatus(["paid", "processing", "paid", "failed"]), {
    paid: 2,
    processing: 1,
    failed: 1,
  });
});

test("notifications describe the processing status", () => {
  assert.equal(paymentNotificationText("o-1", "processing"), "Order o-1: payment is being processed");
});
