/**
 * The sidebar quota (useUsageStats) must show new counts after each chat turn.
 * The chat panel calls refreshUsageStats from useChat's onFinish (which the AI
 * SDK also runs after an error, such as the daily-limit 429), so
 * refreshUsageStats has to invalidate the very query the hook reads, and only it.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryObserver,
  type QueryObserverOptions,
} from "@tanstack/react-query";

// Capture the options useUsageStats hands to useQuery.
const mockUseQuery = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQuery: (options: unknown) => mockUseQuery(options),
}));

import { useUsageStats } from "@/hooks/use-usage-stats";
import { refreshUsageStats } from "../usage-stats-query";

function UsageStatsProbe() {
  useUsageStats();
  return null;
}

function hookQueryOptions(): QueryObserverOptions {
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: jest.fn(),
  });
  renderToStaticMarkup(createElement(UsageStatsProbe));
  expect(mockUseQuery).toHaveBeenCalledTimes(1);
  return mockUseQuery.mock.calls[0]![0] as QueryObserverOptions;
}

function freeUsage(messagesUsed: number) {
  const category = (used: number, limit: number, period: "day" | "week") => ({
    used,
    remaining: limit - used,
    limit,
    period,
  });
  return {
    plan: "free",
    unlimited: false,
    usage: {
      messages: category(messagesUsed, 10, "day"),
      searches: category(1, 5, "day"),
      coverLetters: category(0, 1, "week"),
    },
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe("refreshUsageStats", () => {
  const originalFetch = global.fetch;
  let client: QueryClient;

  beforeEach(() => {
    mockUseQuery.mockReset();
    // Same 60 s staleTime as components/query-provider.tsx: without a refresh
    // the sidebar keeps the counts it loaded.
    client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000, retry: false } },
    });
  });

  afterEach(() => {
    client.clear();
    global.fetch = originalFetch;
  });

  it("refetches the usage the sidebar quota shows", async () => {
    const options = hookQueryOptions();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(freeUsage(3)))
      .mockResolvedValueOnce(jsonResponse(freeUsage(4)));
    global.fetch = fetchMock as unknown as typeof fetch;

    // The sidebar loaded its counts and is still on screen.
    await client.fetchQuery(options);
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A chat turn used up one message.
    await refreshUsageStats(client);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/user/usage");
    expect(observer.getCurrentResult().data).toEqual(freeUsage(4));
    unsubscribe();
  });

  it("invalidates exactly the query useUsageStats reads", async () => {
    const { queryKey } = hookQueryOptions();
    client.setQueryData(queryKey, freeUsage(3));
    client.setQueryData(["favorites"], []);
    client.setQueryData(["user-profile"], { name: "Test" });

    await refreshUsageStats(client);

    // Stale even with nothing on screen, so the next mount fetches new counts.
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(["favorites"])?.isInvalidated).toBe(false);
    expect(client.getQueryState(["user-profile"])?.isInvalidated).toBe(false);
  });
});
