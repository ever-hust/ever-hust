import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — applications pipeline (#2)", () => {
  test("lists the seeded applications with pipeline stages", async ({ request }) => {
    const res = await request.get("/api/user/applications");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.applications)).toBe(true);
    expect(body.applications.length).toBeGreaterThanOrEqual(2);
    // The pipeline stage is surfaced on each row.
    expect(body.applications[0]).toHaveProperty("pipelineStage");
  });

  test("moves an application to a new pipeline stage (PATCH)", async ({ request }) => {
    const list = await request.get("/api/user/applications");
    const apps = (await list.json()).applications as { id: number }[];
    const target = apps[0]!.id;

    const patch = await request.patch(`/api/user/applications/${target}`, {
      data: { stage: "offer" },
    });
    expect(patch.status()).toBe(200);
    const result = await patch.json();
    expect(result.stage).toBe("offer");

    const rejected = await request.patch(`/api/user/applications/${target}`, {
      data: { stage: "not-a-real-stage" },
    });
    expect(rejected.status()).toBe(400);
  });
});
