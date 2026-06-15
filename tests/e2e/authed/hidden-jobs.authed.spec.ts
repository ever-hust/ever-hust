import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — hidden jobs", () => {
  test("hide a job, see it listed, then unhide it", async ({ request }) => {
    // Job 3 exists from the seeded corpus and is independent of the favorited/applied jobs.
    const hide = await request.post("/api/user/hidden-jobs", { data: { jobId: 3 } });
    expect(hide.status()).toBe(200);
    expect((await hide.json()).hidden).toBe(true);

    const list = await request.get("/api/user/hidden-jobs");
    expect(list.status()).toBe(200);
    const ids = (await list.json()).hiddenJobIds as number[];
    expect(ids).toContain(3);

    const unhide = await request.delete("/api/user/hidden-jobs?jobId=3");
    expect(unhide.status()).toBe(200);
  });

  test("POST rejects a malformed body", async ({ request }) => {
    const res = await request.post("/api/user/hidden-jobs", { data: { jobId: "nope" } });
    expect(res.status()).toBe(400);
  });
});
