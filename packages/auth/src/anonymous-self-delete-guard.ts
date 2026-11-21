import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * The anonymous plugin's own self-delete endpoint, mounted with every other
 * auth endpoint at POST /api/auth/delete-anonymous-user. It deletes the guest
 * row straight away, and organizations.created_by_id cascades on that delete:
 * an organization a guest created goes with them, with its members,
 * invitations, AI config and branding, even after real users joined it. The
 * hand-over of created_by_id and the last-owner check in
 * DELETE /api/user/account never run on this path.
 */
export const DELETE_ANONYMOUS_USER_PATH = "/delete-anonymous-user";

export const DELETE_ANONYMOUS_USER_REFUSED =
  "Delete your guest account from Settings > Danger Zone > Delete Account, which first hands organizations other members use to one of them.";

/**
 * Global before hook: refuses the guest self-delete endpoint with 403 so a
 * guest deletes their account through DELETE /api/user/account instead, and
 * lets every other auth endpoint through.
 *
 * The plugin's disableDeleteAnonymousUser option is on as well (it also
 * refuses this endpoint, with 400), but it is set for the guest delete after
 * sign-up: linkAnonymousUser deletes the guest itself, only once its work has
 * moved. This hook keeps the endpoint refused with a clear 403 either way.
 */
export const anonymousSelfDeleteGuard = createAuthMiddleware(async (ctx) => {
  if (ctx.path === DELETE_ANONYMOUS_USER_PATH) {
    throw new APIError("FORBIDDEN", { message: DELETE_ANONYMOUS_USER_REFUSED });
  }
});
