/**
 * In-memory stand-in for the `referrals` and `referral_credits` tables, used by the referral
 * route tests, which mock `@ever-hust/db` and `drizzle-orm` with the exports below. It answers
 * the query shapes those routes use and, like Postgres, refuses a second row with the same
 * `referral_code` (and a second credits row for the same user).
 */
type Row = Record<string, unknown>;
type Column = { table: string; column: string };
type Table = { _name: "referrals" | "referralCredits" } & Record<string, unknown>;
type SqlChunk = { op: "sql"; strings: string[]; values: unknown[] };
type Cond = { op: "eq"; col: Column; val: unknown } | { op: "and"; conds: Cond[] };

function table(name: Table["_name"], columns: string[]): Table {
  const t: Table = { _name: name };
  for (const column of columns) t[column] = { table: name, column };
  return t;
}

export const referrals = table("referrals", [
  "id",
  "referrerId",
  "referredUserId",
  "referralCode",
  "referredEmail",
  "status",
  "creditAmount",
  "createdAt",
  "updatedAt",
  "completedAt",
]);

export const referralCredits = table("referralCredits", [
  "id",
  "userId",
  "balance",
  "totalEarned",
  "totalSpent",
  "updatedAt",
]);

/** Replacement for the parts of `drizzle-orm` the referral routes import. */
export const drizzleOrm = {
  eq: (col: Column, val: unknown): Cond => ({ op: "eq", col, val }),
  and: (...conds: Cond[]): Cond => ({ op: "and", conds }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]): SqlChunk => ({
    op: "sql",
    strings: [...strings],
    values,
  }),
};

function matches(row: Row, cond?: Cond): boolean {
  if (!cond) return true;
  if (cond.op === "and") return cond.conds.every((c) => matches(row, c));
  return row[cond.col.column] === cond.val;
}

function project(row: Row, projection?: Record<string, Column>): Row {
  if (!projection) return { ...row };
  const out: Row = {};
  for (const [key, col] of Object.entries(projection)) out[key] = row[col.column];
  return out;
}

/** Applies a SET value; supports plain values and `sql\`${column} + ${n}\``. */
function setValue(row: Row, value: unknown): unknown {
  const chunk = value as SqlChunk | undefined;
  if (chunk && typeof chunk === "object" && chunk.op === "sql") {
    const [col, amount] = chunk.values as [Column, number];
    return (row[col.column] as number) + amount;
  }
  return value;
}

/** A lazy thenable: the query runs only when awaited, like a drizzle query builder. */
function lazy<T>(run: () => T) {
  return {
    then<R1 = T, R2 = never>(
      onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): Promise<R1 | R2> {
      return new Promise<T>((resolve) => resolve(run())).then(onFulfilled, onRejected);
    },
  };
}

export class FakeReferralsDb {
  referralRows: Row[] = [];
  creditRows: Row[] = [];
  /** Every statement in order, e.g. "select referrals", "insert referrals", "execute". */
  log: { kind: string; table?: string; detail?: unknown }[] = [];
  private nextId = 1;

  private rows(t: Table): Row[] {
    return t._name === "referrals" ? this.referralRows : this.creditRows;
  }

  seedReferral(row: Row): void {
    this.referralRows.push({
      id: this.nextId++,
      referredUserId: null,
      referredEmail: null,
      status: "pending",
      creditAmount: 0,
      completedAt: null,
      ...row,
    });
  }

  seedCredits(row: Row): void {
    this.creditRows.push({ id: this.nextId++, balance: 0, totalEarned: 0, totalSpent: 0, ...row });
  }

  select = (projection?: Record<string, Column>) => ({
    from: (t: Table) => {
      const run = (cond?: Cond) => {
        this.log.push({ kind: "select", table: t._name, detail: cond });
        return this.rows(t)
          .filter((r) => matches(r, cond))
          .map((r) => project(r, projection));
      };
      const query = (cond?: Cond) => ({
        ...lazy(() => run(cond)),
        limit: (n: number) => lazy(() => run(cond).slice(0, n)),
      });
      return { ...query(), where: (cond: Cond) => query(cond) };
    },
  });

  insert = (t: Table) => ({
    values: (values: Row) => {
      const run = (onConflictDoNothing: boolean) => {
        this.log.push({ kind: "insert", table: t._name, detail: values });
        const rows = this.rows(t);
        const uniqueKey = t._name === "referrals" ? "referralCode" : "userId";
        if (rows.some((r) => r[uniqueKey] === values[uniqueKey])) {
          if (onConflictDoNothing) return [];
          throw new Error(
            `duplicate key value violates unique constraint "${t._name}_${uniqueKey}_unique"`,
          );
        }
        if (t._name === "referrals") this.seedReferral(values);
        else this.seedCredits(values);
        return [rows[rows.length - 1]];
      };
      return {
        ...lazy(() => run(false)),
        onConflictDoNothing: () => lazy(() => run(true)),
      };
    },
  });

  update = (t: Table) => ({
    set: (set: Row) => ({
      where: (cond: Cond) => {
        const run = () => {
          this.log.push({ kind: "update", table: t._name, detail: set });
          const hit = this.rows(t).filter((r) => matches(r, cond));
          for (const row of hit) {
            for (const [key, value] of Object.entries(set)) row[key] = setValue(row, value);
          }
          return hit;
        };
        return {
          ...lazy(run),
          returning: (projection?: Record<string, Column>) =>
            lazy(() => run().map((r) => project(r, projection))),
        };
      },
    }),
  });

  execute = async (query: unknown) => {
    this.log.push({ kind: "execute", detail: query });
    return [];
  };

  transaction = async <T>(fn: (tx: FakeReferralsDb) => Promise<T>): Promise<T> => fn(this);
}

/** The db the mocked module serves; call `resetFakeDb()` in `beforeEach` for a fresh one. */
let fakeDb = new FakeReferralsDb();

export function resetFakeDb(): FakeReferralsDb {
  fakeDb = new FakeReferralsDb();
  return fakeDb;
}

/** Replacement for `@ever-hust/db`: routes reach the current `fakeDb` through it. */
export const everHustDb = {
  db: {
    select: (...a: Parameters<FakeReferralsDb["select"]>) => fakeDb.select(...a),
    insert: (...a: Parameters<FakeReferralsDb["insert"]>) => fakeDb.insert(...a),
    update: (...a: Parameters<FakeReferralsDb["update"]>) => fakeDb.update(...a),
    execute: (...a: Parameters<FakeReferralsDb["execute"]>) => fakeDb.execute(...a),
    transaction: <T>(fn: (tx: FakeReferralsDb) => Promise<T>) => fakeDb.transaction(fn),
  },
  referrals,
  referralCredits,
};
