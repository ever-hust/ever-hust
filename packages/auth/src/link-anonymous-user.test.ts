/**
 * linkAnonymousUser runs when a guest signs up or signs in. The anonymous plugin used to delete
 * the guest right after onLinkAccount, even when moving the guest's work had failed, and every
 * table the guest owns cascades on that delete. Now the guest is deleted here, only after the
 * move has committed; a failed move keeps the guest with all of its data.
 */
import { linkAnonymousUser } from "./link-anonymous-user";

const guest = { user: { id: "guest-1", isAnonymous: true } };
const account = { user: { id: "user-new", isAnonymous: false } };

function deps() {
  const calls: string[] = [];
  const migrate = jest.fn(async (from: string, to: string) => {
    calls.push(`migrate ${from} -> ${to}`);
  });
  const deleteGuest = jest.fn(async (id: string) => {
    calls.push(`delete ${id}`);
  });
  const log = { error: jest.fn() };
  return { calls, migrate, deleteGuest, log };
}

describe("linkAnonymousUser", () => {
  it("moves the guest's work, then deletes the guest", async () => {
    const d = deps();

    const result = await linkAnonymousUser(
      { anonymousUser: guest, newUser: account },
      d,
    );

    expect(result).toBe("moved");
    expect(d.calls).toEqual(["migrate guest-1 -> user-new", "delete guest-1"]);
    expect(d.log.error).not.toHaveBeenCalled();
  });

  it("keeps the guest, and everything it owns, when the move fails", async () => {
    const d = deps();
    d.migrate.mockRejectedValueOnce(new Error("connection lost"));

    const result = await linkAnonymousUser(
      { anonymousUser: guest, newUser: account },
      d,
    );

    expect(result).toBe("failed-guest-kept");
    expect(d.deleteGuest).not.toHaveBeenCalled();
    // Both ids are logged so the move can be run again.
    expect(d.log.error).toHaveBeenCalledWith(
      expect.stringMatching(/guest-1.*user-new/),
      "connection lost",
    );
  });

  it("never throws, so the sign-in goes through, when deleting the moved guest fails", async () => {
    const d = deps();
    d.deleteGuest.mockRejectedValueOnce(new Error("timeout"));

    await expect(
      linkAnonymousUser({ anonymousUser: guest, newUser: account }, d),
    ).resolves.toBe("moved-guest-kept");
    expect(d.migrate).toHaveBeenCalledTimes(1);
  });

  it("reads ids from a bare user as well as from a session", async () => {
    const d = deps();

    await linkAnonymousUser(
      { anonymousUser: { id: "guest-1" }, newUser: { id: "user-new" } },
      d,
    );

    expect(d.calls).toEqual(["migrate guest-1 -> user-new", "delete guest-1"]);
  });

  it.each([
    ["the account is the guest itself", guest],
    ["the new user is another guest", { user: { id: "guest-2", isAnonymous: true } }],
    ["the new user has no id", { user: {} }],
  ])("does nothing when %s", async (_case, newUser) => {
    const d = deps();

    const result = await linkAnonymousUser({ anonymousUser: guest, newUser }, d);

    expect(result).toBe("skipped");
    expect(d.calls).toEqual([]);
  });
});
