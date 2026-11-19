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
