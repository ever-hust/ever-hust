/**
 * DELETE /api/user/account: organizations.created_by_id is ON DELETE CASCADE, so deleting the
 * account of an organization's creator used to delete the organization with all of its members,
 * invitations, AI config and branding. The route now hands created_by_id to another member
 * first, refuses with 409 while the user is the last owner of an organization other members
 * still use, and lets an organization the user is alone in go with the account, as before.
 *
 * The db below is an in-memory stand-in that answers the route's query shapes and, like
 * Postgres, cascades a user delete to the organizations they created and to their memberships.
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
  inTransaction: false,
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

/** A lazy thenable: the statement runs only when awaited, like a drizzle query builder. */
function mockLazy<T>(run: () => T) {
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

function mockWrite(what: string) {
  mockState.writes.push(`${mockState.inTransaction ? "tx " : ""}${what}`);
}

const mockDb = {
  select: (projection: Record<string, Column>) => ({
    from: (t: Table) => ({
      where: (cond: Cond) => {
        const run = () =>
          mockState[t._name]
            .filter((r) => mockMatches(r, cond))
            .map((r) => {
              const out: Row = {};
              for (const [key, col] of Object.entries(projection))
                out[key] = r[col.column];
              return out;
            });
        return {
          ...mockLazy(run),
          limit: (n: number) => mockLazy(() => run().slice(0, n)),
        };
      },
    }),
  }),
  update: (t: Table) => ({
    set: (values: Row) => ({
      where: (cond: Cond) =>
        mockLazy(() => {
          mockWrite(`update ${t._name}`);
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
      mockLazy(() => {
        mockWrite(`delete ${t._name}`);
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
  transaction: async <T>(fn: (tx: object) => Promise<T>): Promise<T> => {
    mockState.inTransaction = true;
    try {
      return await fn(mockDb);
    } finally {
      mockState.inTransaction = false;
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
  requireSessionUser: async () => ({ id: "user-a" }),
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));

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
