import test from "node:test";
import assert from "node:assert/strict";
import { InsufficientStockError, Inventory } from "../src/inventory/index.ts";
import { resetDatabase } from "../src/database.ts";

let inventory: Inventory;

test.beforeEach(() => {
  resetDatabase();
  inventory = new Inventory();
  inventory.restock("book", 5);
  inventory.restock("pen", 1);
});

test("reserve decrements every requested product", () => {
  inventory.reserve([
    { productId: "book", quantity: 2 },
    { productId: "pen", quantity: 1 },
  ]);

  assert.equal(inventory.available("book"), 3);
  assert.equal(inventory.available("pen"), 0);
});

test("out-of-stock line leaves earlier lines untouched", () => {
  assert.throws(
    () => inventory.reserve([
      { productId: "book", quantity: 2 },
      { productId: "pen", quantity: 2 },
    ]),
    (error: unknown) => error instanceof InsufficientStockError && error.productId === "pen",
  );

  assert.equal(inventory.available("book"), 5);
  assert.equal(inventory.available("pen"), 1);
});

test("repeated lines of one product are reserved together", () => {
  assert.throws(
    () => inventory.reserve([
      { productId: "book", quantity: 3 },
      { productId: "book", quantity: 3 },
    ]),
    InsufficientStockError,
  );
  assert.equal(inventory.available("book"), 5);
});

test("unknown product is out of stock", () => {
  assert.throws(() => inventory.reserve([{ productId: "lamp", quantity: 1 }]), /Insufficient stock for lamp/);
});

test("non-positive quantities cannot bypass the invariant", () => {
  assert.throws(() => inventory.reserve([{ productId: "book", quantity: -10 }]), RangeError);
  assert.throws(() => inventory.reserve([{ productId: "book", quantity: 0 }]), RangeError);
  assert.throws(() => inventory.restock("book", -1), RangeError);
  assert.equal(inventory.available("book"), 5);
});
