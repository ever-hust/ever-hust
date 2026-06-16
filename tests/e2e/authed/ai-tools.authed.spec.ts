import { test, expect } from "@playwright/test";

// Real-LLM E2E: exercises the orchestrator + tools end-to-end against a live model.
// Gated on an LLM key so the suite stays green where no key is configured; lights up in CI
// once OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) is set as a secret.
const HAS_LLM = !!process.env.OPENROUTER_API_KEY || !!process.env.ANTHROPIC_API_KEY;

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("AI tools — real LLM", () => {
  test.skip(
    !HAS_LLM,
    "Set OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) to run real-LLM E2E."
  );

  test("chat streams a response and invokes searchJobs for a job query", async ({
    request,
  }) => {
    const res = await request.post("/api/ai/chat", {
      data: {
        messages: [
          {
            id: "1",
            role: "user",
            content: "Search for software engineer jobs",
            parts: [{ type: "text", text: "Search for software engineer jobs" }],
          },
        ],
      },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    // The model should pick the searchJobs tool for a job-search request.
    expect(body).toContain("searchJobs");
  });

  test("chat streams an end-to-end response for an evaluation request", async ({ request }) => {
    const res = await request.post("/api/ai/chat", {
      data: {
        messages: [
          {
            id: "1",
            role: "user",
            content: "Is job number 1 a good fit for me? Use the evaluation tool.",
            parts: [
              {
                type: "text",
                text: "Is job number 1 a good fit for me? Use the evaluation tool.",
              },
            ],
          },
        ],
      },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.text();
    // The real model may call evaluateJob or answer conversationally — tool choice is
    // non-deterministic, so assert the orchestrator streamed a real SSE response rather than
    // requiring a specific tool. (searchJobs above covers deterministic tool invocation.)
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/"type"\s*:/);
  });
});
