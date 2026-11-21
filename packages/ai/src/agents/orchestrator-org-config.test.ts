import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { createOrchestratorStream } from "./orchestrator";

jest.mock("../credits", () => ({ recordChatUsage: jest.fn(async () => 0) }));
jest.mock("../prompts", () => ({
  getOrchestratorPrompt: async () => ({ text: "You are Hust.", langfusePrompt: null }),
}));

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function answering(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Bonjour." },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ]),
    }),
  });
}

type OrgOptions = {
  orgSystemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

async function runTurn(model: MockLanguageModelV3, org: OrgOptions = {}) {
  const result = await createOrchestratorStream({
    model,
    messages: [{ role: "user", content: "hi" }],
    userId: "user-1",
    ...org,
  });
  await result.consumeStream();
}

function systemText(model: MockLanguageModelV3): string {
  const [system] = model.doStreamCalls[0]!.prompt;
  expect(system?.role).toBe("system");
  return system!.content as string;
}

describe("org AI config in chat", () => {
  it("sends the org's custom prompt, temperature and max tokens to the model", async () => {
    const model = answering();
    await runTurn(model, {
      orgSystemPrompt: "Answer in French",
      temperature: 0.2,
      maxOutputTokens: 800,
    });

    expect(model.doStreamCalls).toHaveLength(1);
    const system = systemText(model);
    // Appended after the base prompt, never instead of it.
    expect(system.startsWith("You are Hust.")).toBe(true);
    expect(system).toContain("Organization instructions:");
    expect(system).toContain("Answer in French");
    expect(system.indexOf("Answer in French")).toBeGreaterThan(
      system.indexOf("You are Hust."),
    );
    expect(model.doStreamCalls[0]!.temperature).toBe(0.2);
    expect(model.doStreamCalls[0]!.maxOutputTokens).toBe(800);
  });

  it("keeps a temperature of 0 instead of dropping it", async () => {
    const model = answering();
    await runTurn(model, { temperature: 0 });

    expect(model.doStreamCalls[0]!.temperature).toBe(0);
    expect(systemText(model)).toBe("You are Hust.");
  });

  it("leaves the base prompt unchanged and sends no sampling settings without an org config", async () => {
    const model = answering();
    await runTurn(model);

    expect(model.doStreamCalls).toHaveLength(1);
    expect(systemText(model)).toBe("You are Hust.");
    expect(model.doStreamCalls[0]!.temperature).toBeUndefined();
    expect(model.doStreamCalls[0]!.maxOutputTokens).toBeUndefined();
  });

  it("ignores a blank org prompt", async () => {
    const model = answering();
    await runTurn(model, { orgSystemPrompt: "   " });

    expect(systemText(model)).toBe("You are Hust.");
  });
});
