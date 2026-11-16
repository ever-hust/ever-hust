/**
 * /api/organizations/invitations/[token]/accept: an invitation typed with
 * capital letters must still reach the invitee, whose session email is always
 * lowercase. Any other email keeps getting "Invitation not found".
 */
const invitationsTable = { table: "organization_invitations" };
const membersTable = { table: "organization_members" };
const organizationsTable = { table: "organizations" };

jest.mock("@ever-hust/db/schema", () => ({
  organizationInvitations: invitationsTable,
  organizationMembers: membersTable,
  organizations: organizationsTable,
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  count: jest.fn(),
}));

// Rows returned by `.limit()` per table, and by awaiting `.where()` (count query).
const limitRows = new Map<unknown, unknown[]>();
const whereRows = new Map<unknown, unknown[]>();

function selectBuilder() {
  return {
    from: (table: unknown) => ({
      where: () => ({
        limit: async () => limitRows.get(table) ?? [],
        then: (
          resolve: (v: unknown[]) => unknown,
          reject: (e: unknown) => unknown,
        ) => Promise.resolve(whereRows.get(table) ?? []).then(resolve, reject),
      }),
    }),
  };
}

const mockInsertValues = jest.fn(async () => undefined);
const mockUpdateSet = jest.fn(() => ({ where: async () => undefined }));
const queryClient = {
  select: () => selectBuilder(),
  insert: () => ({ values: mockInsertValues }),
  update: () => ({ set: mockUpdateSet }),
};

jest.mock("@ever-hust/db", () => ({
  db: {
    ...queryClient,
    transaction: async (fn: (tx: typeof queryClient) => unknown) =>
      fn(queryClient),
  },
}));

let mockSessionUser: { id: string; email: string };
jest.mock("../get-session-user", () => ({
  requireSessionUser: async () => mockSessionUser,
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));

import {
  GET,
  POST,
} from "../../app/api/organizations/invitations/[token]/accept/route";

const TOKEN = "invite-token-1";
const context = { params: Promise.resolve({ token: TOKEN }) };
const request = () =>
  new Request(`http://localhost/api/organizations/invitations/${TOKEN}/accept`);

describe("organization invitation accept route email matching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    limitRows.clear();
    whereRows.clear();
    // Stored before invitations were lowercased on write.
    limitRows.set(invitationsTable, [
      {
        id: 7,
        email: "Jane.Doe@Acme.com",
        role: "member",
        status: "pending",
        token: TOKEN,
        organizationId: 42,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
    ]);
    limitRows.set(organizationsTable, [{ name: "Acme", maxMembers: 10 }]);
    limitRows.set(membersTable, []);
    whereRows.set(membersTable, [{ value: 1 }]);
    mockSessionUser = { id: "user-jane", email: "jane.doe@acme.com" };
  });

  it("GET returns the invitation when only the email case differs", async () => {
    const res = await GET(request(), context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitation.organizationName).toBe("Acme");
    expect(body.invitation.status).toBe("pending");
  });

  it("POST accepts the invitation when only the email case differs", async () => {
    const res = await POST(request(), context);
    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith({
      organizationId: 42,
      userId: "user-jane",
      role: "member",
    });
    expect(mockUpdateSet).toHaveBeenCalledWith({ status: "accepted" });
  });

  it("GET still returns 404 for a different email", async () => {
    mockSessionUser = { id: "user-other", email: "someone.else@acme.com" };
    const res = await GET(request(), context);
    expect(res.status).toBe(404);
  });

  it("POST still returns 404 for a different email and adds no member", async () => {
    mockSessionUser = { id: "user-other", email: "someone.else@acme.com" };
    const res = await POST(request(), context);
    expect(res.status).toBe(404);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});
