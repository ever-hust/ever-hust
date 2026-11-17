import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@ever-hust/db/client";
import * as schema from "@ever-hust/db/schema";

type OrgRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2 };

/**
 * Carries a guest's (anonymous user's) work over to the account they sign up
 * or sign in with. The anonymous plugin deletes the guest right after this.
 */
export async function migrateAnonymousUserData(
  db: Database,
  fromId: string,
  toId: string,
): Promise<void> {
  if (!fromId || !toId || fromId === toId) return;

  // organizations.created_by_id, organization_members.user_id and
  // organization_invitations.invited_by_id are ON DELETE CASCADE, so without
  // this the guest delete takes the organization, every member's membership,
  // its invitations, AI config and branding with it. Runs first, in its own
  // transaction, so a failed move below can't skip it.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.organizations)
      .set({ createdById: toId, updatedAt: new Date() })
      .where(eq(schema.organizations.createdById, fromId));
    await tx
      .update(schema.organizationInvitations)
      .set({ invitedById: toId })
      .where(eq(schema.organizationInvitations.invitedById, fromId));

    const guestMemberships = await tx
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, fromId));
    if (guestMemberships.length === 0) return;

    // (organization_id, user_id) is unique: where the account is already a
    // member, keep its row with the higher role and drop the guest's.
    const existing = await tx
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.userId, toId),
          inArray(
            schema.organizationMembers.organizationId,
            guestMemberships.map((m) => m.organizationId),
          ),
        ),
      );
    for (const guest of guestMemberships) {
      const own = existing.find(
        (m) => m.organizationId === guest.organizationId,
      );
      if (!own) {
        await tx
          .update(schema.organizationMembers)
          .set({ userId: toId })
          .where(eq(schema.organizationMembers.id, guest.id));
        continue;
      }
      if (ROLE_RANK[guest.role] < ROLE_RANK[own.role]) {
        await tx
          .update(schema.organizationMembers)
          .set({ role: guest.role })
          .where(eq(schema.organizationMembers.id, own.id));
      }
      await tx
        .delete(schema.organizationMembers)
        .where(eq(schema.organizationMembers.id, guest.id));
    }
  });

  // Re-point the guest's user-owned rows to the permanent account. These
  // tables cascade on the guest delete too, so they move in one transaction:
  // a failure can't leave some moved and the rest deleted with the guest.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.chatSessions)
      .set({ userId: toId })
      .where(eq(schema.chatSessions.userId, fromId));

    // (user_id, job_id) is unique: where the account already has the job,
    // keep the account's row and drop the guest's, then move the rest.
    const guestJobs = await tx
      .select({ jobId: schema.userJobs.jobId })
      .from(schema.userJobs)
      .where(eq(schema.userJobs.userId, fromId));
    if (guestJobs.length > 0) {
      const ownJobs = await tx
        .select({ jobId: schema.userJobs.jobId })
        .from(schema.userJobs)
        .where(
          and(
            eq(schema.userJobs.userId, toId),
            inArray(
              schema.userJobs.jobId,
              guestJobs.map((j) => j.jobId),
            ),
          ),
        );
      if (ownJobs.length > 0) {
        await tx.delete(schema.userJobs).where(
          and(
            eq(schema.userJobs.userId, fromId),
            inArray(
              schema.userJobs.jobId,
              ownJobs.map((j) => j.jobId),
            ),
          ),
        );
      }
      await tx
        .update(schema.userJobs)
        .set({ userId: toId })
        .where(eq(schema.userJobs.userId, fromId));
    }

    await tx
      .update(schema.applications)
      .set({ userId: toId })
      .where(eq(schema.applications.userId, fromId));
    await tx
      .update(schema.userAlerts)
      .set({ userId: toId })
      .where(eq(schema.userAlerts.userId, fromId));
  });
}
