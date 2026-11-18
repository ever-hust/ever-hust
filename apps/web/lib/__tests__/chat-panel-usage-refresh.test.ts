/**
 * ChatPanel must refresh the sidebar quota when a chat turn ends: after a
 * normal reply, after an error such as the daily-limit 429, and after a stop.
 * The AI SDK calls useChat's onFinish in every one of those cases.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Capture the options ChatPanel hands to useChat.
const mockUseChat = jest.fn();
jest.mock("@ai-sdk/react", () => ({
  useChat: (options: unknown) => mockUseChat(options),
}));
jest.mock("ai", () => ({ DefaultChatTransport: class {} }));
jest.mock("@/hooks/use-chat-persistence", () => ({
  useChatPersistence: () => ({
    sessions: [],
    activeSessionId: null,
    isLoadingSessions: false,
    createSession: jest.fn(),
    startNewSession: jest.fn(),
    loadMessages: jest.fn(),
    saveMessages: jest.fn(),
    deleteSession: jest.fn(),
  }),
}));
// Only the useChat wiring is under test: keep the rest of the panel inert.
// lucide-react's CJS build can't be require()d by this CJS Jest on Linux CI.
jest.mock("lucide-react", () => ({
  MessageSquarePlus: () => null,
  RefreshCcw: () => null,
  ArrowDown: () => null,
  Sparkles: () => null,
}));
jest.mock("@/components/chat/chat-messages", () => ({
  ChatMessages: () => null,
}));
jest.mock("@/components/chat/chat-input", () => ({ ChatInput: () => null }));
jest.mock("@/components/chat/chat-empty-state", () => ({
  ChatEmptyState: () => null,
}));
jest.mock("@/components/chat/chat-history", () => ({
  ChatHistory: () => null,
}));
jest.mock("@/components/chat/agent-status", () => ({
  AgentStatus: () => null,
}));
jest.mock("@ever-hust/ui/button", () => ({ Button: () => null }));
jest.mock("next/link", () => ({ __esModule: true, default: () => null }));

import { ChatPanel } from "@/components/chat/chat-panel";
import { USAGE_STATS_QUERY_KEY } from "../usage-stats-query";

type FinishArg = { isAbort: boolean; isDisconnect: boolean; isError: boolean };
type UseChatOptions = { onFinish?: (arg: FinishArg) => void };

function renderPanel(client: QueryClient): UseChatOptions {
  mockUseChat.mockReturnValue({
    messages: [],
    sendMessage: jest.fn(),
    stop: jest.fn(),
    setMessages: jest.fn(),
    status: "ready",
    error: undefined,
  });
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ChatPanel, {}),
    ),
  );
  expect(mockUseChat).toHaveBeenCalled();
  return mockUseChat.mock.calls[0]![0] as UseChatOptions;
}

describe("ChatPanel refreshes the sidebar quota", () => {
  let client: QueryClient;

  beforeEach(() => {
    mockUseChat.mockReset();
    client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000, retry: false } },
    });
  });

  afterEach(() => client.clear());

  it.each<[string, FinishArg]>([
    ["a reply", { isAbort: false, isDisconnect: false, isError: false }],
    [
      "an error (daily-limit 429)",
      { isAbort: false, isDisconnect: false, isError: true },
    ],
    ["a stop", { isAbort: true, isDisconnect: false, isError: false }],
  ])("after %s", (_label, finish) => {
    const { onFinish } = renderPanel(client);
    client.setQueryData(USAGE_STATS_QUERY_KEY, { plan: "free" });
    client.setQueryData(["favorites"], []);

    expect(onFinish).toEqual(expect.any(Function));
    onFinish!(finish);

    expect(client.getQueryState(USAGE_STATS_QUERY_KEY)?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(["favorites"])?.isInvalidated).toBe(false);
  });
});
