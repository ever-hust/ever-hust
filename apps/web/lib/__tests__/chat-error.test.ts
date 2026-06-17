import {
  ChatRequestError,
  classifyChatError,
  createLimitAwareFetch,
} from "../chat-error";

describe("classifyChatError", () => {
  it("surfaces the server's daily-limit message + upgrade CTA (from ChatRequestError)", () => {
    const err = new ChatRequestError(
      "Daily message limit reached. Upgrade to Pro for unlimited messages.",
      { status: 429, limitType: "messages" },
    );
    const result = classifyChatError(err);
    expect(result.kind).toBe("upgrade-limit");
    expect(result.title).toBe("Daily message limit reached");
    expect(result.description).toBe(
      "Daily message limit reached. Upgrade to Pro for unlimited messages.",
    );
    expect(result.upgradeHref).toBe("/settings");
    expect(result.canRetry).toBe(false);
  });

  it("detects the daily cap via limitType even when the message is terse", () => {
    const err = new ChatRequestError("Limit reached", { status: 429, limitType: "messages" });
    expect(classifyChatError(err).kind).toBe("upgrade-limit");
  });

  it("classifies a plain daily-limit message string", () => {
    const result = classifyChatError(
      new Error("Daily message limit reached. Upgrade to Pro for unlimited messages."),
    );
    expect(result.kind).toBe("upgrade-limit");
    expect(result.upgradeHref).toBe("/settings");
  });

  it("treats a transient per-minute throttle as rate-limit (retryable, no upgrade)", () => {
    const err = new ChatRequestError("Too many requests. Please try again later.", {
      status: 429,
    });
    const result = classifyChatError(err);
    expect(result.kind).toBe("rate-limit");
    expect(result.canRetry).toBe(true);
    expect(result.upgradeHref).toBeUndefined();
  });

  it("classifies auth errors", () => {
    expect(classifyChatError(new ChatRequestError("Unauthorized", { status: 401 })).kind).toBe(
      "auth",
    );
    expect(classifyChatError(new Error("Please sign in")).kind).toBe("auth");
  });

  it("classifies network errors", () => {
    expect(classifyChatError(new Error("Failed to fetch")).kind).toBe("network");
  });

  it("falls back to unknown for unrecognized errors", () => {
    const result = classifyChatError(new Error("boom"));
    expect(result.kind).toBe("unknown");
    expect(result.title).toBe("Something went wrong");
    expect(result.canRetry).toBe(true);
  });

  it("never throws on non-Error inputs", () => {
    expect(classifyChatError(undefined).kind).toBe("unknown");
    expect(classifyChatError("just a string").kind).toBe("unknown");
  });
});

describe("createLimitAwareFetch", () => {
  it("passes through an OK response untouched", async () => {
    const ok = new Response("stream", { status: 200 });
    const wrapped = createLimitAwareFetch(async () => ok);
    await expect(wrapped("/api/ai/chat")).resolves.toBe(ok);
  });

  it("throws a ChatRequestError carrying the server message + limitType on 429", async () => {
    const body = JSON.stringify({
      error: "Daily message limit reached. Upgrade to Pro for unlimited messages.",
      details: { limitType: "messages", remaining: 0 },
    });
    const wrapped = createLimitAwareFetch(
      async () =>
        new Response(body, {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(wrapped("/api/ai/chat")).rejects.toMatchObject({
      name: "ChatRequestError",
      status: 429,
      limitType: "messages",
      serverMessage: "Daily message limit reached. Upgrade to Pro for unlimited messages.",
    });
  });

  it("does not consume the response body the SDK may still read (clones it)", async () => {
    // A non-OK response whose body, if consumed, would be unavailable afterwards.
    let captured: Response | undefined;
    const wrapped = createLimitAwareFetch(async () => {
      captured = new Response(JSON.stringify({ error: "nope" }), { status: 400 });
      return captured;
    });
    await expect(wrapped("/x")).rejects.toBeInstanceOf(ChatRequestError);
    // Original response body remains unread/usable.
    expect(captured!.bodyUsed).toBe(false);
  });

  it("still throws (with status) when the error body is not JSON", async () => {
    const wrapped = createLimitAwareFetch(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    await expect(wrapped("/x")).rejects.toMatchObject({
      name: "ChatRequestError",
      status: 502,
    });
  });
});
