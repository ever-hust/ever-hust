import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

/**
 * Guard for the jobs-writer rule (`jobs-insert.ts`): every INSERT into `jobs` in the app and the
 * packages goes through `withBoundedJobsInsert` (whose callback awaits nothing) and never passes
 * `createdAt`; there is no raw `INSERT INTO jobs`. Job alerts rely on it
 * (`ALERT_JOBS_SETTLE_MS`), so a new writer that stamps `created_at` in JavaScript, or inserts
 * outside a bounded transaction, must fail CI instead of silently reopening the gap.
 *
 * It parses the sources (TypeScript AST), so it sees through formatting, aliases and multi-line
 * chains. It cannot see inside a function that builds the row elsewhere (e.g. `mapJobToDb`); the
 * SQL-level tests (`jobs-insert.test.ts`, `packages/triggers/src/map-job.test.ts`) cover that.
 * Test files are not scanned: fixtures may set `created_at` on purpose.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "public", "__tests__", "__mocks__"]);
const SOURCE_FILE = /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/;
const NOT_SOURCE = /\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/;
const HELPER = "withBoundedJobsInsert";
const TX_TYPE = "JobsInsertTx";
const CREATED_AT_KEYS = new Set(["createdAt", "created_at"]);
const RAW_INSERT = /\binsert\s+into\s+(?:"?public"?\s*\.\s*)?"?jobs"?(?=[\s(;"`]|$)/i;

type ViolationKind = "createdAt" | "unbounded" | "raw-sql" | "await";
interface Violation {
  file: string;
  line: number;
  kind: ViolationKind;
  text: string;
}
interface ScanResult {
  inserts: { file: string; line: number }[];
  violations: Violation[];
}

function scanSource(file: string, text: string): ScanResult {
  const kind = /\.[cm]?tsx$|\.jsx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const result: ScanResult = { inserts: [], violations: [] };
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const report = (node: ts.Node, k: ViolationKind) =>
    result.violations.push({ file, line: lineOf(node), kind: k, text: node.getText(sf).replace(/\s+/g, " ").slice(0, 160) });

  // Local names of the `jobs` table: `jobs` itself and any `import { jobs as x }`.
  const tableNames = new Set(["jobs"]);
  // Every variable initializer by name, to look through `.values(rows)` and `...row` one hop.
  const initializers = new Map<string, ts.Node[]>();
  const collect = (node: ts.Node) => {
    if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === "jobs") tableNames.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, [...(initializers.get(node.name.text) ?? []), node.initializer]);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const isJobsTable = (node: ts.Expression) =>
    (ts.isIdentifier(node) && tableNames.has(node.text)) ||
    (ts.isPropertyAccessExpression(node) && node.name.text === "jobs");

  const calleeName = (call: ts.CallExpression) => {
    const e = call.expression;
    return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
  };

  /** Inside the callback of `withBoundedJobsInsert(...)`, or on a parameter typed `JobsInsertTx`. */
  const isBounded = (insertCall: ts.CallExpression) => {
    const receiver = (insertCall.expression as ts.PropertyAccessExpression).expression;
    for (let n: ts.Node = insertCall; n.parent; n = n.parent) {
      if (ts.isFunctionLike(n)) {
        const fn = n;
        const p = fn.parent;
        if (p && ts.isCallExpression(p) && calleeName(p) === HELPER && p.arguments.some((a) => a === fn)) return true;
        const typedTx = fn.parameters.some(
          (param) =>
            ts.isIdentifier(param.name) &&
            ts.isIdentifier(receiver) &&
            param.name.text === receiver.text &&
            param.type !== undefined &&
            param.type.getText(sf) === TX_TYPE,
        );
        if (typedTx) return true;
      }
    }
    return false;
  };

  /** Report every object key named createdAt / created_at under `node`, following identifiers one hop. */
  const checkNoCreatedAt = (node: ts.Node, seen = new Set<string>()) => {
    const visit = (n: ts.Node) => {
      if (
        (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isMethodDeclaration(n)) &&
        n.name !== undefined
      ) {
        const name = n.name;
        const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : ts.isComputedPropertyName(name) ? name.expression.getText(sf) : "";
        if (CREATED_AT_KEYS.has(key) || [...CREATED_AT_KEYS].some((k) => ts.isComputedPropertyName(name) && key.includes(k))) {
          report(n, "createdAt");
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
          for (const init of initializers.get(n.text)!) checkNoCreatedAt(init, seen);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  /** Report an `await` in this function's own body (nested functions are their own business). */
  const checkNoAwait = (fn: ts.SignatureDeclaration) => {
    const visitBody = (n: ts.Node) => {
      if (n !== fn && ts.isFunctionLike(n)) return;
      if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier)) report(n, "await");
      ts.forEachChild(n, visitBody);
    };
    ts.forEachChild(fn, visitBody);
  };
  const hasTxParam = (fn: ts.SignatureDeclaration) =>
    fn.parameters.some((param) => param.type !== undefined && param.type.getText(sf) === TX_TYPE);

  const templateText = (node: ts.TemplateExpression) =>
    node.head.text + node.templateSpans.map((s) => "${" + s.expression.getText(sf) + "}" + s.literal.text).join("");

  const visit = (node: ts.Node) => {
    // The transaction's callback (or a JobsInsertTx builder) must build the one statement without
    // awaiting anything, so the transaction is never idle on the client's side.
    if (ts.isCallExpression(node) && calleeName(node) === HELPER) {
      for (const arg of node.arguments) if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) checkNoAwait(arg);
    } else if (ts.isFunctionLike(node) && hasTxParam(node) && !(node.parent && ts.isCallExpression(node.parent) && calleeName(node.parent) === HELPER)) {
      checkNoAwait(node);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "insert" &&
      node.arguments.length === 1 &&
      isJobsTable(node.arguments[0]!)
    ) {
      result.inserts.push({ file, line: lineOf(node) });
      if (!isBounded(node)) report(node, "unbounded");
      // The chain built on the insert: .values(...).onConflictDoUpdate(...).returning(...)
      let link: ts.Node = node;
      while (
        link.parent &&
        ts.isPropertyAccessExpression(link.parent) &&
        link.parent.expression === link &&
        link.parent.parent &&
        ts.isCallExpression(link.parent.parent) &&
        link.parent.parent.expression === link.parent
      ) {
        link = link.parent.parent;
        for (const arg of (link as ts.CallExpression).arguments) checkNoCreatedAt(arg);
      }
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

describe("jobs-writer guard: the scanner (known-clean and known-dirty controls)", () => {
  it("accepts the rule's shape: inside withBoundedJobsInsert, no createdAt", () => {
    const r = scanSource(
      "ok.ts",
      `import { db, jobs, withBoundedJobsInsert } from "@ever-hust/db";
      await withBoundedJobsInsert(db, (tx) =>
        tx.insert(jobs).values({ ...mapped, ...(coords ?? {}) })
          .onConflictDoUpdate({ target: jobs.externalId, set: { ...mapped, updatedAt: new Date() } }),
      );`,
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.violations).toEqual([]);
  });

  it("accepts a builder that takes tx: JobsInsertTx", () => {
    const r = scanSource(
      "builder.ts",
      `export function buildUpsertQuery(tx: JobsInsertTx, rows: JobRow[]) {
        return tx.insert(jobs).values(rows).onConflictDoNothing();
      }`,
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.violations).toEqual([]);
  });

  it("flags createdAt in the values (the old writers' shape)", () => {
    const r = scanSource(
      "w.ts",
      `await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...mapped, ...(coords ?? {}), createdAt: new Date() }));`,
    );
    expect(kinds(r)).toEqual(["createdAt"]);
  });

  it("flags createdAt added per row in a map, shorthand, or as a quoted column key", () => {
    expect(
      kinds(scanSource("a.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(rows.map((row) => ({ ...row, createdAt: now }))));`)),
    ).toEqual(["createdAt"]);
    expect(kinds(scanSource("b.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, createdAt }));`))).toEqual([
      "createdAt",
    ]);
    expect(kinds(scanSource("c.ts", `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...row, "created_at": d }));`))).toEqual([
      "createdAt",
    ]);
  });

  it("flags createdAt in ON CONFLICT DO UPDATE SET (it must keep the first insert's value)", () => {
    const r = scanSource(
      "set.ts",
      `withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row).onConflictDoUpdate({ target: jobs.externalId, set: { title: row.title, createdAt: sql\`now()\` } }));`,
    );
    expect(kinds(r)).toEqual(["createdAt"]);
  });

  it("looks through a variable passed to values() or spread into it", () => {
    expect(
      kinds(
        scanSource(
          "v.ts",
          `const row = { ...mapped, createdAt: new Date() };
          await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row));`,
        ),
      ),
    ).toEqual(["createdAt"]);
    expect(
      kinds(
        scanSource(
          "s.ts",
          `const stamp = { createdAt: new Date() };
          await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values({ ...mapped, ...stamp }));`,
        ),
      ),
    ).toEqual(["createdAt"]);
  });

  it("flags an insert outside a bounded transaction", () => {
    const r = scanSource("u.ts", `await db.insert(jobs).values(row).onConflictDoNothing();`);
    expect(r.inserts).toHaveLength(1);
    expect(kinds(r)).toEqual(["unbounded"]);
    // A plain db.transaction is not enough: it has no timeouts.
    expect(kinds(scanSource("t.ts", `await db.transaction(async (tx) => { await tx.insert(jobs).values(row); });`))).toEqual([
      "unbounded",
    ]);
  });

  it("flags an await inside the transaction's callback or a JobsInsertTx builder (the transaction would sit idle)", () => {
    expect(
      kinds(
        scanSource(
          "aw.ts",
          `await withBoundedJobsInsert(db, async (tx) => {
            const coords = await geocodeLocation(loc);
            return tx.insert(jobs).values({ ...mapped, ...coords });
          });`,
        ),
      ),
    ).toEqual(["await"]);
    expect(
      kinds(
        scanSource(
          "awb.ts",
          `async function build(tx: JobsInsertTx) { await sleep(1); return tx.insert(jobs).values(row); }`,
        ),
      ),
    ).toEqual(["await"]);
    // Control: awaiting the helper itself, or awaiting inside a function nested in the values, is fine.
    expect(
      kinds(scanSource("aw-ok.ts", `await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(rows.map((r) => ({ ...r }))));`)),
    ).toEqual([]);
  });

  it("follows an aliased import and schema.jobs", () => {
    const r = scanSource(
      "alias.ts",
      `import { jobs as jobsTable } from "@ever-hust/db";
      await db.insert(jobsTable).values({ ...row, createdAt: new Date() });
      await db.insert(schema.jobs).values(row);`,
    );
    expect(r.inserts).toHaveLength(2);
    expect(kinds(r)).toEqual(["createdAt", "unbounded", "unbounded"]);
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

  it("every INSERT into jobs is bounded (no await inside), never passes createdAt, and none is raw SQL", () => {
    expect(violations).toEqual([]);
  });
});
