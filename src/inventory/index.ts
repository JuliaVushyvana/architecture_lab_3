import { readAvailable, writeAvailable } from "./internal/stockStore.ts";

export type StockRequest = { productId: string; quantity: number };

export class InsufficientStockError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super(`Insufficient stock for ${productId}`);
    this.name = "InsufficientStockError";
    this.productId = productId;
  }
}

// Inventory owns the invariant: available >= 0 for every product.
export class Inventory {
  available(productId: string): number {
    return readAvailable(productId) ?? 0;
  }

  restock(productId: string, quantity: number): void {
    assertPositiveQuantity(quantity);
    writeAvailable(productId, this.available(productId) + quantity);
  }

  // All-or-nothing: either every request is reserved or stock is left untouched.
  reserve(requests: readonly StockRequest[]): void {
    const needed = new Map<string, number>();
    for (const { productId, quantity } of requests) {
      assertPositiveQuantity(quantity);
      needed.set(productId, (needed.get(productId) ?? 0) + quantity);
    }

    for (const [productId, quantity] of needed) {
      const available = readAvailable(productId);
      if (available === undefined || available < quantity) {
        throw new InsufficientStockError(productId);
      }
    }

    for (const [productId, quantity] of needed) {
      writeAvailable(productId, readAvailable(productId)! - quantity);
    }
  }
}

function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(`Quantity must be a positive integer, got ${quantity}`);
  }
}
