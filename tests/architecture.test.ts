import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkArchitecture } from "../scripts/check-architecture.ts";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "arch-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function rulesOf(files: Record<string, string>): string[] {
  const root = fixture(files);
  try {
    return checkArchitecture(root).violations.map((violation) => violation.rule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("current repository tree satisfies all rules", () => {
  assert.deepEqual(checkArchitecture("src").violations, []);
});

test("detects an import of another module's internal file", () => {
  assert.deepEqual(rulesOf({
    "payments/internal/client.ts": "export const client = 1;\n",
    "orders/service.ts": 'import { client } from "../payments/internal/client.ts";\n',
  }), ["internal-import"]);
});

test("allows a module to import its own internal files", () => {
  assert.deepEqual(rulesOf({
    "payments/internal/client.ts": "export const client = 1;\n",
    "payments/index.ts": 'export { client } from "./internal/client.ts";\n',
    "orders/service.ts": 'import { client } from "../payments/index.ts";\n',
  }), []);
});

test("detects Orders or Checkout touching stock storage, including aliases", () => {
  const database = "export const database = { stock: new Map(), orders: new Map() };\n";
  assert.deepEqual(rulesOf({
    "database.ts": database,
    "orders/service.ts": 'import { database } from "../database.ts";\ndatabase.stock.set("a", 1);\n',
  }), ["inventory-storage"]);
  assert.deepEqual(rulesOf({
    "database.ts": database,
    "checkout/controller.ts": 'import { database as db } from "../database.ts";\nconst { stock } = db;\n',
  }), ["inventory-storage"]);
});

test("ignores stock access in comments and in Inventory itself", () => {
  assert.deepEqual(rulesOf({
    "database.ts": "export const database = { stock: new Map() };\n",
    "orders/service.ts": "// database.stock.set('a', 1)\n/* database.stock */\n",
    "inventory/index.ts": 'import { database } from "../database.ts";\ndatabase.stock.get("a");\n',
  }), []);
});

test("detects file and module dependency cycles", () => {
  const rules = rulesOf({
    "orders/a.ts": 'import { b } from "../payments/b.ts";\nexport const a = 1;\n',
    "payments/b.ts": 'import { a } from "../orders/a.ts";\nexport const b = 2;\n',
  });
  assert.deepEqual(rules, ["cycle", "cycle"]);
});

test("detects a module cycle even without a file cycle", () => {
  assert.deepEqual(rulesOf({
    "orders/a.ts": 'import "../payments/b.ts";\n',
    "orders/c.ts": "export const c = 1;\n",
    "payments/b.ts": "export const b = 1;\n",
    "payments/d.ts": 'export { c } from "../orders/c.ts";\n',
  }), ["cycle"]);
});

test("CLI exits with a non-zero code and a readable message", () => {
  const root = fixture({
    "payments/internal/client.ts": "export const client = 1;\n",
    "checkout/controller.ts": 'import type { client } from "../payments/internal/client.ts";\n',
  });
  try {
    const result = spawnSync(process.execPath, ["scripts/check-architecture.ts", root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[internal-import\] .*checkout\/controller\.ts:1 imports .*internal to module "payments"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
