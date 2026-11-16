// The create-alert tool must respect the same per-user cap as POST /api/user/alerts,
// and it always mails the account email.
const usersTable = { table: "users" };
const alertsTable = { table: "user_alerts", id: "user_alerts.id" };

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  count: jest.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
}));

let mockAlertCount = 0;
const mockInsertValues = jest.fn((_values: Record<string, unknown>) => ({
  returning: async () => [{ id: 99 }],
}));
const mockExecute = jest.fn(async (_query: unknown) => undefined);

jest.mock("@ever-hust/db", () => {
  const select = () => ({
    from: (table: unknown) => ({
      where: () => ({
        // The user lookup ends in `.limit(1)`.
        limit: async () =>
          table === usersTable
            ? [{ email: "jane.doe@acme.com", subscriptionStatus: "active" }]
            : [],
        // The alert count is awaited straight after `.where()`.
        then: (
          resolve: (v: unknown[]) => unknown,
          reject: (e: unknown) => unknown,
        ) => Promise.resolve([{ value: mockAlertCount }]).then(resolve, reject),
      }),
    }),
  });
  const client = {
    select,
    insert: () => ({ values: mockInsertValues }),
    execute: mockExecute,
  };
  return {
    db: {
      ...client,
      transaction: async (fn: (tx: typeof client) => unknown) => fn(client),
    },
    users: usersTable,
    userAlerts: alertsTable,
  };
});

import { createAlertTool } from "./create-alert";

async function createAlert() {
  return (await createAlertTool.execute!(
    { userId: "user-jane", frequency: "daily", keywords: ["react"] },
    { toolCallId: "t1", messages: [] },
  )) as { created: boolean; error?: string; alertId?: number };
}

describe("createAlertTool per-user cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates the alert for the account email below the cap", async () => {
    mockAlertCount = 19;
    const result = await createAlert();
    expect(result.created).toBe(true);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({
      userId: "user-jane",
      email: "jane.doe@acme.com",
    });
  });

  it("refuses at the cap of 20 alerts and inserts nothing", async () => {
    mockAlertCount = 20;
    const result = await createAlert();
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/20/);
    expect(mockInsertValues).not.toHaveBeenCalled();

    // Same per-user lock key as POST /api/user/alerts.
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [lock] = mockExecute.mock.calls[0] as unknown as [
      { strings: string[]; values: unknown[] },
    ];
    expect(lock.strings.join("?")).toContain(
      "pg_advisory_xact_lock(hashtext('user-alerts-create'), hashtext(?))",
    );
    expect(lock.values).toEqual(["user-jane"]);
  });
});
