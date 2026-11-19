import { CheckoutController } from "./checkout/CheckoutController.ts";
import { resetDatabase } from "./database.ts";
import { Inventory } from "./inventory/index.ts";

resetDatabase();
new Inventory().restock("book", 5);

const result = await new CheckoutController().checkout({
  orderId: "order-demo",
  paymentToken: "tok_demo",
  currency: "UAH",
  lines: [{ productId: "book", unitPrice: 250, quantity: 1 }],
});

console.log(result);
