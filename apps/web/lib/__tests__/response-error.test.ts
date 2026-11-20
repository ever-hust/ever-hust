/**
 * Tests for responseErrorMessage — the text a screen shows when an API call
 * is refused. The Danger Zone card (components/settings/danger-zone-card.tsx)
 * uses it so a refused account delete shows the server's reason, such as the
 * 409 from DELETE /api/user/account for the last owner of an organization.
 */
import { responseErrorMessage } from "../response-error";

const FALLBACK = "Failed to delete account";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("responseErrorMessage", () => {
  it("returns the server's error text from a 409 body", async () => {
    const reason =
      "You are the last owner of an organization that other members still use. Transfer ownership first.";
    const res = jsonResponse(
      { error: reason, details: { organizationIds: [7] } },
      409,
    );

    await expect(responseErrorMessage(res, FALLBACK)).resolves.toBe(reason);
  });

  it("returns the fallback for a 500 with no body", async () => {
    const res = new Response(null, { status: 500 });

    await expect(responseErrorMessage(res, FALLBACK)).resolves.toBe(FALLBACK);
  });

  it("returns the fallback when the body is not JSON", async () => {
    const res = new Response("<html>Bad Gateway</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });

    await expect(responseErrorMessage(res, FALLBACK)).resolves.toBe(FALLBACK);
  });

  it("returns the fallback when the JSON body has no usable error text", async () => {
    await expect(
      responseErrorMessage(jsonResponse({ message: "nope" }, 400), FALLBACK),
    ).resolves.toBe(FALLBACK);
    await expect(
      responseErrorMessage(jsonResponse({ error: { code: 1 } }, 400), FALLBACK),
    ).resolves.toBe(FALLBACK);
    await expect(
      responseErrorMessage(jsonResponse({ error: "  " }, 400), FALLBACK),
    ).resolves.toBe(FALLBACK);
    await expect(
      responseErrorMessage(jsonResponse(null, 400), FALLBACK),
    ).resolves.toBe(FALLBACK);
  });
});
