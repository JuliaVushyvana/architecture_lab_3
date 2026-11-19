# Architecture Lab 3

Практична робота 3 «Рефакторинг під зміну вимог» з архітектури ПЗ.

- **Автор:** Юлія Фень
- **Заявлений рівень:** 90+

Checkout backend оформлює замовлення, резервує залишки й проводить оплату через один із двох локальних payment providers (Stripe-симулятор і SandboxPay). Публічний Checkout API збережено без змін.

## Запуск

Потрібен Node.js 22.18 або новіший. Встановлювати залежності не потрібно.

```bash
npm test                    # функціональні, unit і architecture тести
npm run check:architecture  # architecture fitness functions (exit code 1 при порушенні)
npm start                   # демо checkout (provider за замовчуванням: stripe)
PAYMENT_PROVIDER=sandboxpay npm start
```

Детерміновані токени симуляторів: `tok_*` → `paid`, `pending_*` → `processing`, `fail_*` → `failed`.

## Перевірки

- **Стартові тести** `tests/checkout.functional.test.ts` — не змінені, проходять.
- **Нормалізація статусів** — paid / processing / failed / невідомий статус (fail closed) для обох providers.
- **Обидва providers** — paid, processing, failed; Checkout API однаковий для кожного.
- **Inventory** — all-or-nothing `reserve`, без часткової зміни залишків, invariant `available ≥ 0`.
- **calculateTotal** — детермінований, не мутує `lines`, без audit side effect.
- **Checkout contract** — точна форма відповіді для paid / processing / failed.
- **`npm run check:architecture`** — заборона imports чужих `internal/`, заборона доступу Orders/Checkout до `database.stock`, відсутність циклів у графі imports (файли й модулі). Сам checker покрито тестами на fixture-деревах.

## Структура

```text
src/checkout/      Checkout API (orchestration: pricing, audit)
src/orders/        замовлення; public API — orders/index.ts
src/payments/      public API — payments/index.ts; adapters у payments/internal/
src/inventory/     власник залишків; public API — inventory/index.ts
src/reports/       consumers нормалізованого PaymentStatus
src/notifications/
src/shared/        чистий calculateTotal
scripts/           check-architecture.ts
tests/             тести
REVIEW.md          architecture review, prediction і actual impact
DECISIONS.md       журнал рішень і AI review
ADR-001-payments-boundary.md
```
