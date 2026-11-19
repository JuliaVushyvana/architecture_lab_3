import test from "node:test";
import assert from "node:assert/strict";
import { calculateTotal } from "../src/shared/calculateTotal.ts";
import { auditLog, runtimeConfig } from "../src/config.ts";

const lines = [
  { productId: "book", unitPrice: 100, quantity: 2 },
  { productId: "pen", unitPrice: 10, quantity: 3 },
];

test("total depends only on explicit tax and discount", () => {
  assert.equal(calculateTotal(lines, { taxRate: 0.2, discountPercent: 0 }), 276);
  assert.equal(calculateTotal(lines, { taxRate: 0.2, discountPercent: 10 }), 248.4);
  assert.equal(calculateTotal(lines, { taxRate: 0, discountPercent: 0 }), 230);
});

test("global config does not influence the result", () => {
  const before = calculateTotal(lines, { taxRate: 0.2, discountPercent: 0 });
  const saved = { ...runtimeConfig };
  runtimeConfig.taxRate = 0.5;
  runtimeConfig.discountPercent = 50;
  try {
    assert.equal(calculateTotal(lines, { taxRate: 0.2, discountPercent: 0 }), before);
  } finally {
    Object.assign(runtimeConfig, saved);
  }
});

test("input lines are not mutated", () => {
  const frozen = lines.map((line) => Object.freeze({ ...line }));
  const snapshot = structuredClone(frozen);

  calculateTotal(Object.freeze(frozen), { taxRate: 0.2, discountPercent: 0 });

  assert.deepEqual(frozen, snapshot);
});

test("calculation has no audit side effect", () => {
  auditLog.length = 0;
  calculateTotal(lines, { taxRate: 0.2, discountPercent: 0 });
  assert.deepEqual(auditLog, []);
});
