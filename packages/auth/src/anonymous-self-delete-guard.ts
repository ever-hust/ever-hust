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
 * This stops only the endpoint. The plugin still removes the guest after
 * linking it to a real account (sign-in, sign-up and OAuth callbacks), which it
 * does through the internal adapter once migrateAnonymousUserData has moved
 * the guest's organizations. That is why the plugin's
 * disableDeleteAnonymousUser option is not used: it turns that delete off too.
 */
export const anonymousSelfDeleteGuard = createAuthMiddleware(async (ctx) => {
  if (ctx.path === DELETE_ANONYMOUS_USER_PATH) {
    throw new APIError("FORBIDDEN", { message: DELETE_ANONYMOUS_USER_REFUSED });
  }
});
