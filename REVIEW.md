# Architecture review

> Review виконано **до** рефакторингу. Номери рядків відповідають стартовому коду (commit `8a52a13`).

| # | Principle | Evidence (file:line) | Practical risk | Fix |
|---|---|---|---|---|
| 1 | Information hiding | `src/checkout/CheckoutController.ts:3`, `src/checkout/CheckoutController.ts:23-28` | Checkout (transport-рівень) знає форму `StripePayload`, те, що Stripe рахує суму в мінорних одиницях (`Math.round(total * 100)`), і поле `metadata.orderId`. Другий provider з іншим payload змусить міняти Checkout, хоча його публічний API не змінюється. Помилка в конвертації суми з'явиться в модулі, який взагалі не відповідає за оплату. | Payments отримує provider-neutral запит (`orderId`, `paymentToken`, `amount`, `currency`); payload будує adapter усередині Payments. |
| 2 | Low coupling / Explicit contracts | `src/orders/OrderService.ts:3-4`, `src/orders/OrderService.ts:10`, `src/orders/OrderService.ts:14`, `src/orders/OrderService.ts:29` | Orders імпортує `StripeClient` з `payments/internal`, створює його сам і приймає `StripePayload` як параметр `placeOrder`. Заміна або додавання provider змінює конструктор і сигнатуру Orders; unit test Orders неможливий без Stripe-специфічних даних. Контракту Payments не існує — є лише деталь реалізації. | Публічний `payments/index.ts` з інтерфейсом `PaymentGateway.authorize()`; Orders отримує його через constructor injection. |
| 3 | High cohesion / Design for change | `src/orders/mapPaymentStatus.ts:3-7`, `src/reports/mapPaymentStatus.ts:3-7`, `src/notifications/mapPaymentStatus.ts:3-7` | Три копії одного mapping provider status → статус системи, кожна імпортує `StripeResponse`. Додавання `processing` або другого provider вимагає синхронних правок у трьох модулях; пропущена копія дасть різні статуси одного платежу в Orders і Reports. Знання про Stripe «розмазане» по системі замість однієї причини змін в одному модулі. | Одна функція нормалізації всередині Payments; Orders/Reports/Notifications працюють лише з нормалізованим `PaymentStatus`. |
| 4 | Ownership | `src/orders/OrderService.ts:15-26` | Orders читає й записує `database.stock` напряму, тобто правило `available ≥ 0` живе в Orders, а не в Inventory. Будь-який інший writer (повернення, адмінка) мусить дублювати правило. Крім того, цикл зменшує залишок рядка 1 до перевірки рядка 2: при нестачі другого товару перший уже списаний — **часткова зміна залишків**. | Inventory публікує `reserve(lines)`: спершу валідує всі позиції, потім атомарно списує, або кидає `InsufficientStockError` без змін. |
| 5 | Ownership / Information hiding | `src/inventory/StockRepository.ts:8-11`, `src/database.ts:9-12` | `updateAvailable()` приймає будь-яке число, включно з від'ємним, а `database` експортується всім модулям. Inventory не має жодного способу захистити свій invariant: від'ємний залишок може записати будь-хто. | Сховище залишків стає internal-деталлю Inventory; публічні операції (`reserve`, `restock`) валідують вхід. |
| 6 | Dependency direction | `src/payments/internal/StripeClient.ts:1-2`, `src/payments/internal/StripeClient.ts:20` | Payments імпортує `orders/internal/orderMutations` → цикл Orders → Payments → Orders. Статус замовлення записують **два** модулі (`StripeClient.ts:20` і `OrderService.ts:32-33`), результат залежить від порядку викликів. Payments неможливо протестувати, перевикористати чи винести в сервіс без Orders. | Payments лише повертає результат; Orders сам оновлює своє замовлення. Залежність одностороння: Orders → Payments. |
| 7 | Local reasoning | `src/shared/calculateTotal.ts:1`, `src/shared/calculateTotal.ts:15`, `src/shared/calculateTotal.ts:19-21` | Результат залежить від прихованого глобального `runtimeConfig`; функція мутує вхідні `lines` (`lineTotal`) і пише в `auditLog`. Unit test мусить готувати globals (див. `tests/checkout.functional.test.ts:9-11`), виклик непомітно змінює request data, повторний виклик «для перевірки» дублює audit-запис. | Передавати `taxRate` і `discountPercent` явно; не мутувати вхід; logging виконувати в orchestration після обчислення. |
| 8 | Explicit contracts | `src/database.ts:4-6`, `src/orders/OrderService.ts:33`, `src/orders/mapPaymentStatus.ts:5` | Статуси типізовані як `string`; словник статусів неявний. `pending` існує в mapping, але Stripe-симулятор ніколи не повертає `requires_action` — гілка мертва й непротестована. Новий `processing` легко «додати» з опечаткою, і нічого цього не помітить. | Явний union `PaymentStatus = "paid" \| "processing" \| "failed"` у публічному контракті Payments + unit tests нормалізації. |
| 9 | Fitness functions | `package.json:9-13`; коментарі `Deliberate ...` у `src/orders/OrderService.ts:3`, `:21`, `src/payments/internal/StripeClient.ts:1` | Жодне архітектурне правило не перевіряється автоматично: усі порушення вище пройшли `npm test`. Після рефакторингу будь-який новий відносний import у `internal/` або цикл повернеться непомітно. | `npm run check:architecture`: заборона чужих `internal/`, заборона доступу Orders/Checkout до stock storage, пошук циклів у графі imports. |

## Change impact prediction (заповнити до реалізації change request)

**Requirement:** підтримати другий навчальний payment provider і нормалізований статус `processing`. Публічний Checkout API (`CheckoutRequest` і відповідь `{ orderId, status, total, paymentStatus }`) та поведінка сценаріїв `paid` / `failed` не змінюються. Provider-specific payload, response і status names не виходять за межі Payments.

**Expected files:**

- `src/payments/**` — новий публічний контракт (`index.ts`), нормалізація статусів, Stripe adapter, другий adapter, вибір provider. Основний обсяг змін.
- `src/orders/OrderService.ts` — перейти зі `StripeClient` на контракт Payments; перестати записувати stock.
- `src/orders/mapPaymentStatus.ts`, `src/reports/mapPaymentStatus.ts`, `src/notifications/mapPaymentStatus.ts` — видалити дублікати; Reports/Notifications отримують лише нормалізований статус.
- `src/checkout/CheckoutController.ts` — прибрати `StripePayload`, передавати neutral-дані.
- `src/payments/internal/StripeClient.ts`, `src/orders/internal/orderMutations.ts` — розірвати цикл.
- `src/inventory/**`, `src/shared/calculateTotal.ts` — ownership і local reasoning (рівень 75, не через сам change request).
- `tests/**`, `package.json` — нові тести та `check:architecture`.

**Modules that should not change:**

- Публічний контракт Checkout і `tests/checkout.functional.test.ts` — мають пройти без змін.
- Inventory — не повинен знати про оплату взагалі; change request його не стосується.
- `src/database.ts` — схема даних замовлення не змінюється (`paymentStatus` лишається рядком у storage).
- Після рефакторингу додавання **другого** provider має торкатися лише `src/payments/**` і тестів; Checkout, Orders, Reports, Notifications — без змін.

## Actual impact (заповнити після реалізації)

**Actual files changed:**

_Буде заповнено після реалізації._

**Difference from prediction and explanation:**

_Буде заповнено після реалізації._
