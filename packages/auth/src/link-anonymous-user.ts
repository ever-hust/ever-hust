/**
 * What happens when a guest (anonymous user) signs up or signs in: their work
 * moves to the account, then the guest is deleted.
 *
 * The anonymous plugin deletes the guest itself after onLinkAccount unless
 * disableDeleteAnonymousUser is set, and it does so even when the move failed
 * (onLinkAccount must not throw, or the sign-in fails). Every table the guest
 * owns cascades on that delete, so a failed move lost all of the guest's
 * chats, saved jobs, applications, alerts and organizations. Hust sets
 * disableDeleteAnonymousUser and deletes the guest here, only once the move
 * has committed.
 */

type LinkedUser = { user?: { id?: string; isAnonymous?: boolean | null }; id?: string };

export type LinkAnonymousUserDeps = {
  /** Moves the guest's work to the account in one transaction (migrateAnonymousUserData). */
  migrate: (fromId: string, toId: string) => Promise<void>;
  /** Deletes the guest the way the plugin would (ctx.context.internalAdapter.deleteUser). */
  deleteGuest: (guestId: string) => Promise<void>;
  log?: Pick<Console, "error">;
};

export type LinkAnonymousUserResult =
  | "skipped"
  | "moved"
  | "moved-guest-kept"
  | "failed-guest-kept";

function pickUser(v: LinkedUser | undefined) {
  return {
    id: v?.user?.id ?? v?.id,
    isAnonymous: Boolean(v?.user?.isAnonymous),
  };
}

/**
 * Never throws, so sign-up and sign-in always succeed. When the move fails the
 * guest is kept with everything it owns and both ids are logged, so the move
 * can be re-run (migrateAnonymousUserData is safe to run again) instead of the
 * work being gone.
 */
export async function linkAnonymousUser(
  { anonymousUser, newUser }: { anonymousUser: unknown; newUser: unknown },
  { migrate, deleteGuest, log = console }: LinkAnonymousUserDeps,
): Promise<LinkAnonymousUserResult> {
  const guest = pickUser(anonymousUser as LinkedUser);
  const account = pickUser(newUser as LinkedUser);
  // Same skips as the plugin's own delete: nothing to move into the guest
  // itself or into another guest.
  if (!guest.id || !account.id || guest.id === account.id || account.isAnonymous) {
    return "skipped";
  }

  try {
    await migrate(guest.id, account.id);
  } catch (error) {
    log.error(
      `[Auth] Failed to move guest ${guest.id} to account ${account.id}; the guest and its data are kept:`,
      error instanceof Error ? error.message : error,
    );
    return "failed-guest-kept";
  }

  try {
    await deleteGuest(guest.id);
  } catch (error) {
    // The work has moved; only the empty guest row is left behind.
    log.error(
      `[Auth] Moved guest ${guest.id} to account ${account.id} but could not delete the guest:`,
      error instanceof Error ? error.message : error,
    );
    return "moved-guest-kept";
  }
  return "moved";
}
