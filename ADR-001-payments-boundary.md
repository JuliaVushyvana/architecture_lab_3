# ADR-001: Payments boundary

- **Status:** Accepted (2026-11-19)
- **Deciders:** автор(и) роботи, див. README

## Context

До рефакторингу знання про Stripe було розподілене між Checkout (`StripePayload`), Orders (`StripeClient`), Reports і Notifications (три копії mapping), а Payments сам записував статус замовлення через `orders/internal` — тобто між Orders і Payments був цикл. Change request вимагає другого provider і статусу `processing` без зміни Checkout API. Отже, треба явно вирішити, **де проходить межа Payments і якою вона буде**: модуль в одному процесі чи окремий service.

Поточний контекст системи:

- один deployable Node.js-процес, одна команда, спільна in-memory/single-DB модель;
- `authorize` — синхронний виклик у межах checkout, результат потрібен одразу для відповіді клієнту;
- провайдери — локальні детерміновані adapters; реальних мережевих викликів, PCI-scope чи окремих SLA немає;
- навантаження навчальне (одиниці запитів за секунду), і Payments не має власного профілю масштабування.

## Decision

Payments залишається **модулем у тому ж процесі** з явною межею:

- публічний контракт — лише `src/payments/index.ts`: `PaymentGateway.authorize(AuthorizePaymentRequest) → PaymentResult` і `PaymentStatus = "paid" | "processing" | "failed"`;
- усе provider-specific (payload, response, status names, клієнти, конвертація суми) лежить у `src/payments/internal/**` і недоступне іншим модулям;
- нормалізація статусів — одна політика `normalizeStatus` (unknown → `failed`) і по одній таблиці на adapter;
- provider обирається в composition root (`createPaymentGateway(provider)` / `PAYMENT_PROVIDER`), consumers отримують `PaymentGateway` через constructor;
- Payments не залежить від Orders; напрям: Checkout → Orders → Payments;
- межа захищена автоматично: `npm run check:architecture` (internal imports, cycles).

## Alternatives

1. **Окремий Payments service (HTTP/gRPC) уже зараз.** Відхилено: синхронний checkout отримав би мережевий hop, таймаути, retries та ідемпотентність, розподілену транзакцію «reserve → charge» і окремий deploy pipeline — без жодної вимоги, яка це виправдовує. Ізоляція, яку дав би service, вже досягнута контрактом і fitness function.
2. **Без явної межі (як було): кожен consumer говорить із provider напряму.** Відхилено: другий provider і `processing` вимагали б правок у 5+ модулях, а цикл Orders ↔ Payments блокує будь-яке подальше виділення.
3. **Generic gateway з `payload: unknown`.** Відхилено: consumers усе одно знали б формат provider — межа була б лише формальною.

## Consequences

**Переваги:**

- новий provider = новий adapter у `payments/internal/<provider>/` + рядок у `PROVIDERS`; Checkout, Orders, Reports, Notifications не змінюються (перевірено на SandboxPay);
- Orders тестується з fake `PaymentGateway`, без Stripe;
- контракт уже має форму, яку можна винести за мережу без зміни consumers (`authorize` — async, DTO серіалізовні).

**Складність / ціна:**

- додатковий шар: контракт, adapter на кожен provider, composition root;
- контракт треба еволюціонувати обережно — новий статус (наприклад, `manual_review`) змінює union і всіх consumers, які роблять exhaustive mapping (Reports, Notifications);
- спільна БД і спільний процес: збій або витік пам'яті в adapter впливає на весь checkout; немає незалежного масштабування чи деплою;
- fitness function — регулярні вирази, а не повний парсер TypeScript; екзотичний синтаксис import може її обійти.

## Microservice trigger

Переглянути рішення і винести Payments в окремий service, якщо виконується **хоча б одна** вимірювана умова (перевіряється раз на квартал або при інциденті):

| Тригер | Поріг | Чому саме він |
|---|---|---|
| Окремий compliance-контур | з'являється вимога PCI DSS SAQ D (зберігаємо/обробляємо PAN), або аудитор вимагає ізоляції payment-коду | ізоляція scope дешевша за сертифікацію всього моноліту |
| Асинхронне підтвердження | > 20 % платежів завершуються через webhook/polling, а не в синхронному `authorize` | потрібен власний життєвий цикл, черга й retries, незалежні від HTTP-запиту checkout |
| Незалежне масштабування | p95 `authorize` > 800 мс або Payments споживає > 50 % CPU процесу при піковому навантаженні протягом 2 тижнів | масштабувати весь моноліт заради одного модуля стає дорожче |
| Темп змін і ownership | окрема команда володіє Payments і > 30 % релізів моноліту блокуються змінами лише в `src/payments/**` | межа деплою має збігатися з межею команди |
| Кількість provider | ≥ 4 провайдери з різними SLA/вікнами обслуговування, і падіння одного provider-adapter двічі за квартал впливало на весь checkout | потрібна ізоляція збоїв (bulkhead) |

Поки жоден тригер не спрацював, модуль із захищеною межею дає ту саму локальність змін без операційної ціни розподіленої системи.
