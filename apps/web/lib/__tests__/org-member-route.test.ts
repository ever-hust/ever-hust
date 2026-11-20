/**
 * PATCH and DELETE /api/organizations/[orgId]/members/[userId]: the last-owner check used to
 * read the owners without a lock, so two owners demoting or removing each other at the same
 * moment both counted two owners, both passed, and the organization was left with none. Both
 * routes now lock the organization row first (SELECT ... FOR UPDATE, like DELETE
 * /api/user/account) and re-read the caller's role and the owners under that lock.
 *
 * The db below is an in-memory stand-in that answers the route's query shapes. Its
 * SELECT ... FOR UPDATE takes row locks that a transaction holds until it ends, so two requests
 * can run at once and wait on each other the way they do on Postgres.
 */
type Row = Record<string, unknown>;
type Column = { table: string; column: string };
type TableName = "organizations" | "organizationMembers";
type Table = { _name: TableName } & Record<string, unknown>;
type Cond =
  | { op: "eq"; col: Column; val: unknown }
  | { op: "and"; conds: Cond[] };

function mockTable(name: TableName, columns: string[]): Table {
  const t: Table = { _name: name };
  for (const column of columns) t[column] = { table: name, column };
  return t;
}

const mockOrganizations = mockTable("organizations", ["id", "name"]);
const mockMembers = mockTable("organizationMembers", [
  "id",
  "organizationId",
  "userId",
  "role",
]);

const mockState = {
  organizations: [] as Row[],
  organizationMembers: [] as Row[],
  /** Every statement in order, e.g. "tx1 select organizations for update". */
  statements: [] as string[],
  /** Who calls the route, one entry per call. */
  sessionUsers: [] as string[],
  rowLocks: new Map<string, { tx: number; ended: Promise<void> }>(),
  transactions: 0,
  /** A caller whose request pauses right after requireOrgRole until the promise settles. */
  gates: new Map<string, Promise<void>>(),
};

function mockMatches(row: Row, cond?: Cond): boolean {
  if (!cond) return true;
  if (cond.op === "and") return cond.conds.every((c) => mockMatches(row, c));
  return row[cond.col.column] === cond.val;
}

/** A lazy thenable: the statement runs only when awaited, like a drizzle query builder. */
function mockLazy<T>(run: () => T | Promise<T>) {
  return {
    then<R1 = T, R2 = never>(
      onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): Promise<R1 | R2> {
      return new Promise<T>((resolve) => resolve(run())).then(
        onFulfilled,
        onRejected,
      );
    },
  };
}

type MockTx = { id: number; ended: Promise<void> };

async function mockLockRow(tx: MockTx, key: string) {
  for (
    let held = mockState.rowLocks.get(key);
    held && held.tx !== tx.id;
    held = mockState.rowLocks.get(key)
  ) {
    await held.ended;
  }
  if (!mockState.rowLocks.has(key)) {
    mockState.rowLocks.set(key, { tx: tx.id, ended: tx.ended });
  }
}

function mockMakeDb(tx: MockTx | null) {
  const label = tx ? `tx${tx.id} ` : "";
  const run = <T>(sql: string, fn: () => T | Promise<T>) =>
    mockLazy(() => {
      mockState.statements.push(`${label}${sql}`);
      return fn();
    });
  const project = (projection: Record<string, Column>, rows: Row[]) =>
    rows.map((r) => {
      const out: Row = {};
      for (const [key, col] of Object.entries(projection))
        out[key] = r[col.column];
      return out;
    });

  return {
    select: (projection: Record<string, Column>) => ({
      from: (t: Table) => ({
        where: (cond: Cond) => {
          const matching = () =>
            mockState[t._name].filter((r) => mockMatches(r, cond));
          return {
            ...run(`select ${t._name}`, () => project(projection, matching())),
            limit: (n: number) =>
              run(`select ${t._name}`, () =>
                project(projection, matching().slice(0, n)),
              ),
            for: (strength: string) =>
              run(`select ${t._name} for ${strength}`, async () => {
                const locked: Row[] = [];
                for (const row of matching()) {
                  if (tx) await mockLockRow(tx, `${t._name} ${String(row.id)}`);
                  if (mockState[t._name].includes(row) && mockMatches(row, cond))
                    locked.push(row);
                }
                return project(projection, locked);
              }),
          };
        },
      }),
    }),
    update: (t: Table) => ({
      set: (values: Row) => ({
        where: (cond: Cond) => {
          const apply = () => {
            const rows = mockState[t._name].filter((r) => mockMatches(r, cond));
            for (const row of rows) Object.assign(row, values);
            return rows.map((r) => ({ ...r }));
          };
          return {
            ...run(`update ${t._name}`, () => void apply()),
            returning: () => run(`update ${t._name}`, apply),
          };
        },
      }),
    }),
    delete: (t: Table) => ({
      where: (cond: Cond) =>
        run(`delete ${t._name}`, () => {
          mockState[t._name] = mockState[t._name].filter(
            (r) => !mockMatches(r, cond),
          );
        }),
    }),
  };
}

const mockDb = {
  ...mockMakeDb(null),
  transaction: async <T>(fn: (tx: object) => Promise<T>): Promise<T> => {
    let end: () => void = () => undefined;
    const ended = new Promise<void>((resolve) => {
      end = () => resolve();
    });
    const tx: MockTx = { id: ++mockState.transactions, ended };
    try {
      return await fn(mockMakeDb(tx));
    } finally {
      for (const [key, held] of mockState.rowLocks) {
        if (held.tx === tx.id) mockState.rowLocks.delete(key);
      }
      end();
    }
  },
};

jest.mock("@ever-hust/db", () => ({ db: mockDb }));
jest.mock("@ever-hust/db/schema", () => ({
  organizations: mockOrganizations,
  organizationMembers: mockMembers,
}));
jest.mock("drizzle-orm", () => ({
  eq: (col: Column, val: unknown) => ({ op: "eq", col, val }),
  and: (...conds: Cond[]) => ({ op: "and", conds }),
}));
// requireOrgRole checks the caller's role before the route's transaction, as the real one does.
jest.mock("../auth-org", () => ({
  requireOrgRole: async (orgId: number, ...roles: string[]) => {
    const userId = mockState.sessionUsers.shift() ?? "user-a";
    const membership = mockState.organizationMembers.find(
      (m) => m.organizationId === orgId && m.userId === userId,
    );
    if (!membership || !roles.includes(membership.role as string)) {
      throw new Response(null, { status: 403 });
    }
    const orgRole = membership.role;
    await mockState.gates.get(userId);
    return { user: { id: userId }, orgRole };
  },
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));

import {
  DELETE,
  PATCH,
} from "../../app/api/organizations/[orgId]/members/[userId]/route";

let nextMemberId = 1;
function member(userId: string, role: string): Row {
  return { id: nextMemberId++, organizationId: 1, userId, role };
}

function seed(members: Row[]) {
  mockState.organizations = [{ id: 1, name: "Acme" }];
  mockState.organizationMembers = members;
  mockState.statements = [];
  mockState.sessionUsers = [];
  mockState.gates.clear();
}

/** Pauses `userId`'s next request after its role check until the returned function is called. */
function holdAfterRoleCheck(userId: string): () => void {
  let release: () => void = () => undefined;
  mockState.gates.set(
    userId,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  return release;
}

const context = (userId: string) => ({
  params: Promise.resolve({ orgId: "1", userId }),
});

/** `caller` changes `target`'s role. */
function patch(caller: string, target: string, role: string) {
  mockState.sessionUsers.push(caller);
  return PATCH(
    new Request(`http://localhost/api/organizations/1/members/${target}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }),
    context(target),
  );
}

/** `caller` removes `target` (themself, to leave). */
function remove(caller: string, target: string) {
  mockState.sessionUsers.push(caller);
  return DELETE(
    new Request(`http://localhost/api/organizations/1/members/${target}`, {
      method: "DELETE",
    }),
    context(target),
  );
}

const owners = () =>
  mockState.organizationMembers
    .filter((m) => m.role === "owner")
    .map((m) => m.userId);

describe("organization member routes and the last owner", () => {
  it("two owners demoting each other at once: one goes through, the other is refused", async () => {
    seed([member("user-a", "owner"), member("user-b", "owner")]);

    const [ab, ba] = await Promise.all([
      patch("user-a", "user-b", "member"),
      patch("user-b", "user-a", "member"),
    ]);

    // The second one runs after the first under the lock: its caller has just been demoted to
    // member (403), or, the other way round, the same. Never both.
    const ok = [ab.status, ba.status].filter((s) => s < 300);
    expect(ok).toEqual([200]);
    expect([ab.status, ba.status]).toContain(403);
    expect(owners()).toHaveLength(1);
  });

  it("two owners leaving at once: one leaves, the other stays as the owner", async () => {
    seed([
      member("user-a", "owner"),
      member("user-b", "owner"),
      member("user-c", "member"),
    ]);

    const [a, b] = await Promise.all([
      remove("user-a", "user-a"),
      remove("user-b", "user-b"),
    ]);

    expect([a.status, b.status].sort()).toEqual([204, 400]);
    expect(owners()).toHaveLength(1);
  });

  it("an owner removing the other owner while being demoted by them: never zero owners", async () => {
    seed([member("user-a", "owner"), member("user-b", "owner")]);

    const [removeB, demoteA] = await Promise.all([
      remove("user-a", "user-b"),
      patch("user-b", "user-a", "admin"),
    ]);

    // Whichever runs second finds its caller or its target changed and is refused.
    const ok = [removeB.status, demoteA.status].filter((s) => s < 300);
    expect(ok).toHaveLength(1);
    expect(owners()).toHaveLength(1);
  });

  it("re-reads the caller's role under the lock: a just-demoted owner can't change an admin", async () => {
    seed([
      member("user-a", "owner"),
      member("user-b", "owner"),
      member("user-c", "admin"),
    ]);

    // user-a passes requireOrgRole as an owner, then user-b demotes user-a before user-a's
    // transaction starts.
    const release = holdAfterRoleCheck("user-a");
    const demoteC = patch("user-a", "user-c", "member");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const demoteA = await patch("user-b", "user-a", "admin");
    release();

    expect(demoteA.status).toBe(200);
    // Runs as the admin user-a now is: only owners can change an admin.
    expect((await demoteC).status).toBe(400);
    expect(
      mockState.organizationMembers.find((m) => m.userId === "user-c")?.role,
    ).toBe("admin");
  });

  it("locks the organization row before reading any member", async () => {
    seed([member("user-a", "owner"), member("user-b", "owner")]);

    const res = await remove("user-a", "user-b");

    expect(res.status).toBe(204);
    const txStatements = mockState.statements.filter((s) => s.startsWith("tx"));
    expect(txStatements[0]).toMatch(/^tx\d+ select organizations for update$/);
    expect(txStatements.slice(1).some((s) => s.includes("organizationMembers"))).toBe(
      true,
    );
  });

  it("still refuses to demote or remove the only owner", async () => {
    seed([member("user-a", "owner"), member("user-b", "admin")]);

    expect((await patch("user-a", "user-a", "admin")).status).toBe(400);
    expect((await remove("user-a", "user-a")).status).toBe(400);
    expect(owners()).toEqual(["user-a"]);
  });

  it("answers 404 for a member who is not in the organization", async () => {
    seed([member("user-a", "owner")]);

    expect((await remove("user-a", "user-z")).status).toBe(404);
  });
});
