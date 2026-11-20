/**
 * DELETE /api/user/account: organizations.created_by_id is ON DELETE CASCADE, so deleting the
 * account of an organization's creator used to delete the organization with all of its members,
 * invitations, AI config and branding. The route now hands created_by_id to another member
 * first, refuses with 409 while the user is the last owner of an organization other members
 * still use, and lets an organization the user is alone in go with the account, as before.
 *
 * The db below is an in-memory stand-in that answers the route's query shapes and, like
 * Postgres, cascades a user delete to the organizations they created and to their memberships.
 * Its SELECT ... FOR UPDATE takes row locks that a transaction holds until it ends, so two
 * deletes can run at once and wait on each other the way they do on Postgres.
 */
type Row = Record<string, unknown>;
type Column = { table: string; column: string };
type Table = {
  _name: "users" | "organizations" | "organizationMembers";
} & Record<string, unknown>;
type Cond =
  | { op: "eq" | "ne"; col: Column; val: unknown }
  | { op: "inArray"; col: Column; vals: unknown[] }
  | { op: "and"; conds: Cond[] };

function mockTable(name: Table["_name"], columns: string[]): Table {
  const t: Table = { _name: name };
  for (const column of columns) t[column] = { table: name, column };
  return t;
}

const mockUsers = mockTable("users", ["id", "stripeCustomerId"]);
const mockOrganizations = mockTable("organizations", [
  "id",
  "name",
  "createdById",
  "updatedAt",
]);
const mockMembers = mockTable("organizationMembers", [
  "id",
  "organizationId",
  "userId",
  "role",
  "joinedAt",
]);

const mockState = {
  users: [] as Row[],
  organizations: [] as Row[],
  organizationMembers: [] as Row[],
  /** Every write in order, e.g. "tx update organizations"; "tx " marks a write in a transaction. */
  writes: [] as string[],
  /** Every statement in order, e.g. "select organizations where id in (1) order by id for update". */
  statements: [] as string[],
  /** Row locks in the order they were taken, e.g. "organizations 2". */
  locked: [] as string[],
  /** Who calls DELETE, one entry per call; "user-a" once the list is empty. */
  sessionUsers: [] as string[],
  /** Row lock ("organizations 2") -> the transaction holding it and a promise that settles when it ends. */
  rowLocks: new Map<string, { tx: number; ended: Promise<void> }>(),
  transactions: 0,
};

function mockMatches(row: Row, cond?: Cond): boolean {
  if (!cond) return true;
  switch (cond.op) {
    case "and":
      return cond.conds.every((c) => mockMatches(row, c));
    case "eq":
      return row[cond.col.column] === cond.val;
    case "ne":
      return row[cond.col.column] !== cond.val;
    case "inArray":
      return cond.vals.includes(row[cond.col.column]);
  }
}

/** The statement's WHERE as text, e.g. "userId = user-a and role = owner". */
function mockDescribe(cond: Cond): string {
  switch (cond.op) {
    case "and":
      return cond.conds.map(mockDescribe).join(" and ");
    case "eq":
      return `${cond.col.column} = ${String(cond.val)}`;
    case "ne":
      return `${cond.col.column} != ${String(cond.val)}`;
    case "inArray":
      return `${cond.col.column} in (${cond.vals.join(", ")})`;
  }
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

/**
 * Takes a row lock for `tx`, waiting while another transaction holds it, like Postgres.
 * The lock is held until `tx` ends.
 */
async function mockLockRow(tx: MockTx, key: string) {
  for (
    let held = mockState.rowLocks.get(key);
    held && held.tx !== tx.id;
    held = mockState.rowLocks.get(key)
  ) {
    await held.ended;
  }
  if (mockState.rowLocks.has(key)) return;
  mockState.rowLocks.set(key, { tx: tx.id, ended: tx.ended });
  mockState.locked.push(key);
}

/** The query builder, bound to a transaction or (tx null) to no transaction. */
function mockMakeDb(tx: MockTx | null) {
  const run = <T>(sql: string, fn: () => T | Promise<T>) =>
    mockLazy(() => {
      mockState.statements.push(sql);
      return fn();
    });
  const write = (what: string) =>
    mockState.writes.push(`${tx ? "tx " : ""}${what}`);

  return {
    select: (projection: Record<string, Column>) => ({
      from: (t: Table) => ({
        where: (cond: Cond) => {
          const project = (rows: Row[]) =>
            rows.map((r) => {
              const out: Row = {};
              for (const [key, col] of Object.entries(projection))
                out[key] = r[col.column];
              return out;
            });
          const query = (sql: string, rows: () => Row[]) => ({
            ...run(sql, () => project(rows())),
            limit: (n: number) =>
              run(`${sql} limit ${n}`, () => project(rows().slice(0, n))),
            for: (strength: string) =>
              run(`${sql} for ${strength}`, async () => {
                const locked: Row[] = [];
                for (const row of rows()) {
                  if (tx) await mockLockRow(tx, `${t._name} ${String(row.id)}`);
                  // Like Postgres, skip a row another transaction deleted or changed meanwhile.
                  if (mockState[t._name].includes(row) && mockMatches(row, cond))
                    locked.push(row);
                }
                return project(locked);
              }),
          });
          const matching = () =>
            mockState[t._name].filter((r) => mockMatches(r, cond));
          return {
            ...query(`select ${t._name} where ${mockDescribe(cond)}`, matching),
            orderBy: (col: Column) =>
              query(
                `select ${t._name} where ${mockDescribe(cond)} order by ${col.column}`,
                () =>
                  [...matching()].sort(
                    (a, b) => Number(a[col.column]) - Number(b[col.column]),
                  ),
              ),
          };
        },
      }),
    }),
    update: (t: Table) => ({
      set: (values: Row) => ({
        where: (cond: Cond) =>
          run(`update ${t._name} where ${mockDescribe(cond)}`, () => {
            write(`update ${t._name}`);
            for (const row of mockState[t._name].filter((r) =>
              mockMatches(r, cond),
            )) {
              Object.assign(row, values);
            }
          }),
      }),
    }),
    delete: (t: Table) => ({
      where: (cond: Cond) =>
        run(`delete ${t._name} where ${mockDescribe(cond)}`, () => {
          write(`delete ${t._name}`);
          const removed = mockState[t._name].filter((r) => mockMatches(r, cond));
          mockState[t._name] = mockState[t._name].filter(
            (r) => !removed.includes(r),
          );
          if (t._name !== "users") return;
          // ON DELETE CASCADE: organizations.created_by_id and organization_members.user_id.
          for (const user of removed) {
            const goneOrgIds = mockState.organizations
              .filter((o) => o.createdById === user.id)
              .map((o) => o.id);
            mockState.organizations = mockState.organizations.filter(
              (o) => !goneOrgIds.includes(o.id),
            );
            mockState.organizationMembers = mockState.organizationMembers.filter(
              (m) =>
                !goneOrgIds.includes(m.organizationId) && m.userId !== user.id,
            );
          }
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
      // Commit or rollback releases the transaction's row locks.
      for (const [key, held] of mockState.rowLocks) {
        if (held.tx === tx.id) mockState.rowLocks.delete(key);
      }
      end();
    }
  },
};

jest.mock("@ever-hust/db", () => ({
  db: mockDb,
  users: mockUsers,
  organizations: mockOrganizations,
  organizationMembers: mockMembers,
}));
jest.mock("drizzle-orm", () => ({
  eq: (col: Column, val: unknown) => ({ op: "eq", col, val }),
  ne: (col: Column, val: unknown) => ({ op: "ne", col, val }),
  inArray: (col: Column, vals: unknown[]) => ({ op: "inArray", col, vals }),
  and: (...conds: Cond[]) => ({ op: "and", conds }),
}));
jest.mock("../get-session-user", () => ({
  requireSessionUser: async () => ({
    id: mockState.sessionUsers.shift() ?? "user-a",
  }),
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));
/** Each call records the user id and which users still existed at that moment. */
const mockStorageCleanups: { userId: string; usersLeft: unknown[] }[] = [];
jest.mock("@ever-hust/supabase/storage", () => ({
  deleteUserFiles: async (userId: string) => {
    mockStorageCleanups.push({
      userId,
      usersLeft: mockState.users.map((u) => u.id),
    });
  },
}));

import { DELETE } from "../../app/api/user/account/route";

const day = (d: number) => new Date(Date.UTC(2026, 0, d));
let nextMemberId = 1;

function member(
  organizationId: number,
  userId: string,
  role: string,
  joinedAt: Date,
): Row {
  return { id: nextMemberId++, organizationId, userId, role, joinedAt };
}

function seed(organizations: Row[], members: Row[]) {
  const userIds = new Set([
    "user-a",
    ...members.map((m) => m.userId as string),
  ]);
  mockState.users = [...userIds].map((id) => ({ id, stripeCustomerId: null }));
  mockState.organizations = organizations.map((o) => ({
    updatedAt: day(1),
    ...o,
  }));
  mockState.organizationMembers = members;
  mockState.writes = [];
  mockState.statements = [];
  mockState.locked = [];
  mockState.sessionUsers = [];
  mockStorageCleanups.length = 0;
}

const userIds = () => mockState.users.map((u) => u.id);
const org = (id: number) => mockState.organizations.find((o) => o.id === id);
const memberIds = (organizationId: number) =>
  mockState.organizationMembers
    .filter((m) => m.organizationId === organizationId)
    .map((m) => m.userId);

describe("DELETE /api/user/account and the organizations the user created", () => {
  it("moves created_by_id to the other owner before deleting the creator who is a co-owner", async () => {
    seed(
      [{ id: 1, name: "Acme", createdById: "user-a" }],
      [
        member(1, "user-a", "owner", day(1)),
        member(1, "user-d", "admin", day(2)),
        member(1, "user-c", "member", day(3)),
        member(1, "user-b", "owner", day(10)),
      ],
    );

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(userIds()).not.toContain("user-a");
    // The org survives, an owner (not the longer-standing admin) became its creator.
    expect(org(1)).toMatchObject({ name: "Acme", createdById: "user-b" });
    expect(memberIds(1)).toEqual(["user-d", "user-c", "user-b"]);
    // Both writes in one transaction, the hand-over first.
    expect(mockState.writes).toEqual([
      "tx update organizations",
      "tx delete users",
    ]);
  });

  it("answers 409 and deletes nothing when the user is the last owner and other members exist", async () => {
    seed(
      [{ id: 1, name: "Acme", createdById: "user-a" }],
      [
        member(1, "user-a", "owner", day(1)),
        member(1, "user-c", "member", day(2)),
      ],
    );

    const res = await DELETE();

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("Transfer ownership first");
    expect(body.details).toEqual({ organizationIds: [1] });
    expect(userIds()).toContain("user-a");
    expect(org(1)).toMatchObject({ createdById: "user-a" });
    expect(memberIds(1)).toEqual(["user-a", "user-c"]);
    expect(mockState.writes).toEqual([]);
  });

  it("deletes the account, and the organization with it, when the user is its only member", async () => {
    seed(
      [{ id: 1, name: "Solo", createdById: "user-a" }],
      [member(1, "user-a", "owner", day(1))],
    );

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(userIds()).not.toContain("user-a");
    expect(mockState.organizations).toEqual([]);
    expect(mockState.organizationMembers).toEqual([]);
  });

  it("answers 409 when the user is the last owner of an organization someone else created", async () => {
    seed(
      [{ id: 2, name: "Beta", createdById: "user-x" }],
      [
        member(2, "user-x", "member", day(1)),
        member(2, "user-a", "owner", day(2)),
      ],
    );

    const res = await DELETE();

    expect(res.status).toBe(409);
    expect(userIds()).toContain("user-a");
    expect(memberIds(2)).toEqual(["user-x", "user-a"]);
    expect(mockState.writes).toEqual([]);
  });

  it("keeps the organization when its creator already left it", async () => {
    seed(
      [{ id: 3, name: "Gamma", createdById: "user-a" }],
      [member(3, "user-b", "owner", day(5))],
    );

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(org(3)).toMatchObject({ createdById: "user-b" });
    expect(memberIds(3)).toEqual(["user-b"]);
  });

  it("hands an organization without another owner to its longest-standing admin", async () => {
    // An org left without an owner, e.g. by an account deleted before this fix.
    seed(
      [{ id: 4, name: "Delta", createdById: "user-a" }],
      [
        member(4, "user-a", "member", day(1)),
        member(4, "user-m", "member", day(2)),
        member(4, "user-e2", "admin", day(5)),
        member(4, "user-e1", "admin", day(3)),
      ],
    );

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(org(4)).toMatchObject({ createdById: "user-e1" });
    expect(memberIds(4)).toEqual(["user-m", "user-e2", "user-e1"]);
  });
});

describe("DELETE /api/user/account while other members delete their accounts", () => {
  it("locks every organization the user is in or created, in id order, before it reads owners and members", async () => {
    seed(
      [
        { id: 5, name: "Owned", createdById: "user-a" },
        { id: 2, name: "Admin of", createdById: "user-x" },
        { id: 9, name: "Not in it", createdById: "user-w" },
        { id: 7, name: "Created, then left", createdById: "user-a" },
        { id: 3, name: "Member of", createdById: "user-y" },
      ],
      [
        member(5, "user-a", "owner", day(1)),
        member(5, "user-b", "owner", day(2)),
        member(2, "user-x", "owner", day(1)),
        member(2, "user-a", "admin", day(2)),
        member(9, "user-w", "owner", day(1)),
        member(7, "user-z", "owner", day(3)),
        member(3, "user-y", "owner", day(1)),
        member(3, "user-a", "member", day(4)),
      ],
    );

    const res = await DELETE();

    expect(res.status).toBe(204);
    // One SELECT ... FOR UPDATE on organizations, ordered by id.
    const locks = mockState.statements.filter((s) => s.endsWith(" for update"));
    expect(locks).toEqual([
      expect.stringMatching(
        /^select organizations where id in \([\d, ]+\) order by id for update$/,
      ),
    ]);
    // It locks the organizations the user owns, administers, is a member of or created, and
    // nothing else, in id order whatever order the rows are stored in, so two deletes that
    // share organizations take their locks in the same order and can't deadlock.
    expect(mockState.locked).toEqual([
      "organizations 2",
      "organizations 3",
      "organizations 5",
      "organizations 7",
    ]);
    // Only reads that find the user's organizations run before the lock. The owners, the
    // organizations the user created and the other members are read after it, so they see
    // what a concurrent delete committed while this one waited.
    const lockAt = mockState.statements.indexOf(locks[0]!);
    expect(
      mockState.statements
        .slice(0, lockAt)
        .filter((s) => !s.startsWith("select ") || /role = owner|userId != /.test(s)),
    ).toEqual([]);
    expect(mockState.statements.slice(lockAt + 1)).toEqual(
      expect.arrayContaining([
        "select organizationMembers where userId = user-a and role = owner",
        "select organizations where createdById = user-a",
        expect.stringMatching(
          /^select organizationMembers where organizationId in \([\d, ]+\) and userId != user-a$/,
        ),
      ]),
    );
    expect(org(5)).toMatchObject({ createdById: "user-b" });
    expect(org(7)).toMatchObject({ createdById: "user-z" });
    expect(memberIds(2)).toEqual(["user-x"]);
    expect(memberIds(3)).toEqual(["user-y"]);
  });

  it("keeps the organization when two of its owners delete their accounts at the same moment", async () => {
    seed(
      [{ id: 1, name: "Acme", createdById: "user-a" }],
      [
        member(1, "user-a", "owner", day(1)),
        member(1, "user-b", "owner", day(2)),
        member(1, "user-c", "member", day(3)),
        member(1, "user-d", "admin", day(4)),
      ],
    );
    mockState.sessionUsers = ["user-a", "user-b"];

    const [resA, resB] = await Promise.all([DELETE(), DELETE()]);

    // a's delete hands the organization to b. b's delete waits for a's lock, then finds b is
    // now its last owner, so it answers 409 instead of cascading the organization away.
    expect(resA.status).toBe(204);
    expect(resB.status).toBe(409);
    expect((await resB.json()).details).toEqual({ organizationIds: [1] });
    expect(userIds()).toEqual(["user-b", "user-c", "user-d"]);
    expect(org(1)).toMatchObject({ name: "Acme", createdById: "user-b" });
    expect(memberIds(1)).toEqual(["user-b", "user-c", "user-d"]);
  });

  it("hands the organization on when its successor deletes their account at the same moment", async () => {
    // An organization without an owner goes to its longest-standing admin.
    seed(
      [{ id: 4, name: "Delta", createdById: "user-a" }],
      [
        member(4, "user-a", "member", day(1)),
        member(4, "user-m", "member", day(2)),
        member(4, "user-e1", "admin", day(3)),
      ],
    );
    mockState.sessionUsers = ["user-a", "user-e1"];

    const [resA, resE1] = await Promise.all([DELETE(), DELETE()]);

    // a's delete hands the organization to e1. e1's delete waits for a's lock, then sees it
    // created the organization now and hands it on to m before e1 goes.
    expect(resA.status).toBe(204);
    expect(resE1.status).toBe(204);
    expect(userIds()).toEqual(["user-m"]);
    expect(org(4)).toMatchObject({ name: "Delta", createdById: "user-m" });
    expect(memberIds(4)).toEqual(["user-m"]);
  });
});

describe("DELETE /api/user/account and the files the user uploaded", () => {
  it("removes the user's CVs and avatar from Storage once, after the user row is gone", async () => {
    seed([], []);

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(mockStorageCleanups).toEqual([
      { userId: "user-a", usersLeft: [] },
    ]);
  });

  it("keeps the files when the delete is refused with 409", async () => {
    seed(
      [{ id: 1, name: "Acme", createdById: "user-a" }],
      [
        member(1, "user-a", "owner", day(1)),
        member(1, "user-c", "member", day(2)),
      ],
    );

    const res = await DELETE();

    expect(res.status).toBe(409);
    expect(mockStorageCleanups).toEqual([]);
  });

  it("removes only the files of the account that was deleted when two owners delete at once", async () => {
    seed(
      [{ id: 1, name: "Acme", createdById: "user-a" }],
      [
        member(1, "user-a", "owner", day(1)),
        member(1, "user-b", "owner", day(2)),
        member(1, "user-c", "member", day(3)),
      ],
    );
    mockState.sessionUsers = ["user-a", "user-b"];

    const [resA, resB] = await Promise.all([DELETE(), DELETE()]);

    expect(resA.status).toBe(204);
    expect(resB.status).toBe(409);
    expect(mockStorageCleanups.map((c) => c.userId)).toEqual(["user-a"]);
  });
});
