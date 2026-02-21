"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Building2,
  Users,
  Crown,
  Shield,
  User,
  Loader2,
  Mail,
  Trash2,
  Clock,
  ArrowLeft,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/alert-dialog";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { safeExternalUrl } from "@/lib/safe-url";

interface Organization {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  website: string | null;
  planType: string;
  maxMembers: number;
  createdAt: string;
}

interface Member {
  id: number;
  userId: string;
  role: string;
  joinedAt: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

interface Invitation {
  id: number;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

type OrgRole = "owner" | "admin" | "member";

function getRoleIcon(role: string) {
  switch (role) {
    case "owner":
      return Crown;
    case "admin":
      return Shield;
    default:
      return User;
  }
}

function getRoleBadgeVariant(
  role: string
): "default" | "secondary" | "outline" {
  switch (role) {
    case "owner":
      return "default";
    case "admin":
      return "secondary";
    default:
      return "outline";
  }
}

export default function OrgDetailPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const scrollRef = useRef<HTMLDivElement>(null);

  const [org, setOrg] = useState<Organization | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [currentUserRole, setCurrentUserRole] = useState<OrgRole>("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  // Action states
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const isAdmin = currentUserRole === "owner" || currentUserRole === "admin";

  const loadOrg = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        const [orgRes, membersRes] = await Promise.all([
          fetch(`/api/organizations/${orgId}`, { signal }),
          fetch(`/api/organizations/${orgId}/members`, { signal }),
        ]);

        if (!orgRes.ok) {
          if (orgRes.status === 403) throw new Error("You do not have access to this organization");
          throw new Error("Failed to load organization");
        }
        if (signal?.aborted) return;

        const orgData = (await orgRes.json()) as {
          organization: Organization;
          memberCount: number;
          currentUserRole: OrgRole;
        };
        setOrg(orgData.organization);
        setMemberCount(orgData.memberCount);
        setCurrentUserRole(orgData.currentUserRole);

        if (membersRes.ok && !signal?.aborted) {
          const membersData = (await membersRes.json()) as {
            members: Member[];
            invitations: Invitation[];
          };
          setMembers(membersData.members);
          setInvitations(membersData.invitations ?? []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [orgId]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadOrg(controller.signal);
    return () => controller.abort();
  }, [loadOrg, retryKey]);

  const handleInvite = useCallback(async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    // Basic email format validation before sending to server
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        toast.success(`Invitation sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
        setInviteRole("member");
        await loadOrg();
      } else {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errorData.error ?? "Failed to send invitation");
      }
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, orgId, loadOrg]);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      setRemovingUserId(userId);
      try {
        const res = await fetch(
          `/api/organizations/${orgId}/members/${userId}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          toast.success("Member removed");
          setMembers((prev) => prev.filter((m) => m.userId !== userId));
          setMemberCount((c) => Math.max(0, c - 1));
        } else {
          const errorData = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(errorData.error ?? "Failed to remove member");
        }
      } catch {
        toast.error("Failed to remove member");
      } finally {
        setRemovingUserId(null);
      }
    },
    [orgId]
  );

  if (loading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b px-4 py-4 sm:px-6">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          icon={Building2}
          title="Organization"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/organizations">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Back
              </Link>
            </Button>
          }
        />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorState
            message={error ?? "Organization not found"}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={Building2}
        title={org.name}
        description={`${org.slug} · ${org.planType} plan`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/organizations">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Back
            </Link>
          </Button>
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Org info card */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Organization Info
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold">{memberCount}</p>
                <p className="text-[10px] text-muted-foreground">Members</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold">{org.maxMembers}</p>
                <p className="text-[10px] text-muted-foreground">Max Members</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <Badge variant="secondary" className="text-xs">
                  {org.planType}
                </Badge>
                <p className="mt-1 text-[10px] text-muted-foreground">Plan</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <Badge
                  variant={getRoleBadgeVariant(currentUserRole)}
                  className="text-xs"
                >
                  {currentUserRole}
                </Badge>
                <p className="mt-1 text-[10px] text-muted-foreground">Your Role</p>
              </div>
            </div>
            {safeExternalUrl(org.website) && (
              <p className="mt-3 text-xs text-muted-foreground">
                Website:{" "}
                <a
                  href={safeExternalUrl(org.website)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {org.website}
                </a>
              </p>
            )}
          </Card>

          {/* Members list */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" aria-hidden="true" />
              Members
              <Badge variant="secondary" className="text-[10px]">
                {members.length}
              </Badge>
            </h2>

            <ul className="mt-3 space-y-2" role="list">
              {members.map((member) => {
                const RoleIcon = getRoleIcon(member.role);
                const isRemoving = removingUserId === member.userId;

                return (
                  <li
                    key={member.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
                        {(() => {
                          const safeImage = safeExternalUrl(member.userImage);
                          return safeImage ? (
                            <img
                              src={safeImage}
                              alt={member.userName}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <User
                              className="h-4 w-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          );
                        })()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.userName}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {member.userEmail}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={getRoleBadgeVariant(member.role)}
                        className="gap-1 text-[10px]"
                      >
                        <RoleIcon className="h-3 w-3" aria-hidden="true" />
                        {member.role}
                      </Badge>
                      {isAdmin && member.role !== "owner" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${member.userName}`}
                              disabled={isRemoving}
                            >
                              {isRemoving ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remove {member.userName}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove them from the organization.
                                They can be re-invited later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() =>
                                  handleRemoveMember(member.userId)
                                }
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Invite member form (owner/admin only) */}
          {isAdmin && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="h-4 w-4" aria-hidden="true" />
                Invite Member
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Send an invitation email to add a new team member.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleInvite();
                    }
                  }}
                  disabled={inviting}
                  maxLength={320}
                  className="flex-1"
                  aria-label="Invitee email address"
                />
                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as "admin" | "member")
                    }
                    disabled={inviting}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    aria-label="Invitee role"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="shrink-0"
                  >
                    {inviting ? (
                      <Loader2
                        className="mr-1.5 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Mail
                        className="mr-1.5 h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                    Invite
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Pending invitations (owner/admin only) */}
          {isAdmin && invitations.length > 0 && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Pending Invitations
                <Badge variant="secondary" className="text-[10px]">
                  {invitations.length}
                </Badge>
              </h2>

              <ul className="mt-3 space-y-2" role="list">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{inv.email}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Expires{" "}
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px]"
                    >
                      {inv.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
