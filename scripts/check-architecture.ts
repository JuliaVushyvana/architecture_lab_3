// Architecture fitness functions. Scans every .ts file under src/ and fails when:
//   1. a module imports an internal/ file of another module;
//   2. Orders or Checkout accesses Inventory storage (database.stock) directly;
//   3. the graph of local imports contains a cycle (file level or module level).
// Usage: node scripts/check-architecture.ts [srcDir]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type Violation = { rule: "internal-import" | "inventory-storage" | "cycle"; message: string };

type ImportEdge = { from: string; to: string; line: number };

const STORAGE_GUARDED_MODULES = ["orders", "checkout"];

export function checkArchitecture(srcDir: string): { violations: Violation[]; files: number; imports: number } {
  const root = resolve(srcDir);
  const files = listSourceFiles(root);
  const sources = new Map(files.map((file) => [file, stripComments(readFileSync(file, "utf8"))]));
  const edges = files.flatMap((file) => collectImports(file, sources.get(file)!));
  const rel = (file: string) => relative(process.cwd(), file).split(sep).join("/");
  const moduleOf = (file: string) => relative(root, file).split(sep)[0];

  const violations: Violation[] = [];

  for (const edge of edges) {
    const target = relative(root, edge.to).split(sep);
    const owner = target[0];
    if (target.slice(1, -1).includes("internal") && moduleOf(edge.from) !== owner) {
      violations.push({
        rule: "internal-import",
        message:
          `${rel(edge.from)}:${edge.line} imports ${rel(edge.to)}, which is internal to module "${owner}". ` +
          `Use the public API of "${owner}" instead.`,
      });
    }
  }

  for (const file of files) {
    if (!STORAGE_GUARDED_MODULES.includes(moduleOf(file))) continue;
    for (const line of findStorageAccess(sources.get(file)!)) {
      violations.push({
        rule: "inventory-storage",
        message:
          `${rel(file)}:${line} accesses Inventory storage (database.stock) directly. ` +
          `Only Inventory owns stock; use src/inventory/index.ts (e.g. Inventory.reserve).`,
      });
    }
  }

  for (const cycle of findCycles(edges.map((edge) => [edge.from, edge.to]))) {
    violations.push({ rule: "cycle", message: `file dependency cycle: ${cycle.map(rel).join(" -> ")}` });
  }
  const moduleEdges = edges
    .map((edge): [string, string] => [moduleOf(edge.from), moduleOf(edge.to)])
    .filter(([from, to]) => from !== to);
  for (const cycle of findCycles(moduleEdges)) {
    const evidence = cycle.slice(1).map((to, i) => {
      const edge = edges.find((e) => moduleOf(e.from) === cycle[i] && moduleOf(e.to) === to)!;
      return `${rel(edge.from)}:${edge.line}`;
    });
    violations.push({
      rule: "cycle",
      message: `module dependency cycle: ${cycle.join(" -> ")} (via ${evidence.join(", ")})`,
    });
  }

  return { violations, files: files.length, imports: edges.length };
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(ts|mts|js|mjs)$/.test(name) ? [path] : [];
  });
}

// Replaces comments with spaces (keeping newlines) so line numbers stay valid
// and commented-out code is ignored. String contents are preserved.
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?:type\s+)?[\w*$\s{},]*?\s*from\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function collectImports(file: string, source: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const target = resolveImport(dirname(file), specifier);
      if (target) edges.push({ from: file, to: target, line: lineAt(source, match.index!) });
    }
  }
  return edges;
}

function resolveImport(fromDir: string, specifier: string): string | undefined {
  const base = resolve(fromDir, specifier);
  const candidates = [base, `${base}.ts`, join(base, "index.ts")];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile());
}

function findStorageAccess(source: string): number[] {
  // Names bound to the shared database object, including aliases (import { database as db }).
  const names = ["database", ...[...source.matchAll(/\bdatabase\s+as\s+([\w$]+)/g)].map((m) => m[1])];
  const lines = new Set<number>();
  for (const name of names) {
    const access = new RegExp(`\\b${name}\\s*(?:\\.\\s*stock\\b|\\[\\s*["'\`]stock["'\`]\\s*\\])`, "g");
    const destructure = new RegExp(`\\{[^}]*\\bstock\\b[^}]*\\}\\s*=\\s*${name}\\b`, "g");
    for (const pattern of [access, destructure]) {
      for (const match of source.matchAll(pattern)) lines.add(lineAt(source, match.index!));
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

// Returns one representative cycle per strongly connected component (Tarjan).
function findCycles(edgeList: Array<[string, string]>): string[][] {
  const graph = new Map<string, Set<string>>();
  for (const [from, to] of edgeList) {
    if (!graph.has(from)) graph.set(from, new Set());
    if (!graph.has(to)) graph.set(to, new Set());
    graph.get(from)!.add(to);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string) => {
    index.set(node, index.size);
    low.set(node, index.get(node)!);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node)!) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || graph.get(node)!.has(node)) components.push(component);
    }
  };
  for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node);

  return components.map((component) => cyclePath(graph, new Set(component)));
}

// Shortest path back to the start node inside one component, e.g. [a, b, a].
function cyclePath(graph: Map<string, Set<string>>, members: Set<string>): string[] {
  const start = [...members].sort()[0];
  const previous = new Map<string, string>();
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of graph.get(node)!) {
      if (!members.has(next)) continue;
      if (next === start) {
        const path = [start];
        for (let at = node; at !== start; at = previous.get(at)!) path.unshift(at);
        path.unshift(start);
        return path;
      }
      if (!previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return [start, start];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srcDir = process.argv[2] ?? "src";
  const { violations, files, imports } = checkArchitecture(srcDir);
  if (violations.length > 0) {
    console.error(`Architecture check FAILED: ${violations.length} violation(s) in ${srcDir}\n`);
    for (const violation of violations) console.error(`  [${violation.rule}] ${violation.message}`);
    process.exit(1);
  }
  console.log(`Architecture check passed: ${files} files, ${imports} local imports, 3 rules, 0 violations.`);
}
