/**
 * /api/user/alerts: job alerts go only to the signed-in user's own email, and
 * one user can hold at most 20 alerts. Before this, the body's `email` was
 * stored as given, so a subscriber could point many alerts at people who never
 * signed up, and those people could not unsubscribe.
 */
const alertsTable = { table: "user_alerts" };

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  count: jest.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
}));

type AlertRow = Record<string, unknown> & { id: number; email: string };

// The session user's alerts, as stored in user_alerts.
let storedAlerts: AlertRow[] = [];
let nextId = 1;

const mockInsertValues = jest.fn((values: Record<string, unknown>) => ({
  returning: async () => {
    const row = { id: nextId++, ...values } as AlertRow;
    storedAlerts.push(row);
    return [row];
  },
}));
const mockUpdateSet = jest.fn((updates: Record<string, unknown>) => ({
  where: () => ({
    returning: async () => {
      const row = storedAlerts[0];
      if (!row) return [];
      Object.assign(row, updates);
      return [row];
    },
  }),
}));
const mockExecute = jest.fn(async () => undefined);

// `select({ value: count() }).from(userAlerts).where(...)` resolves to the count.
function selectBuilder() {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: async () => storedAlerts }),
        then: (
          resolve: (v: unknown[]) => unknown,
          reject: (e: unknown) => unknown,
        ) =>
          Promise.resolve([{ value: storedAlerts.length }]).then(
            resolve,
            reject,
          ),
      }),
    }),
  };
}

const queryClient = {
  select: () => selectBuilder(),
  insert: () => ({ values: mockInsertValues }),
  update: () => ({ set: mockUpdateSet }),
  execute: mockExecute,
};

jest.mock("@ever-hust/db", () => ({
  db: {
    ...queryClient,
    transaction: async (fn: (tx: typeof queryClient) => unknown) =>
      fn(queryClient),
  },
  userAlerts: alertsTable,
}));

let mockSessionUser: { id: string; email: string };
jest.mock("../get-session-user", () => ({
  requireSessionUser: async () => mockSessionUser,
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));
jest.mock("../subscription-gate", () => ({
  checkSubscription: async () => ({ isActive: true }),
}));

import { POST, PATCH } from "../../app/api/user/alerts/route";

const ACCOUNT_EMAIL = "jane.doe@acme.com";
const CAP = 20;

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/user/alerts", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function existingAlert(id: number): AlertRow {
  return {
    id,
    userId: "user-jane",
    frequency: "daily",
    email: ACCOUNT_EMAIL,
    criteria: { keywords: ["react"] },
    isActive: true,
  };
}

describe("user alerts route recipient and cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storedAlerts = [];
    nextId = 1;
    mockSessionUser = { id: "user-jane", email: ACCOUNT_EMAIL };
  });

  it("POST stores the account email, not the email in the body", async () => {
    const res = await POST(
      jsonRequest("POST", {
        frequency: "twice_daily",
        email: "victim@example.com",
        criteria: { keywords: ["react"] },
      }),
    );

    expect(res.status).toBe(201);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({
      userId: "user-jane",
      email: ACCOUNT_EMAIL,
    });
    const body = await res.json();
    expect(body.alert.email).toBe(ACCOUNT_EMAIL);
  });

  it("POST without an email creates the alert for the account email", async () => {
    const res = await POST(
      jsonRequest("POST", {
        frequency: "daily",
        criteria: { keywords: ["react"] },
      }),
    );

    expect(res.status).toBe(201);
    expect(storedAlerts).toHaveLength(1);
    expect(storedAlerts[0]!.email).toBe(ACCOUNT_EMAIL);
  });

  it("PATCH with another email returns 400 and keeps the stored email", async () => {
    storedAlerts = [existingAlert(1)];

    const res = await PATCH(
      jsonRequest("PATCH", { id: 1, email: "victim@example.com" }),
    );

    expect(res.status).toBe(400);
    expect(storedAlerts[0]!.email).toBe(ACCOUNT_EMAIL);
    for (const [updates] of mockUpdateSet.mock.calls) {
      expect(updates).not.toHaveProperty("email");
    }
  });

  it("PATCH that pauses an alert (the alerts card) still works", async () => {
    storedAlerts = [existingAlert(1)];

    const res = await PATCH(jsonRequest("PATCH", { id: 1, isActive: false }));

    expect(res.status).toBe(200);
    expect(storedAlerts[0]!.isActive).toBe(false);
    expect(storedAlerts[0]!.email).toBe(ACCOUNT_EMAIL);
  });

  it(`POST at the cap of ${CAP} alerts returns 400 and inserts nothing`, async () => {
    storedAlerts = Array.from({ length: CAP }, (_, i) => existingAlert(i + 1));
    nextId = CAP + 1;

    // A body the schema accepts, so only the cap can refuse it.
    const res = await POST(
      jsonRequest("POST", {
        frequency: "daily",
        email: ACCOUNT_EMAIL,
        criteria: { keywords: ["react"] },
      }),
    );

    expect(res.status).toBe(400);
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(storedAlerts).toHaveLength(CAP);
    const body = await res.json();
    expect(body.error).toMatch(/20/);
  });

  it("POST just below the cap still creates the alert", async () => {
    storedAlerts = Array.from({ length: CAP - 1 }, (_, i) =>
      existingAlert(i + 1),
    );
    nextId = CAP;

    const res = await POST(
      jsonRequest("POST", {
        frequency: "weekly",
        email: ACCOUNT_EMAIL,
        criteria: { keywords: ["react"] },
      }),
    );

    expect(res.status).toBe(201);
    expect(storedAlerts).toHaveLength(CAP);
  });
});
