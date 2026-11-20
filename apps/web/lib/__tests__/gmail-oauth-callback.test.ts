/**
 * GET /api/inbox/oauth/google/callback: the state names who started the flow, the session
 * names who is finishing it. A forwarded consent link must never link a mailbox to someone else.
 */
const mockGetSessionUser = jest.fn();
const mockExchangeCode = jest.fn();
const mockOnConflict = jest.fn();
const mockValues = jest.fn();
const mockInsert = jest.fn();

jest.mock("../get-session-user", () => ({ getSessionUser: () => mockGetSessionUser() }));
jest.mock("@ever-hust/db", () => ({ db: { insert: (...a: unknown[]) => mockInsert(...a) }, emailAccounts: { userId: "userId" } }));
jest.mock("@ever-hust/ai/crypto", () => ({ encryptApiKey: (s: string) => `enc:${s}` }));
jest.mock("../gmail-oauth", () => {
  const actual = jest.requireActual("../gmail-oauth");
  return { ...actual, exchangeCode: (...a: unknown[]) => mockExchangeCode(...a) };
});

import { signState } from "../gmail-oauth";
import { GET } from "../../app/api/inbox/oauth/google/callback/route";

const env = process.env as Record<string, string | undefined>;
const saved = {
  id: env.GMAIL_INBOX_CLIENT_ID,
  secret: env.GMAIL_INBOX_CLIENT_SECRET,
  app: env.NEXT_PUBLIC_APP_URL,
  auth: env.BETTER_AUTH_SECRET,
};

beforeEach(() => {
  env.GMAIL_INBOX_CLIENT_ID = "cid";
  env.GMAIL_INBOX_CLIENT_SECRET = "csecret";
  env.NEXT_PUBLIC_APP_URL = "http://localhost:8443";
  env.BETTER_AUTH_SECRET = "callback-test-secret";
  jest.clearAllMocks();
  mockOnConflict.mockResolvedValue(undefined);
  mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict });
  mockInsert.mockReturnValue({ values: mockValues });
  mockExchangeCode.mockResolvedValue({ refreshToken: "rt", accessToken: "at", email: "me@gmail.test" });
});
afterEach(() => {
  const restore = (k: string, v: string | undefined) => (v === undefined ? delete env[k] : (env[k] = v));
  restore("GMAIL_INBOX_CLIENT_ID", saved.id);
  restore("GMAIL_INBOX_CLIENT_SECRET", saved.secret);
  restore("NEXT_PUBLIC_APP_URL", saved.app);
  restore("BETTER_AUTH_SECRET", saved.auth);
});

const call = (state: string) =>
  GET(new Request(`http://localhost:8443/api/inbox/oauth/google/callback?code=abc&state=${encodeURIComponent(state)}`));
const location = (res: Response) => res.headers.get("location");

describe("gmail oauth callback", () => {
  it("connects when the session user is the one who started the flow", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-a" });
    const res = await call(signState("user-a"));
    expect(location(res)).toBe("http://localhost:8443/inbox?google=connected");
    expect(mockExchangeCode).toHaveBeenCalledWith("abc");
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-a", email: "me@gmail.test" }));
  });

  it("refuses a valid state for user A when user B is signed in", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-b" });
    const res = await call(signState("user-a"));
    expect(location(res)).toBe("http://localhost:8443/inbox?google=error");
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses when nobody is signed in", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await call(signState("user-a"));
    expect(location(res)).toBe("http://localhost:8443/inbox?google=error");
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses an expired state even for the right user", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-a" });
    const res = await call(signState("user-a", Date.now() - 11 * 60_000));
    expect(location(res)).toBe("http://localhost:8443/inbox?google=error");
    expect(mockExchangeCode).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
