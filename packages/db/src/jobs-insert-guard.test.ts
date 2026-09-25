import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

/**
 * Guard for the jobs-writer rule (`jobs-insert.ts`): every INSERT into `jobs` in the app and the
 * packages goes through `withBoundedJobsInsert`, whose callback is ONE expression building ONE
 * INSERT and awaits nothing; every row of it ends with `createdAt: JOBS_CREATED_AT` (imported from
 * the helper module) and no other createdAt; its conflict `set` never touches createdAt; and there
 * is no raw `INSERT INTO jobs`. Job alerts rely on it (`ALERT_JOBS_SETTLE_MS`), so a new writer that
 * stamps `created_at` any other way, or inserts outside a bounded transaction, must fail CI instead
 * of silently reopening the gap.
 *
 * It parses the sources (TypeScript AST), so it sees through formatting, aliases (`import { jobs as
 * t }`, `const t = jobs`, `const { jobs: t } = schema`) and multi-line chains, and follows a local
 * variable passed to `.values()` or spread into it. It cannot see inside a function that builds the
 * row elsewhere (e.g. `mapJobToDb`); the run-time check in `withBoundedJobsInsert`
 * (`jobsInsertSqlProblem`, on the rendered SQL) and the SQL-level tests (`jobs-insert.test.ts`,
 * `packages/triggers/src/map-job.test.ts`) cover that. Test files are not scanned: fixtures may set
 * `created_at` on purpose.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "public", "__tests__", "__mocks__"]);
const SOURCE_FILE = /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/;
const NOT_SOURCE = /\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/;
const HELPER = "withBoundedJobsInsert";
const TX_TYPE = "JobsInsertTx";
const STAMP = "JOBS_CREATED_AT";
/** Where JOBS_CREATED_AT may come from: the package entry or the helper module itself. */
const STAMP_MODULE = /^@ever-hust\/db$|(?:^|\/)jobs-insert(?:\.[cm]?[jt]s)?$/;
const CREATED_AT_KEYS = new Set(["createdAt", "created_at"]);
/** The only calls an INSERT chain may make. Anything else (`.then()`, `.execute()`...) runs more or waits. */
const CHAIN_METHODS = new Set(["values", "onConflictDoUpdate", "onConflictDoNothing", "returning"]);
const RAW_INSERT = /\binsert\s+into\s+(?:"?public"?\s*\.\s*)?"?jobs"?(?=[\s(;"`]|$)/i;

type ViolationKind = "createdAt" | "no-stamp" | "unbounded" | "shape" | "multiple-inserts" | "raw-sql" | "await";
const HELP: Record<ViolationKind, string> = {
  createdAt: "createdAt may only be `createdAt: JOBS_CREATED_AT` (imported from @ever-hust/db), as the LAST key of each row, and never in the conflict set",
  "no-stamp": "every row of an INSERT into jobs must end with `createdAt: JOBS_CREATED_AT`",
  unbounded: "an INSERT into jobs must be built inside withBoundedJobsInsert(db, (tx) => tx.insert(jobs)...) or a same-file builder taking tx: JobsInsertTx that is called there",
  shape: "the callback (or a JobsInsertTx builder) must be ONE expression: tx.insert(jobs).values(...)[.onConflictDo...][.returning(...)], or a call to a same-file builder with tx",
  "multiple-inserts": "one bounded transaction runs exactly one INSERT",
  "raw-sql": "no raw INSERT INTO jobs: use withBoundedJobsInsert",
  await: "the callback must await nothing (the transaction would sit idle)",
};
interface Violation {
  file: string;
  line: number;
  kind: ViolationKind;
  text: string;
  help: string;
}
interface ScanResult {
  inserts: { file: string; line: number }[];
  violations: Violation[];
}

type FunctionWithBody = ts.FunctionLikeDeclaration & { body: ts.ConciseBody };
const isFunctionWithBody = (n: ts.Node): n is FunctionWithBody =>
  (ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n) ||
    ts.isConstructorDeclaration(n)) &&
  n.body !== undefined;

/** Strip parentheses, `as`, `satisfies`, `!` and `<T>` casts. */
function unwrap(e: ts.Expression): ts.Expression {
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) {
      e = e.expression;
    } else {
      return e;
    }
  }
}

function scanSource(file: string, text: string): ScanResult {
  const kind = /\.[cm]?tsx$|\.jsx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const result: ScanResult = { inserts: [], violations: [] };
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const reported = new Set<string>();
  const report = (node: ts.Node, k: ViolationKind) => {
    const id = `${node.pos}:${node.end}:${k}`;
    if (reported.has(id)) return;
    reported.add(id);
    result.violations.push({ file, line: lineOf(node), kind: k, text: node.getText(sf).replace(/\s+/g, " ").slice(0, 160), help: HELP[k] });
  };

  const calleeName = (call: ts.CallExpression) => {
    const e = call.expression;
    return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
  };
  const txParamName = (fn: ts.SignatureDeclaration) => {
    const param = fn.parameters.find((p) => p.type !== undefined && p.type.getText(sf) === TX_TYPE && ts.isIdentifier(p.name));
    return param ? (param.name as ts.Identifier).text : undefined;
  };
  const firstParamName = (fn: ts.SignatureDeclaration) => {
    const first = fn.parameters[0];
    return first && ts.isIdentifier(first.name) ? first.name.text : undefined;
  };
  const functionName = (fn: FunctionWithBody) => {
    if (ts.isFunctionDeclaration(fn)) return fn.name?.text;
    const p = fn.parent;
    return (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) ? p.name.text : undefined;
  };

  // ---- Pass 1: names -------------------------------------------------------------------------
  // Local names of the `jobs` table, every variable initializer by name (to look through
  // `.values(rows)` and `...row`), the local names JOBS_CREATED_AT is imported under, every other
  // binding (a local declaration with the stamp's name shadows it), and the JobsInsertTx builders.
  const tableNames = new Set(["jobs"]);
  const initializers = new Map<string, ts.Node[]>();
  const stampImports = new Set<string>();
  const declaredNames = new Set<string>();
  const builders = new Map<string, FunctionWithBody>();
  const aliasCandidates: { name: string; init: ts.Expression }[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isImportSpecifier(node)) {
      const imported = (node.propertyName ?? node.name).text;
      if (imported === "jobs") tableNames.add(node.name.text);
      const declaration = node.parent.parent.parent;
      if (imported === STAMP && ts.isStringLiteral(declaration.moduleSpecifier) && STAMP_MODULE.test(declaration.moduleSpecifier.text)) {
        stampImports.add(node.name.text);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declaredNames.add(node.name.text);
      if (node.initializer) {
        initializers.set(node.name.text, [...(initializers.get(node.name.text) ?? []), node.initializer]);
        aliasCandidates.push({ name: node.name.text, init: node.initializer });
      }
    }
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      declaredNames.add(node.name.text);
      const key = node.propertyName && (ts.isIdentifier(node.propertyName) || ts.isStringLiteral(node.propertyName)) ? node.propertyName.text : node.name.text;
      if (key === "jobs" && ts.isObjectBindingPattern(node.parent)) tableNames.add(node.name.text);
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) declaredNames.add(node.name.text);
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declaredNames.add(node.name.text);
    if (isFunctionWithBody(node) && txParamName(node) !== undefined) {
      const name = functionName(node);
      if (name) builders.set(name, node);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);
  const stampNames = new Set([...stampImports].filter((n) => !declaredNames.has(n)));

  const isJobsTable = (node: ts.Expression): boolean => {
    const e = unwrap(node);
    return (
      (ts.isIdentifier(e) && tableNames.has(e.text)) ||
      (ts.isPropertyAccessExpression(e) && e.name.text === "jobs") ||
      (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression) && e.argumentExpression.text === "jobs")
    );
  };
  // `const t = jobs`, `const t = schema.jobs`, and chains of those.
  for (let grew = true; grew; ) {
    grew = false;
    for (const { name, init } of aliasCandidates) {
      if (!tableNames.has(name) && isJobsTable(init)) {
        tableNames.add(name);
        grew = true;
      }
    }
  }

  const isInsertCall = (n: ts.Node): n is ts.CallExpression & { expression: ts.PropertyAccessExpression } =>
    ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "insert" && n.arguments.length === 1;
  const isJobsInsertCall = (n: ts.Node): n is ts.CallExpression & { expression: ts.PropertyAccessExpression } =>
    isInsertCall(n) && isJobsTable(n.arguments[0]!);

  const nearestFunction = (node: ts.Node): FunctionWithBody | undefined => {
    for (let n = node.parent; n; n = n.parent) if (isFunctionWithBody(n)) return n;
    return undefined;
  };
  const isHelperCallback = (fn: ts.Node) =>
    fn.parent !== undefined && ts.isCallExpression(fn.parent) && calleeName(fn.parent) === HELPER && fn.parent.arguments[1] === fn;

  /** The one expression a function returns, or undefined when its body is anything else. */
  const returnedExpression = (fn: FunctionWithBody): ts.Expression | undefined => {
    if (!ts.isBlock(fn.body)) return unwrap(fn.body);
    const [only, ...rest] = fn.body.statements;
    return only && rest.length === 0 && ts.isReturnStatement(only) && only.expression ? unwrap(only.expression) : undefined;
  };
  /** `expr` is a call chain whose root is `<receiver>.insert(<jobs>)`. */
  const isInsertChainOn = (expr: ts.Expression, receiver: string | undefined): boolean => {
    for (let e = unwrap(expr); ; ) {
      if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return false;
      if (isJobsInsertCall(e)) {
        const r = unwrap(e.expression.expression);
        return receiver !== undefined && ts.isIdentifier(r) && r.text === receiver;
      }
      e = unwrap(e.expression.expression);
    }
  };
  const isBuilderCall = (expr: ts.Expression, tx: string | undefined): boolean =>
    tx !== undefined &&
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    builders.has(expr.expression.text) &&
    expr.arguments.some((a) => {
      const u = unwrap(a);
      return ts.isIdentifier(u) && u.text === tx;
    });

  /**
   * Call `onKey` for every object key named createdAt / created_at under `node`, following
   * identifiers to their initializers in this file.
   */
  const walkKeys = (node: ts.Node, onKey: (prop: ts.ObjectLiteralElementLike, key: string) => void, seen = new Set<string>()) => {
    const visit = (n: ts.Node) => {
      if (
        (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isMethodDeclaration(n)) &&
        n.name !== undefined &&
        ts.isObjectLiteralExpression(n.parent)
      ) {
        const name = n.name;
        const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : ts.isComputedPropertyName(name) ? name.expression.getText(sf) : "";
        if (CREATED_AT_KEYS.has(key) || [...CREATED_AT_KEYS].some((k) => ts.isComputedPropertyName(name) && key.includes(k))) {
          onKey(n, key);
        }
      }
      if (ts.isIdentifier(n) && !seen.has(n.text) && initializers.has(n.text)) {
        const isReference =
          !n.parent ||
          !(
            (ts.isPropertyAssignment(n.parent) && n.parent.name === n) ||
            (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
          );
        if (isReference) {
          seen.add(n.text);
          for (const init of initializers.get(n.text)!) walkKeys(init, onKey, seen);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  /** `.values(arg)`: the only createdAt is `createdAt: JOBS_CREATED_AT`, last in its object, and it is there. */
  const checkValues = (arg: ts.Node) => {
    let stamped = false;
    walkKeys(arg, (prop, key) => {
      const isStamp = key === "createdAt" && ts.isPropertyAssignment(prop) && ts.isIdentifier(unwrap(prop.initializer)) && stampNames.has((unwrap(prop.initializer) as ts.Identifier).text);
      if (!isStamp) return report(prop, "createdAt");
      stamped = true;
      const object = prop.parent as ts.ObjectLiteralExpression;
      // A spread or key after it could override the stamp.
      if (object.properties[object.properties.length - 1] !== prop) report(prop, "createdAt");
    });
    if (!stamped) report(arg, "no-stamp");
  };
  const checkNoCreatedAt = (arg: ts.Node) => walkKeys(arg, (prop) => report(prop, "createdAt"));

  /** An `await` in this function's own body (nested functions are their own business). */
  const checkNoAwait = (fn: ts.SignatureDeclaration) => {
    const visitBody = (n: ts.Node) => {
      if (n !== fn && ts.isFunctionLike(n)) return;
      if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier)) report(n, "await");
      ts.forEachChild(n, visitBody);
    };
    ts.forEachChild(fn, visitBody);
  };
  /** At most one INSERT (or builder call) anywhere inside the function, nested functions included. */
  const checkSingleInsert = (fn: ts.Node) => {
    let count = 0;
    const visitAll = (n: ts.Node) => {
      if (isInsertCall(n) || (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && builders.has(n.expression.text))) count++;
      ts.forEachChild(n, visitAll);
    };
    ts.forEachChild(fn, visitAll);
    if (count > 1) report(fn, "multiple-inserts");
  };

  const templateText = (node: ts.TemplateExpression) =>
    node.head.text + node.templateSpans.map((s) => "${" + s.expression.getText(sf) + "}" + s.literal.text).join("");

  // ---- Pass 2: checks ------------------------------------------------------------------------
  const visit = (node: ts.Node) => {
    // The transaction's callback: one expression building the one INSERT (or calling a builder).
    if (ts.isCallExpression(node) && calleeName(node) === HELPER) {
      const callback = node.arguments[1];
      if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        report(node, "shape");
      } else {
        checkNoAwait(callback);
        checkSingleInsert(callback);
        const tx = firstParamName(callback);
        const returned = returnedExpression(callback);
        if (!returned || !(isInsertChainOn(returned, tx) || isBuilderCall(returned, tx))) report(callback, "shape");
      }
    }
    // A JobsInsertTx builder: the same shape, on its tx parameter.
    if (isFunctionWithBody(node) && txParamName(node) !== undefined && !isHelperCallback(node)) {
      checkNoAwait(node);
      checkSingleInsert(node);
      const name = functionName(node);
      const returned = returnedExpression(node);
      if (!name || builders.get(name) !== node || !returned || !isInsertChainOn(returned, txParamName(node))) report(node, "shape");
    }
    // A builder only runs bounded when it is the value a helper callback returns.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && builders.has(node.expression.text)) {
      const fn = nearestFunction(node);
      if (!fn || !isHelperCallback(fn) || returnedExpression(fn) !== node) report(node, "unbounded");
    }
    if (isJobsInsertCall(node)) {
      result.inserts.push({ file, line: lineOf(node) });
      const receiver = unwrap(node.expression.expression);
      const fn = nearestFunction(node);
      const bounded =
        fn !== undefined &&
        ts.isIdentifier(receiver) &&
        ((isHelperCallback(fn) && firstParamName(fn) === receiver.text) ||
          (txParamName(fn) === receiver.text && functionName(fn) !== undefined && builders.get(functionName(fn)!) === fn));
      if (!bounded) report(node, "unbounded");
      // The chain built on the insert: .values(...).onConflictDoUpdate(...).returning(...)
      let link: ts.Node = node;
      let hasValues = false;
      while (
        link.parent &&
        ts.isPropertyAccessExpression(link.parent) &&
        link.parent.expression === link &&
        link.parent.parent &&
        ts.isCallExpression(link.parent.parent) &&
        link.parent.parent.expression === link.parent
      ) {
        const method = link.parent.name.text;
        link = link.parent.parent;
        if (!CHAIN_METHODS.has(method)) {
          report(link, "shape");
          break;
        }
        const args = (link as ts.CallExpression).arguments;
        if (method === "values") {
          hasValues = true;
          for (const arg of args) checkValues(arg);
        } else if (method !== "returning") {
          // onConflictDoUpdate / onConflictDoNothing: never set createdAt (`returning` only reads).
          for (const arg of args) checkNoCreatedAt(arg);
        }
      }
      if (!hasValues) report(node, "no-stamp");
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (RAW_INSERT.test(node.text)) report(node, "raw-sql");
    }
    if (ts.isTemplateExpression(node)) {
      const t = templateText(node);
      const names = [...tableNames].join("|");
      if (RAW_INSERT.test(t) || new RegExp(`\\binsert\\s+into\\s+\\$\\{(?:${names}|[\\w.]*\\.jobs)\\}`, "i").test(t)) {
        report(node, "raw-sql");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return result;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      sourceFiles(path.join(dir, entry.name), out);
    } else if (SOURCE_FILE.test(entry.name) && !NOT_SOURCE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const kinds = (r: ScanResult) => r.violations.map((v) => v.kind).sort();
const IMPORTS = `import { db, jobs, JOBS_CREATED_AT, withBoundedJobsInsert, type JobsInsertTx } from "@ever-hust/db";\n`;
const scan = (name: string, body: string) => scanSource(name, IMPORTS + body);

describe("jobs-writer guard: the scanner (known-clean and known-dirty controls)", () => {
  it("accepts the rule's shape: inside withBoundedJobsInsert, stamped with JOBS_CREATED_AT last, not in the conflict set", () => {
    const r = scan(
      "ok.ts",
      `await withBoundedJobsInsert(db, (tx) =>
        tx.insert(jobs).values({ ...mapped, ...(coords ?? {}), createdAt: JOBS_CREATED_AT })
          .onConflictDoUpdate({ target: jobs.externalId, set: { ...mapped, updatedAt: new Date() } }),
      );`,
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.violations).toEqual([]);
  });

  it("accepts a block body with a single return, per-row stamps in a map, and the helper module's own import", () => {
    expect(
      kinds(scan("block.ts", `withBoundedJobsInsert(db, (tx) => { return tx.insert(jobs).values({ ...row, createdAt: JOBS_CREATED_AT }); });`)),
    ).toEqual([]);
    expect(
      kinds(
        scanSource(
          "packages/db/src/seed-like.ts",
          `import { JOBS_CREATED_AT, withBoundedJobsInsert } from "./jobs-insert";
          import { jobs } from "./schema/jobs";
          await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(batch.map((job) => ({ ...job, createdAt: JOBS_CREATED_AT }))).onConflictDoNothing());`,
        ),
      ),
    ).toEqual([]);
  });

  it("accepts a same-file builder that takes tx: JobsInsertTx and is the callback's value; returning(createdAt) is a read", () => {
    const r = scan(
      "builder.ts",
      `export function buildUpsertQuery(tx: JobsInsertTx, rows: JobRow[]) {
        return tx
          .insert(jobs)
          .values(rows.map((row) => ({ ...row, createdAt: JOBS_CREATED_AT })))
          .onConflictDoUpdate({ target: jobs.externalId, set, setWhere: changed() })
          .returning({ externalId: jobs.externalId, createdAt: jobs.createdAt, inserted: sql\`(xmax = 0)\` });
      }
      const returned = await withBoundedJobsInsert(database, (tx) => buildUpsertQuery(tx, rows));`,
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.violations).toEqual([]);
  });

  it("flags an insert with no stamp: the column default now() is the transaction's start, not the INSERT's", () => {
    // The previous rule's writers (no createdAt at all).
    expect(
      kinds(
        scan(
          "prev.ts",
          `await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...mapped, ...(coords ?? {}) }).onConflictDoUpdate({ target: jobs.externalId, set: { ...mapped } }));`,
        ),
      ),
    ).toEqual(["no-stamp"]);
    expect(kinds(scan("rows.ts", `function b(tx: JobsInsertTx, rows: JobRow[]) { return tx.insert(jobs).values(rows); }`))).toEqual(["no-stamp"]);
    expect(kinds(scan("novalues.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).select(fromStaging));`))).toEqual(["no-stamp", "shape"]);
  });

  it("flags every createdAt that is not the imported JOBS_CREATED_AT (the old writers' new Date(), now(), a copy of the SQL)", () => {
    expect(
      kinds(scan("date.ts", `await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...mapped, createdAt: new Date() }));`)),
    ).toEqual(["createdAt", "no-stamp"]);
    expect(
      kinds(scan("inline.ts", "withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, createdAt: sql`statement_timestamp()` }));")),
    ).toEqual(["createdAt", "no-stamp"]);
    expect(kinds(scan("short.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, createdAt }));`))).toEqual([
      "createdAt",
      "no-stamp",
    ]);
    // The column's SQL name is not the key Drizzle reads.
    expect(kinds(scan("snake.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, "created_at": JOBS_CREATED_AT }));`))).toEqual([
      "createdAt",
      "no-stamp",
    ]);
  });

  it("trusts JOBS_CREATED_AT only when imported from the helper module and not shadowed", () => {
    const body = `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, createdAt: JOBS_CREATED_AT }));`;
    expect(
      kinds(scanSource("other-module.ts", `import { JOBS_CREATED_AT } from "./my-stamps";\nimport { jobs } from "@ever-hust/db";\n${body}`)),
    ).toEqual(["createdAt", "no-stamp"]);
    expect(kinds(scan("shadow.ts", `const JOBS_CREATED_AT = new Date();\n${body}`))).toEqual(["createdAt", "no-stamp"]);
    expect(kinds(scanSource("local.ts", `import { jobs } from "@ever-hust/db";\nconst JOBS_CREATED_AT = sql\`now()\`;\n${body}`))).toEqual([
      "createdAt",
      "no-stamp",
    ]);
    // Control: an aliased import from the helper module is the same reference.
    expect(
      kinds(
        scanSource(
          "alias-stamp.ts",
          `import { jobs, JOBS_CREATED_AT as stamp } from "@ever-hust/db";\nwithBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, createdAt: stamp }));`,
        ),
      ),
    ).toEqual([]);
  });

  it("flags a stamp that a later spread or key could override", () => {
    expect(kinds(scan("order.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ createdAt: JOBS_CREATED_AT, ...mapped }));`))).toEqual([
      "createdAt",
    ]);
  });

  it("flags createdAt in ON CONFLICT DO UPDATE SET, even the stamp, even through a shared row variable", () => {
    expect(
      kinds(
        scan(
          "set.ts",
          `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, createdAt: JOBS_CREATED_AT }).onConflictDoUpdate({ target: jobs.externalId, set: { title: row.title, createdAt: JOBS_CREATED_AT } }));`,
        ),
      ),
    ).toEqual(["createdAt"]);
    expect(
      kinds(
        scan(
          "shared.ts",
          `const row = { ...mapped, createdAt: JOBS_CREATED_AT };
          withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row).onConflictDoUpdate({ target: jobs.externalId, set: row }));`,
        ),
      ),
    ).toEqual(["createdAt"]);
  });

  it("looks through a variable passed to values() or spread into it", () => {
    expect(
      kinds(
        scan(
          "v.ts",
          `const row = { ...mapped, createdAt: new Date() };
          await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row));`,
        ),
      ),
    ).toEqual(["createdAt", "no-stamp"]);
    expect(
      kinds(
        scan(
          "s.ts",
          `const stamp = { createdAt: new Date() };
          await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...mapped, ...stamp, createdAt: JOBS_CREATED_AT }));`,
        ),
      ),
    ).toEqual(["createdAt"]);
    // Control: a stamped row variable is fine.
    expect(
      kinds(
        scan("v-ok.ts", `const row = { ...mapped, createdAt: JOBS_CREATED_AT };\nawait withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row));`),
      ),
    ).toEqual([]);
  });

  it("flags an insert outside a bounded transaction", () => {
    const stamped = `{ ...row, createdAt: JOBS_CREATED_AT }`;
    const r = scan("u.ts", `await db.insert(jobs).values(${stamped}).onConflictDoNothing();`);
    expect(r.inserts).toHaveLength(1);
    expect(kinds(r)).toEqual(["unbounded"]);
    // A plain db.transaction is not enough: it has no timeouts.
    expect(kinds(scan("t.ts", `await db.transaction(async (tx) => { await tx.insert(jobs).values(${stamped}); });`))).toEqual(["unbounded"]);
    // Nor is a builder called from one.
    expect(
      kinds(
        scan(
          "tb.ts",
          `function build(tx: JobsInsertTx) { return tx.insert(jobs).values(${stamped}); }
          await db.transaction((tx) => build(tx));`,
        ),
      ),
    ).toEqual(["unbounded"]);
  });

  it("flags a callback that is not one INSERT expression: .then() chains, two INSERTs, extra statements, a function reference", () => {
    const row = `{ ...row, createdAt: JOBS_CREATED_AT }`;
    // .then() runs a second statement (here a second INSERT, outside the bound's accounting).
    expect(
      kinds(scan("then.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(${row}).then(() => tx.insert(jobs).values(${row})));`)),
    ).toEqual(["multiple-inserts", "shape", "unbounded"]);
    expect(kinds(scan("then1.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(${row}).then((r) => r));`))).toEqual(["shape"]);
    expect(
      kinds(scan("all.ts", `withBoundedJobsInsert(db, (tx) => Promise.all([tx.insert(jobs).values(${row}), tx.insert(jobs).values(${row})]));`)),
    ).toEqual(["multiple-inserts", "shape"]);
    expect(
      kinds(scan("comma.ts", `withBoundedJobsInsert(db, (tx) => (tx.insert(jobs).values(${row}), tx.insert(jobs).values(${row})));`)),
    ).toEqual(["multiple-inserts", "shape"]);
    expect(
      kinds(scan("block2.ts", `withBoundedJobsInsert(db, (tx) => { const q = tx.insert(jobs).values(${row}); return q; });`)),
    ).toEqual(["shape"]);
    expect(kinds(scan("other.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(userJobs).values(${row}));`))).toEqual(["shape"]);
    expect(kinds(scan("ref.ts", `function build(tx: JobsInsertTx) { return tx.insert(jobs).values(${row}); }\nwithBoundedJobsInsert(db, build);`))).toEqual(["shape"]);
    // A builder that is not in this file cannot be checked.
    expect(kinds(scan("imported.ts", `withBoundedJobsInsert(db, (tx) => buildElsewhere(tx, rows));`))).toEqual(["shape"]);
  });

  it("flags an await inside the transaction's callback or a JobsInsertTx builder (the transaction would sit idle)", () => {
    const row = `{ ...mapped, ...coords, createdAt: JOBS_CREATED_AT }`;
    expect(
      kinds(
        scan(
          "aw.ts",
          `await withBoundedJobsInsert(db, async (tx) => {
            const coords = await geocodeLocation(loc);
            return tx.insert(jobs).values(${row});
          });`,
        ),
      ),
    ).toEqual(["await", "shape"]);
    expect(kinds(scan("aw1.ts", `withBoundedJobsInsert(db, async (tx) => tx.insert(jobs).values({ ...(await geocode()), createdAt: JOBS_CREATED_AT }));`))).toEqual([
      "await",
    ]);
    expect(kinds(scan("awb.ts", `async function build(tx: JobsInsertTx) { await sleep(1); return tx.insert(jobs).values(${row}); }`))).toEqual([
      "await",
      "shape",
    ]);
    // Control: awaiting the helper itself, or a function nested in the values, is fine.
    expect(
      kinds(scan("aw-ok.ts", `await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(rows.map((r) => ({ ...r, createdAt: JOBS_CREATED_AT }))));`)),
    ).toEqual([]);
  });

  it("follows table aliases: an aliased import, schema.jobs, const t = jobs, a destructured jobs", () => {
    const stamped = `{ ...row, createdAt: JOBS_CREATED_AT }`;
    const r = scanSource(
      "alias.ts",
      `import { jobs as jobsTable, JOBS_CREATED_AT } from "@ever-hust/db";
      await db.insert(jobsTable).values(${stamped});
      await db.insert(schema.jobs).values(${stamped});
      const t = jobsTable;
      const t2 = t;
      await db.insert(t2).values(${stamped});
      const { jobs: j } = schema;
      await db.insert(j).values(${stamped});`,
    );
    expect(r.inserts).toHaveLength(4);
    expect(kinds(r)).toEqual(["unbounded", "unbounded", "unbounded", "unbounded"]);
    // Control: the alias inside the helper is accepted.
    expect(kinds(scan("alias-ok.ts", `const t = jobs;\nwithBoundedJobsInsert(db, (tx) => tx.insert(t).values(${stamped}));`))).toEqual([]);
  });

  it("flags a raw INSERT INTO jobs, but not another table", () => {
    expect(kinds(scanSource("r1.ts", "await db.execute(sql`INSERT INTO jobs (external_id, created_at) VALUES (${id}, ${t})`);"))).toEqual([
      "raw-sql",
    ]);
    expect(kinds(scanSource("r2.ts", `await client.query('insert into "public"."jobs" (external_id) values ($1)', [id]);`))).toEqual([
      "raw-sql",
    ]);
    expect(kinds(scanSource("r3.ts", "await db.execute(sql`insert into ${jobs} (external_id) values (${id})`);"))).toEqual(["raw-sql"]);
    expect(kinds(scanSource("r4.ts", "await db.execute(sql`insert into jobs_archive select * from jobs`);"))).toEqual([]);
  });

  it("ignores inserts into other tables, even with createdAt", () => {
    const r = scanSource("other.ts", `await db.insert(userJobs).values({ userId, jobId, createdAt: new Date() });`);
    expect(r.inserts).toEqual([]);
    expect(r.violations).toEqual([]);
  });
});

describe("jobs-writer guard: the repository", () => {
  const files = SCAN_ROOTS.flatMap((root) => sourceFiles(path.join(REPO_ROOT, root)));
  const results = files
    .map((file) => ({ file, text: fs.readFileSync(file, "utf8") }))
    // Cheap pre-filter: only files that could hold an insert, the helper or a JobsInsertTx builder.
    .filter(({ text }) => /\.insert\s*\(|insert\s+into|withBoundedJobsInsert|JobsInsertTx/i.test(text))
    .map(({ file, text }) => scanSource(path.relative(REPO_ROOT, file).replace(/\\/g, "/"), text));
  const inserts = results.flatMap((r) => r.inserts);
  const violations = results.flatMap((r) => r.violations);

  it("scans the real sources (not an empty or wrong directory)", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.replace(/\\/g, "/").endsWith("packages/db/src/jobs-insert.ts"))).toBe(true);
    // The dev seed is a jobs writer that is not expected to move; the sync writers may.
    expect(inserts.map((i) => i.file)).toContain("packages/db/src/seed.ts");
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });

  it("every INSERT into jobs is bounded, one expression, stamped with JOBS_CREATED_AT only, and none is raw SQL", () => {
    expect(violations).toEqual([]);
  });
});
