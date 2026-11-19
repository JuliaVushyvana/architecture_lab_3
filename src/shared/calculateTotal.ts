export type CartLine = {
  productId: string;
  unitPrice: number;
  quantity: number;
};

export type PricingRules = {
  taxRate: number;
  discountPercent: number;
};

// Pure: the result depends only on the arguments, and lines are never mutated.
export function calculateTotal(lines: readonly CartLine[], pricing: PricingRules): number {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discounted = subtotal * (1 - pricing.discountPercent / 100);
  return Number((discounted * (1 + pricing.taxRate)).toFixed(2));
}
