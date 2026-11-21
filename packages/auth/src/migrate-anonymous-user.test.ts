/**
 * A guest from /try has a real session, so they can create an organization, invite people and
 * see them join. On sign-up or sign-in onLinkAccount (linkAnonymousUser) runs this and then
 * deletes the guest user, and organizations.created_by_id, organization_members.user_id and
 * organization_invitations.invited_by_id all cascade on that delete. migrateAnonymousUserData
 * has to move those rows to the new account first, or the organization goes with the guest.
 *
 * The db below is an in-memory stand-in that answers the function's query shapes, enforces the
 * unique keys the moves can hit, rolls a statement or a transaction back when it throws and,
 * like Postgres, cascades the guest delete.
 */
import type { Database } from "@ever-hust/db/client";

type TableName =
  | "organizations"
  | "organizationMembers"
  | "organizationInvitations"
  | "chatSessions"
  | "userJobs"
  | "applications"
  | "userAlerts";
type Row = Record<string, unknown>;
type Column = { table: TableName; column: string };
type Table = { _name: TableName } & Record<string, unknown>;
type Cond =
  | { op: "eq"; col: Column; val: unknown }
  | { op: "inArray"; col: Column; vals: unknown[] }
  | { op: "and"; conds: Cond[] };

function mockTable(name: TableName, columns: string[]): Table {
  const t: Table = { _name: name };
  for (const column of columns) t[column] = { table: name, column };
  return t;
}

const mockSchema = {
  organizations: mockTable("organizations", [
    "id",
    "name",
    "createdById",
    "updatedAt",
  ]),
  organizationMembers: mockTable("organizationMembers", [
    "id",
    "organizationId",
    "userId",
    "role",
    "joinedAt",
  ]),
  organizationInvitations: mockTable("organizationInvitations", [
    "id",
    "organizationId",
    "email",
    "invitedById",
    "status",
  ]),
  chatSessions: mockTable("chatSessions", ["id", "userId"]),
  userJobs: mockTable("userJobs", ["id", "userId", "jobId"]),
  applications: mockTable("applications", ["id", "userId"]),
  userAlerts: mockTable("userAlerts", ["id", "userId"]),
};

const mockState = {
  tables: {} as Record<TableName, Row[]>,
  /** Every write in order, e.g. "tx update organizations"; "tx " marks a write in a transaction. */
  writes: [] as string[],
  inTransaction: false,
  /** A write that fails as if the connection dropped, e.g. "update userAlerts". */
  failOn: null as string | null,
};

/** The unique keys a move can collide with, as declared in packages/db/src/schema. */
const mockUniqueKeys: Partial<
  Record<TableName, { name: string; columns: string[] }>
> = {
  organizationMembers: {
    name: "org_members_unique",
    columns: ["organizationId", "userId"],
  },
  userJobs: { name: "user_jobs_unique", columns: ["userId", "jobId"] },
};

function mockMatches(row: Row, cond: Cond): boolean {
  switch (cond.op) {
    case "and":
      return cond.conds.every((c) => mockMatches(row, c));
    case "eq":
      return row[cond.col.column] === cond.val;
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
  if (mockState.failOn === what) throw new Error("connection lost");
}

function mockCheckUnique(name: TableName) {
  const key = mockUniqueKeys[name];
  if (!key) return;
  const seen = new Set<string>();
  for (const row of mockState.tables[name]) {
    const value = JSON.stringify(key.columns.map((c) => row[c]));
    if (seen.has(value)) {
      throw new Error(
        `duplicate key value violates unique constraint "${key.name}"`,
      );
    }
    seen.add(value);
  }
}

const mockDb = {
  select: (projection: Record<string, Column>) => ({
    from: (t: Table) => ({
      where: (cond: Cond) => {
        const rows = () =>
          mockState.tables[t._name]
            .filter((r) => mockMatches(r, cond))
            .map((r) => {
              const out: Row = {};
              for (const [key, col] of Object.entries(projection))
                out[key] = r[col.column];
              return out;
            });
        return {
          ...mockLazy(rows),
          // SELECT ... ORDER BY ... FOR UPDATE: recorded as e.g. "tx lock organizations 1,2".
          orderBy: (col: Column) => ({
            for: (strength: string) =>
              mockLazy(() => {
                const locked = rows().sort(
                  (a, b) => Number(a[col.column]) - Number(b[col.column]),
                );
                mockState.writes.push(
                  `${mockState.inTransaction ? "tx " : ""}lock ${t._name} ${locked
                    .map((r) => String(r[col.column]))
                    .join(",")} for ${strength}`,
                );
                return locked;
              }),
          }),
        };
      },
    }),
  }),
  update: (t: Table) => ({
    set: (values: Row) => ({
      where: (cond: Cond) =>
        mockLazy(() => {
          mockWrite(`update ${t._name}`);
          const before = structuredClone(mockState.tables[t._name]);
          for (const row of mockState.tables[t._name].filter((r) =>
            mockMatches(r, cond),
          )) {
            Object.assign(row, values);
          }
          try {
            mockCheckUnique(t._name);
          } catch (error) {
            mockState.tables[t._name] = before;
            throw error;
          }
        }),
    }),
  }),
  delete: (t: Table) => ({
    where: (cond: Cond) =>
      mockLazy(() => {
        mockWrite(`delete ${t._name}`);
        mockState.tables[t._name] = mockState.tables[t._name].filter(
          (r) => !mockMatches(r, cond),
        );
      }),
  }),
  transaction: async <T>(fn: (tx: object) => Promise<T>): Promise<T> => {
    const before = structuredClone(mockState.tables);
    mockState.inTransaction = true;
    try {
      return await fn(mockDb);
    } catch (error) {
      mockState.tables = before;
      throw error;
    } finally {
      mockState.inTransaction = false;
    }
  },
};

jest.mock("@ever-hust/db/schema", () => mockSchema);
jest.mock("drizzle-orm", () => ({
  eq: (col: Column, val: unknown) => ({ op: "eq", col, val }),
  inArray: (col: Column, vals: unknown[]) => ({ op: "inArray", col, vals }),
  and: (...conds: Cond[]) => ({ op: "and", conds }),
}));

import { migrateAnonymousUserData } from "./migrate-anonymous-user";

const GUEST = "guest-1";
const NEW_USER = "user-new";
let nextMemberId = 1;

function member(organizationId: number, userId: string, role: string): Row {
  return {
    id: nextMemberId++,
    organizationId,
    userId,
    role,
    joinedAt: new Date(Date.UTC(2026, 0, nextMemberId)),
  };
}

function seed(tables: Partial<Record<TableName, Row[]>>) {
  mockState.tables = {
    organizations: [],
    organizationMembers: [],
    organizationInvitations: [],
    chatSessions: [],
    userJobs: [],
    applications: [],
    userAlerts: [],
    ...tables,
  };
  mockState.writes = [];
  mockState.failOn = null;
}

/** What linkAnonymousUser does once the move committed: delete the guest, cascading like Postgres. */
function deleteGuestLikePostgres() {
  const t = mockState.tables;
  const goneOrgIds = t.organizations
    .filter((o) => o.createdById === GUEST)
    .map((o) => o.id);
  t.organizations = t.organizations.filter((o) => !goneOrgIds.includes(o.id));
  t.organizationMembers = t.organizationMembers.filter(
    (m) => m.userId !== GUEST && !goneOrgIds.includes(m.organizationId),
  );
  t.organizationInvitations = t.organizationInvitations.filter(
    (i) => i.invitedById !== GUEST && !goneOrgIds.includes(i.organizationId),
  );
  for (const name of [
    "chatSessions",
    "userJobs",
    "applications",
    "userAlerts",
  ] as const) {
    t[name] = t[name].filter((r) => r.userId !== GUEST);
  }
}

const migrate = (fromId: string, toId: string) =>
  migrateAnonymousUserData(mockDb as unknown as Database, fromId, toId);
const org = (id: number) =>
  mockState.tables.organizations.find((o) => o.id === id);
/** "userId:role" for each member of an organization, sorted. */
const members = (organizationId: number) =>
  mockState.tables.organizationMembers
    .filter((m) => m.organizationId === organizationId)
    .map((m) => `${m.userId}:${m.role}`)
    .sort();
/** The user_jobs rows, by id. */
const savedJobs = () =>
  [...mockState.tables.userJobs].sort(
    (a, b) => (a.id as number) - (b.id as number),
  );

describe("migrateAnonymousUserData and the organizations a guest created", () => {
  it("moves the guest's organization, membership and sent invitation to the new account", async () => {
    seed({
      organizations: [{ id: 1, name: "Guest Co", createdById: GUEST }],
      organizationMembers: [
        member(1, GUEST, "owner"),
        member(1, "user-b", "member"),
      ],
      organizationInvitations: [
        {
          id: 1,
          organizationId: 1,
          email: "c@example.com",
          invitedById: GUEST,
          status: "pending",
        },
      ],
      chatSessions: [{ id: "chat-1", userId: GUEST }],
    });

    await migrate(GUEST, NEW_USER);
    deleteGuestLikePostgres();

    expect(org(1)).toMatchObject({ name: "Guest Co", createdById: NEW_USER });
    expect(members(1)).toEqual(["user-b:member", "user-new:owner"]);
    expect(mockState.tables.organizationInvitations).toEqual([
      expect.objectContaining({
        id: 1,
        invitedById: NEW_USER,
        status: "pending",
      }),
    ]);
    // The moves that were there before still happen.
    expect(mockState.tables.chatSessions).toEqual([
      { id: "chat-1", userId: NEW_USER },
    ]);
    // Every organization write runs inside the one transaction.
    const orgWrites = mockState.writes.filter((w) =>
      w.includes("organization"),
    );
    expect(orgWrites.length).toBeGreaterThan(0);
    expect(orgWrites.every((w) => w.startsWith("tx "))).toBe(true);
  });

  it.each([
    ["the guest's role is higher", "owner", "member", "user-new:owner"],
    ["the new account's role is higher", "member", "admin", "user-new:admin"],
  ])(
    "keeps one membership with the higher role when the new account is already a member (%s)",
    async (_case, guestRole, newUserRole, expected) => {
      seed({
        organizations: [{ id: 1, name: "Shared", createdById: GUEST }],
        organizationMembers: [
          member(1, GUEST, guestRole),
          member(1, NEW_USER, newUserRole),
          member(1, "user-b", "member"),
        ],
      });

      await migrate(GUEST, NEW_USER);
      deleteGuestLikePostgres();

      expect(org(1)).toMatchObject({ createdById: NEW_USER });
      expect(members(1)).toEqual(["user-b:member", expected]);
    },
  );

  it("keeps the account's own row for a job both saved and still moves everything else", async () => {
    seed({
      organizations: [{ id: 1, name: "Guest Co", createdById: GUEST }],
      organizationMembers: [member(1, GUEST, "owner")],
      chatSessions: [{ id: "chat-1", userId: GUEST }],
      userJobs: [
        { id: 1, userId: GUEST, jobId: 7 },
        { id: 2, userId: NEW_USER, jobId: 7 },
        { id: 3, userId: GUEST, jobId: 8 },
      ],
      applications: [{ id: 1, userId: GUEST }],
      userAlerts: [{ id: 1, userId: GUEST }],
    });

    await expect(migrate(GUEST, NEW_USER)).resolves.toBeUndefined();
    deleteGuestLikePostgres();

    expect(org(1)).toMatchObject({ createdById: NEW_USER });
    expect(members(1)).toEqual(["user-new:owner"]);
    expect(savedJobs()).toEqual([
      { id: 2, userId: NEW_USER, jobId: 7 },
      { id: 3, userId: NEW_USER, jobId: 8 },
    ]);
    expect(mockState.tables.chatSessions).toEqual([
      { id: "chat-1", userId: NEW_USER },
    ]);
    expect(mockState.tables.applications).toEqual([
      { id: 1, userId: NEW_USER },
    ]);
    expect(mockState.tables.userAlerts).toEqual([{ id: 1, userId: NEW_USER }]);
  });

  it("moves the guest's applications and alerts when every saved job is one the account already has", async () => {
    seed({
      userJobs: [
        { id: 1, userId: GUEST, jobId: 7 },
        { id: 2, userId: GUEST, jobId: 8 },
        { id: 3, userId: NEW_USER, jobId: 7 },
        { id: 4, userId: NEW_USER, jobId: 8 },
      ],
      applications: [{ id: 1, userId: GUEST }],
      userAlerts: [{ id: 1, userId: GUEST }],
    });

    await expect(migrate(GUEST, NEW_USER)).resolves.toBeUndefined();
    deleteGuestLikePostgres();

    expect(savedJobs()).toEqual([
      { id: 3, userId: NEW_USER, jobId: 7 },
      { id: 4, userId: NEW_USER, jobId: 8 },
    ]);
    expect(mockState.tables.applications).toEqual([
      { id: 1, userId: NEW_USER },
    ]);
    expect(mockState.tables.userAlerts).toEqual([{ id: 1, userId: NEW_USER }]);
  });

  it("moves nothing, organizations included, when any step fails, so the guest keeps it all", async () => {
    seed({
      organizations: [{ id: 1, name: "Guest Co", createdById: GUEST }],
      organizationMembers: [
        member(1, GUEST, "owner"),
        member(1, "user-b", "member"),
      ],
      chatSessions: [{ id: "chat-1", userId: GUEST }],
      userJobs: [{ id: 1, userId: GUEST, jobId: 7 }],
      applications: [{ id: 1, userId: GUEST }],
      userAlerts: [{ id: 1, userId: GUEST }],
    });
    mockState.failOn = "update userAlerts";

    // linkAnonymousUser catches this and keeps the guest: it is not deleted.
    await expect(migrate(GUEST, NEW_USER)).rejects.toThrow("connection lost");

    // One transaction, rolled back as a whole: everything still belongs to the guest.
    expect(mockState.writes.every((w) => w.startsWith("tx "))).toBe(true);
    expect(org(1)).toMatchObject({ createdById: GUEST });
    expect(members(1)).toEqual(["guest-1:owner", "user-b:member"]);
    expect(mockState.tables.chatSessions).toEqual([
      { id: "chat-1", userId: GUEST },
    ]);
    expect(savedJobs()).toEqual([{ id: 1, userId: GUEST, jobId: 7 }]);
    expect(mockState.tables.applications).toEqual([{ id: 1, userId: GUEST }]);
    expect(mockState.tables.userAlerts).toEqual([{ id: 1, userId: GUEST }]);
  });

  it("locks the guest's organizations in id order before any write", async () => {
    seed({
      organizations: [
        { id: 3, name: "Created", createdById: GUEST },
        { id: 9, name: "Other's", createdById: "user-b" },
      ],
      organizationMembers: [
        member(9, "user-b", "owner"),
        member(9, GUEST, "owner"),
        member(9, NEW_USER, "owner"),
        member(3, GUEST, "owner"),
      ],
    });

    await migrate(GUEST, NEW_USER);

    // The same lock the member role-change and removal routes take, so their owner checks
    // can't run halfway through this move.
    expect(mockState.writes[0]).toBe("tx lock organizations 3,9 for update");
    expect(members(9)).toEqual(["user-b:owner", "user-new:owner"]);
    expect(members(3)).toEqual(["user-new:owner"]);
  });

  it("does nothing when both ids are the same user", async () => {
    seed({
      organizations: [{ id: 1, name: "Mine", createdById: NEW_USER }],
      organizationMembers: [member(1, NEW_USER, "owner")],
    });

    await migrate(NEW_USER, NEW_USER);

    expect(mockState.writes).toEqual([]);
  });
});
