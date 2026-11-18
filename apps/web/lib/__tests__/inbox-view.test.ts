/**
 * InboxView guards the one destructive action and stays usable on phones:
 * - the trash button only opens a confirmation, and DELETE /api/inbox/account
 *   (which wipes every stored message, job link and sent copy) is sent only
 *   from the dialog's confirm action;
 * - an open thread has a back button, because below `sm` the thread list is
 *   hidden while a thread is open;
 * - both back buttons have an accessible name.
 *
 * Jest runs in Node here (no DOM), so the view is rendered to static markup.
 * renderToStaticMarkup cannot click, so a test that needs an open thread or an
 * open composer seeds that piece of InboxView state through React.useState
 * (see seedState), and clicks call the onClick a stubbed Button received.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Props = Record<string, unknown> & { children?: unknown };

// Every Button's props, so a test can "click" one by its aria-label.
const mockButtons: Props[] = [];
jest.mock("@ever-hust/ui/button", () => {
  const { createElement: h } =
    jest.requireActual<typeof import("react")>("react");
  return {
    Button: (props: Props) => {
      mockButtons.push(props);
      if (props.asChild) return props.children;
      const rest: Props = { ...props };
      for (const key of ["asChild", "variant", "size", "children"])
        delete rest[key];
      return h("button", rest, props.children as never);
    },
  };
});

// Radix renders dialog content in a portal, which the server never renders, and
// a click cannot open it without a DOM. This stand-in renders every part inline
// and, like Radix's asChild trigger, runs the child's own onClick and then asks
// the dialog to open.
let mockDialogOpenRequests = 0;
const mockDialogActions: Props[] = [];
jest.mock("@ever-hust/ui/alert-dialog", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const part = (tag: string, marker: string) => {
    const Part = (props: Props) => {
      const rest: Props = { ...props };
      for (const key of ["asChild", "children"]) delete rest[key];
      return React.createElement(
        tag,
        { [`data-${marker}`]: "", ...rest },
        props.children as never,
      );
    };
    Part.displayName = marker;
    return Part;
  };
  return {
    AlertDialog: part("div", "alert-dialog"),
    AlertDialogTrigger: ({ children }: Props) => {
      const child = children as ReactElement<{
        onClick?: (e: unknown) => void;
      }>;
      return React.cloneElement(child, {
        onClick: (e: unknown) => {
          child.props.onClick?.(e);
          mockDialogOpenRequests += 1;
        },
      });
    },
    AlertDialogContent: part("div", "alert-dialog-content"),
    AlertDialogHeader: part("div", "alert-dialog-header"),
    AlertDialogFooter: part("div", "alert-dialog-footer"),
    AlertDialogTitle: part("h2", "alert-dialog-title"),
    AlertDialogDescription: part("p", "alert-dialog-description"),
    AlertDialogCancel: part("button", "alert-dialog-cancel"),
    AlertDialogAction: (props: Props) => {
      mockDialogActions.push(props);
      return part("button", "alert-dialog-action")(props);
    },
  };
});

// lucide-react's CJS build can't be require()d by this CJS Jest on Linux CI.
// Each icon renders as an <svg data-icon> carrying its aria-hidden, if any.
jest.mock("lucide-react", () => {
  const { createElement: h } =
    jest.requireActual<typeof import("react")>("react");
  const icon = (name: string) => (props: Props) =>
    h("svg", { "data-icon": name, "aria-hidden": props["aria-hidden"] });
  return {
    RefreshCw: icon("RefreshCw"),
    Loader2: icon("Loader2"),
    Send: icon("Send"),
    Plus: icon("Plus"),
    Inbox: icon("Inbox"),
    Trash2: icon("Trash2"),
    ArrowLeft: icon("ArrowLeft"),
    Sparkles: icon("Sparkles"),
    Briefcase: icon("Briefcase"),
  };
});
jest.mock("next/link", () => {
  const { createElement: h } =
    jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({ children, ...rest }: Props) => h("a", rest, children as never),
  };
});
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/chat/chat-context", () => ({
  useChatContext: () => ({ setInitialPrompt: jest.fn() }),
}));
jest.mock("@/components/inbox/tiptap-composer", () => ({
  TipTapComposer: () => null,
}));

import { InboxView } from "@/components/inbox/inbox-view";

/**
 * Seeds InboxView state the server render cannot reach by clicking: the first
 * React.useState call made with `init` starts at `value` instead, and its
 * setter is recorded. InboxView renders before any of its children, so the
 * first useState(null) is its selected thread and the first useState(false) is
 * its composer flag.
 */
const ReactModule = jest.requireActual<typeof import("react")>("react");
const realUseState = ReactModule.useState;
interface Seed {
  init: unknown;
  value: unknown;
  setter?: jest.Mock;
}
let seeds: Seed[] = [];
function seedState(init: unknown, value: unknown): Seed {
  const seed: Seed = { init, value };
  seeds.push(seed);
  return seed;
}

const THREAD = {
  threadKey: "acme-interview",
  subject: "Interview at Acme",
  lastAt: "2026-11-01T10:00:00.000Z",
  count: 1,
  messages: [
    {
      id: 1,
      direction: "inbound" as const,
      fromAddr: "Recruiter <recruiter@acme.example>",
      toAddrs: "me@example.com",
      subject: "Interview at Acme",
      snippet: "Can you talk on Tuesday?",
      bodyText: "Can you talk on Tuesday?",
      messageId: "<m1@acme.example>",
      category: "interview",
      jobId: null,
      sentAt: "2026-11-01T10:00:00.000Z",
      createdAt: "2026-11-01T10:00:00.000Z",
    },
  ],
};
// Synced just now, so the effect-free server render has no reason to sync.
const ACCOUNT = {
  email: "me@example.com",
  status: "connected",
  lastSyncedAt: new Date().toISOString(),
};

let client: QueryClient;
let fetchMock: jest.Mock;
let onDisconnected: jest.Mock;
const realFetch = global.fetch;

function render(): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(InboxView, { account: ACCOUNT, onDisconnected }),
    ),
  );
}

function buttonLabelled(label: string): Props[] {
  return mockButtons.filter((p) => p["aria-label"] === label);
}

/** Lets a mutation started by a click reach its mutationFn (and settle). */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function deleteCalls(): unknown[][] {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      url === "/api/inbox/account" &&
      (init as RequestInit | undefined)?.method === "DELETE",
  );
}

beforeAll(() => {
  jest.spyOn(ReactModule, "useState").mockImplementation(((init: unknown) => {
    const i = seeds.findIndex(
      (s) => s.setter === undefined && Object.is(s.init, init),
    );
    if (i === -1) return realUseState(init);
    const seed = seeds[i]!;
    const [value, set] = realUseState(seed.value);
    seed.setter = jest.fn(set);
    return [value, seed.setter];
  }) as typeof ReactModule.useState);
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockButtons.length = 0;
  mockDialogActions.length = 0;
  mockDialogOpenRequests = 0;
  seeds = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["inbox-messages"], { threads: [THREAD] });
  fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  global.fetch = fetchMock as unknown as typeof fetch;
  onDisconnected = jest.fn();
});

afterEach(() => {
  client.clear();
  global.fetch = realFetch;
});

describe("InboxView: disconnecting the mailbox", () => {
  it("the trash button opens a confirmation and sends no request", async () => {
    render();
    const [trash] = buttonLabelled("Disconnect mailbox");
    expect(trash).toBeDefined();

    (trash!.onClick as (e: unknown) => void)({ defaultPrevented: false });
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDisconnected).not.toHaveBeenCalled();
    expect(mockDialogOpenRequests).toBe(1);
  });

  it("the confirmation says what gets deleted", () => {
    const html = render();
    expect(html).toContain("data-alert-dialog-content");
    expect(html).toMatch(/stored messages/i);
    expect(html).toMatch(/job links/i);
    expect(html).toMatch(/sent copies/i);
  });

  it("only the confirm action disconnects", async () => {
    render();
    expect(mockDialogActions).toHaveLength(1);

    (mockDialogActions[0]!.onClick as (e: unknown) => void)({
      defaultPrevented: false,
    });
    await flush();

    expect(deleteCalls()).toHaveLength(1);
    expect(onDisconnected).toHaveBeenCalledTimes(1);
  });
});

describe("InboxView: back to the conversation list", () => {
  it("an open thread has a phone-only back button that clears the selection", () => {
    const selected = seedState(null, THREAD.threadKey);
    const html = render();

    // The thread really is open: the reader shows its subject as a heading.
    expect(html).toContain(`>${THREAD.subject}</h2>`);
    const back = buttonLabelled("Back to conversations");
    expect(back).toHaveLength(1);
    expect(String(back[0]!.className)).toContain("sm:hidden");

    (back[0]!.onClick as () => void)();
    expect(selected.setter).toHaveBeenCalledWith(null);
  });

  it("the composer's back button has an accessible name and closes the composer", () => {
    const composeOpen = seedState(false, true);
    const html = render();

    expect(html).toContain("New message");
    const back = buttonLabelled("Back to conversations");
    expect(back).toHaveLength(1);

    (back[0]!.onClick as () => void)();
    expect(composeOpen.setter).toHaveBeenCalledWith(false);
  });

  it.each([
    ["an open thread", () => seedState(null, THREAD.threadKey)],
    ["the composer", () => seedState(false, true)],
  ])("the back arrow in %s is hidden from screen readers", (_label, open) => {
    open();
    const html = render();
    const arrows = html.match(/<svg data-icon="ArrowLeft"[^>]*>/g) ?? [];
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toContain('aria-hidden="true"');
  });
});
