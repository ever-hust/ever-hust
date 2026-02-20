"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mail,
  Building2,
  Shield,
  User,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";

interface InvitationDetails {
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  organizationName: string;
  organizationId: number;
  createdAt: string;
}

function getRoleIcon(role: string) {
  switch (role) {
    case "admin":
      return Shield;
    default:
      return User;
  }
}

export default function InvitationAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchInvitation() {
      try {
        const res = await fetch(
          `/api/organizations/invitations/${encodeURIComponent(token)}/accept`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Failed to load invitation");
        }

        if (controller.signal.aborted) return;
        const data = (await res.json()) as { invitation: InvitationDetails };
        setInvitation(data.invitation);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load invitation"
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchInvitation();
    return () => controller.abort();
  }, [token]);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      const res = await fetch(
        `/api/organizations/invitations/${encodeURIComponent(token)}/accept`,
        { method: "POST" }
      );

      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        organizationId?: number;
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Failed to accept invitation");
        // If the invitation was already accepted or is invalid, update the UI
        if (
          data.error?.includes("already been") ||
          data.error?.includes("expired") ||
          data.error?.includes("already a member")
        ) {
          setError(data.error);
        }
        return;
      }

      setAccepted(true);
      toast.success(data.message ?? "Invitation accepted!");

      // Redirect to the organization page after a brief delay
      setTimeout(() => {
        router.push(`/organizations/${data.organizationId ?? ""}`);
      }, 1500);
    } catch {
      toast.error("Failed to accept invitation. Please try again.");
    } finally {
      setAccepting(false);
    }
  }, [token, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // Error state or invalid/expired invitation
  if (error || !invitation) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <XCircle
                className="h-8 w-8 text-destructive"
                aria-hidden="true"
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold">
                Invalid Invitation
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {error ?? "This invitation could not be found."}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/organizations">
                <ArrowLeft
                  className="mr-1.5 h-3.5 w-3.5"
                  aria-hidden="true"
                />
                Go to Organizations
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const isExpired = invitation.status === "expired";
  const isAlreadyHandled =
    invitation.status === "accepted" || invitation.status === "revoked";
  const canAccept = invitation.status === "pending" && !isExpired;
  const RoleIcon = getRoleIcon(invitation.role);

  // Already accepted state
  if (accepted) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-green-500/10 p-3">
              <CheckCircle2
                className="h-8 w-8 text-green-500"
                aria-hidden="true"
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold">
                Welcome to {invitation.organizationName}!
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You have successfully joined as{" "}
                <span className="font-medium">{invitation.role}</span>.
                Redirecting...
              </p>
            </div>
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md p-6">
        <div className="flex flex-col items-center gap-5 text-center">
          {/* Icon */}
          <div className="rounded-full bg-primary/10 p-3">
            <Mail className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-lg font-semibold">Organization Invitation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You have been invited to join an organization.
            </p>
          </div>

          {/* Invitation details */}
          <div className="w-full space-y-3 rounded-lg border p-4 text-left">
            <div className="flex items-center gap-3">
              <Building2
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="truncate text-sm font-semibold">
                  {invitation.organizationName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <RoleIcon
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Role</p>
                <Badge variant="secondary" className="mt-0.5 text-xs capitalize">
                  {invitation.role}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Mail
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Invited email</p>
                <p className="truncate text-sm">{invitation.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Expires</p>
                <p className="text-sm">
                  {new Date(invitation.expiresAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* Status indicator for non-pending invitations */}
            {(isExpired || isAlreadyHandled) && (
              <div className="mt-2 rounded-md border border-dashed px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Status:{" "}
                  <span
                    className={
                      isExpired
                        ? "text-amber-600"
                        : invitation.status === "accepted"
                          ? "text-green-600"
                          : "text-destructive"
                    }
                  >
                    {isExpired ? "Expired" : invitation.status}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex w-full flex-col gap-2">
            {canAccept ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? (
                  <Loader2
                    className="mr-1.5 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="mr-1.5 h-4 w-4"
                    aria-hidden="true"
                  />
                )}
                Accept Invitation
              </Button>
            ) : (
              <Button className="w-full" size="lg" disabled>
                {isExpired
                  ? "Invitation Expired"
                  : isAlreadyHandled
                    ? `Invitation ${invitation.status}`
                    : "Cannot Accept"}
              </Button>
            )}

            <Button variant="ghost" size="sm" asChild>
              <Link href="/organizations">
                <ArrowLeft
                  className="mr-1.5 h-3.5 w-3.5"
                  aria-hidden="true"
                />
                Go to Organizations
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
