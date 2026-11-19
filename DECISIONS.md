# Decision log

Обсяг одного рішення: 80–120 слів (перевіряється скриптом `wc -w` по кожній секції).

## Decision 1: Єдина нормалізація payment status у Payments

**Problem:** правило «Stripe state → статус системи» скопійоване в Orders, Reports і Notifications; кожна копія залежить від `StripeResponse`.

**Evidence:** `src/orders/mapPaymentStatus.ts:3-7`, `src/reports/mapPaymentStatus.ts:3-7`, `src/notifications/mapPaymentStatus.ts:3-7`.

**Decision:** одна таблиця у `src/payments/paymentStatus.ts`; три копії видалено, Reports і Notifications приймають лише `PaymentStatus`.

**Why:** додавання `processing` тепер є однією правкою, а не трьома синхронними.

**Alternative:** винести mapper у `src/shared`.

**Why rejected:** shared знав би про Stripe, і кожен consumer залежав би від provider.

**Trade-off:** Reports і Notifications залежать від Payments (лише type), а не від нічого.

**Verification:** `tests/paymentStatus.test.ts`, стартові тести без змін.

## Decision 2: Невідомий provider status → `failed` (fail closed)

**Problem:** provider може повернути стан, якого немає в таблиці (новий стан API, помилка інтеграції).

**Evidence:** стартовий mapping мовчки повертав `failed` для всього, крім двох станів (`src/orders/mapPaymentStatus.ts:6`), але це не було задокументовано.

**Decision:** невідомий стан нормалізується в `failed`; замовлення лишається `payment_pending` і не підтверджується.

**Why:** підтвердити замовлення без відомого `paid` — пряма фінансова втрата; `failed` зберігає стартову поведінку.

**Alternative:** `processing` для невідомого стану.

**Why rejected:** у системі немає асинхронного підтвердження, тож замовлення назавжди зависло б у `processing`.

**Trade-off:** реально успішний платіж із новим станом потребуватиме ручної звірки.

**Verification:** тест `unknown provider status fails closed`, включно з ключем `toString`.

## Decision 3: Provider-neutral публічний контракт Payments

**Problem:** Checkout будував `StripePayload`, а Orders створював `StripeClient` з `payments/internal`.

**Evidence:** `src/checkout/CheckoutController.ts:3,23-28`, `src/orders/OrderService.ts:4,10,14` (стартовий код).

**Decision:** `src/payments/index.ts` експортує `PaymentGateway.authorize({ orderId, paymentToken, amount, currency })` → `{ paymentId, status }`. Payload, конвертацію в копійки й client приховує `StripeAdapter`; Orders отримує gateway через constructor.

**Why:** заміна provider більше не змінює сигнатури Checkout чи Orders.

**Alternative:** generic `charge(provider, payload: unknown)`.

**Why rejected:** consumer усе одно мусив би знати формат payload — контракт лише формально нейтральний.

**Trade-off:** додатковий шар адаптера й контракт, який треба версіонувати.

**Verification:** `tests/orders.test.ts` з fake gateway, `tests/paymentStatus.test.ts` перевіряє payload.

## Decision 4: Inventory володіє залишками, `reserve` — all-or-nothing

**Problem:** Orders сам перевіряв і записував `database.stock`, списуючи позиції по одній.

**Evidence:** `src/orders/OrderService.ts:15-26`, `src/inventory/StockRepository.ts:9-11` (стартовий код).

**Decision:** `Inventory.reserve(lines)` агрегує кількості по товару, спершу валідує всі позиції, потім списує; при нестачі кидає `InsufficientStockError` без змін. Сховище — `inventory/internal/stockStore.ts`; `updateAvailable` видалено.

**Why:** invariant `available ≥ 0` перевіряється в одному місці.

**Alternative:** списувати по черзі й відкочувати при помилці.

**Why rejected:** компенсація складніша і залишає вікно з неконсистентним станом.

**Trade-off:** `reserve` двічі читає storage; від'ємна чи нульова кількість тепер відхиляється (раніше збільшувала залишок).

**Verification:** `tests/inventory.test.ts`, `out-of-stock checkout leaves all stock unchanged`.

## Decision 5: Розрив циклу Orders ↔ Payments

**Problem:** `StripeClient` викликав `markOrderPaid` з `orders/internal`, тобто Payments залежав від Orders, а Orders — від Payments.

**Evidence:** `src/payments/internal/StripeClient.ts:2,20`, `src/orders/OrderService.ts:32-33` (стартовий код).

**Decision:** Payments лише повертає `PaymentResult`; Orders сам застосовує статус через власний `orders/internal/orderStore.ts`. Напрям: Checkout → Orders → Payments, Orders → Inventory.

**Why:** у статусу замовлення тепер один writer — його власник.

**Alternative:** callback або подія `paymentCompleted`, на яку підписується Orders.

**Why rejected:** для синхронного authorize це зайва indirection; подія буде доречна для асинхронного підтвердження.

**Trade-off:** Orders знає, що після оплати треба оновити статус, а не отримує це автоматично.

**Verification:** `grep orders src/payments` порожній; `tests/orders.test.ts`.

## Decision 6: Детермінований `calculateTotal`

**Problem:** total залежав від глобального `runtimeConfig`, функція мутувала `lines` і писала в `auditLog`.

**Evidence:** `src/shared/calculateTotal.ts:1,15,19-21` (стартовий код).

**Decision:** сигнатура `calculateTotal(lines, { taxRate, discountPercent })`; без мутації та logging. Checkout отримує правила через injectable `pricing()` і пише audit після обчислення.

**Why:** результат перевіряється лише аргументами, повторний виклик безпечний.

**Alternative:** залишити читання `runtimeConfig` як default параметр функції.

**Why rejected:** hidden state повернувся б непомітно для читача виклику.

**Trade-off:** кожен caller мусить сам отримати pricing rules; Checkout залежить від `config.ts`.

**Verification:** `tests/calculateTotal.test.ts` (frozen lines, зміна globals, порожній audit), стартовий тест `total: 240`.
