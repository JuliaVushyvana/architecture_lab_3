import { database } from "../../database.ts";

// Only Inventory may touch stock storage; invariants are enforced by inventory/index.ts.
export function readAvailable(productId: string): number | undefined {
  return database.stock.get(productId)?.available;
}

export function writeAvailable(productId: string, available: number): void {
  database.stock.set(productId, { productId, available });
}
