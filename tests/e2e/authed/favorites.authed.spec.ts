import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — favorites", () => {
  test("toggle a favorite on, see it listed, then remove it", async ({ request }) => {
    // Job 1 exists from the seeded corpus.
    const add = await request.post("/api/user/favorites", { data: { jobId: 1 } });
    expect(add.status()).toBe(200);

    const list = await request.get("/api/user/favorites");
    expect(list.status()).toBe(200);
    const ids = (await list.json()).favoriteJobIds as number[];
    expect(ids).toContain(1);

    const remove = await request.delete("/api/user/favorites", {
      data: { jobId: 1 },
    });
    expect(remove.status()).toBe(200);
  });
});
