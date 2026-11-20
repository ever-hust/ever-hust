/**
 * GET /api/user/usage: the sidebar's search and cover letter counts must come
 * from the counters the chat consumes (@ever-hust/ai). Before this, the route
 * peeked `search:` / `cover:` keys that nothing ever writes, so a free user
 * always saw Searches 0/5 and Cover Letters 0/1.
 */
const mockCheckSubscription = jest.fn();
const mockPeekSearchLimit = jest.fn();
const mockPeekCoverLetterLimit = jest.fn();

jest.mock("../get-session-user", () => ({
  requireSessionUser: async () => ({ id: "u1" }),
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));
jest.mock("../subscription-gate", () => ({
  ...jest.requireActual("../subscription-gate"),
  checkSubscription: (...a: unknown[]) => mockCheckSubscription(...a),
}));
jest.mock("@ever-hust/ai", () => ({
  peekSearchLimit: (...a: unknown[]) => mockPeekSearchLimit(...a),
  peekCoverLetterLimit: (...a: unknown[]) => mockPeekCoverLetterLimit(...a),
}));

import { GET } from "../../app/api/user/usage/route";

interface UsageCategory {
  used: number;
  remaining: number;
  limit: number;
  period: string;
}

interface UsageBody {
  plan: string;
  unlimited: boolean;
  usage: {
    messages: UsageCategory;
    searches: UsageCategory;
    coverLetters: UsageCategory;
  } | null;
}

async function getUsage(): Promise<UsageBody> {
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as UsageBody;
}

describe("GET /api/user/usage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSubscription.mockResolvedValue({ userId: "u1", isActive: false, limits: {} });
    mockPeekSearchLimit.mockResolvedValue({ used: 0, remaining: 5, limit: 5 });
    mockPeekCoverLetterLimit.mockResolvedValue({ used: 0, remaining: 1, limit: 1 });
  });

  it("reports the searches the chat consumed for a free user", async () => {
    mockPeekSearchLimit.mockResolvedValue({ used: 1, remaining: 4, limit: 5 });

    const body = await getUsage();

    expect(body.plan).toBe("free");
    expect(body.usage?.searches).toEqual({ used: 1, remaining: 4, limit: 5, period: "day" });
    expect(mockPeekSearchLimit).toHaveBeenCalledWith("u1");
  });

  it("reports the cover letter the chat consumed for a free user", async () => {
    mockPeekCoverLetterLimit.mockResolvedValue({ used: 1, remaining: 0, limit: 1 });

    const body = await getUsage();

    expect(body.usage?.coverLetters).toEqual({ used: 1, remaining: 0, limit: 1, period: "week" });
    expect(mockPeekCoverLetterLimit).toHaveBeenCalledWith("u1");
  });

  it("returns unlimited for a pro user without peeking", async () => {
    mockCheckSubscription.mockResolvedValue({ userId: "u1", isActive: true, limits: null });

    const body = await getUsage();

    expect(body).toEqual({ plan: "pro", unlimited: true, usage: null });
    expect(mockPeekSearchLimit).not.toHaveBeenCalled();
    expect(mockPeekCoverLetterLimit).not.toHaveBeenCalled();
  });
});
