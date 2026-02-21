"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Users, Crown, Shield, User, Loader2 } from "lucide-react";
import { Badge } from "@ever-hust/ui/badge";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { Separator } from "@ever-hust/ui/separator";
import { toast } from "sonner";
import Link from "next/link";

interface OrgMembership {
  organization: {
    id: number;
    name: string;
    slug: string;
    planType: string;
  };
  role: string;
  joinedAt: string;
}

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

export function OrganizationCard() {
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  const loadOrgs = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/organizations", { signal });
      if (res.ok && !signal?.aborted) {
        const data = (await res.json()) as { organizations: OrgMembership[] };
        setOrgs(data.organizations);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load organizations:", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOrgs(controller.signal);
    return () => controller.abort();
  }, [loadOrgs]);

  const handleCreate = useCallback(async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      if (res.ok) {
        toast.success("Organization created");
        setNewOrgName("");
        setShowCreate(false);
        await loadOrgs();
      } else {
        const errorData = (await res.json()) as { error?: string };
        toast.error(errorData.error ?? "Failed to create organization");
      }
    } catch {
      toast.error("Failed to create organization");
    } finally {
      setCreating(false);
    }
  }, [newOrgName, loadOrgs]);

  if (loading) {
    return (
      <Card id="organizations" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5" aria-hidden="true" />
          Organizations
        </h2>
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Loading organizations...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card id="organizations" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Building2 className="h-5 w-5" aria-hidden="true" />
        Organizations
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Manage your team and organization accounts.
      </p>

      <div className="mt-4">
        {orgs.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center">
            <Building2
              className="mx-auto h-8 w-8 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              You are not part of any organization yet.
            </p>
            {!showCreate && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowCreate(true)}
              >
                Create Organization
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-2" role="list">
            {orgs.map((membership) => {
              const RoleIcon = getRoleIcon(membership.role);
              return (
                <li
                  key={membership.organization.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {membership.organization.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {membership.organization.planType} plan
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={getRoleBadgeVariant(membership.role)}
                      className="gap-1 text-[10px]"
                    >
                      <RoleIcon className="h-3 w-3" aria-hidden="true" />
                      {membership.role}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link href={`/organizations/${membership.organization.id}`}>
                        Manage
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {orgs.length > 0 && !showCreate && (
          <>
            <Separator className="my-4" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreate(true)}
            >
              Create New Organization
            </Button>
          </>
        )}

        {showCreate && (
          <>
            <Separator className="my-4" />
            <div>
              <p className="text-sm font-medium">Create Organization</p>
              <div className="mt-2 flex gap-2">
                <Input
                  type="text"
                  placeholder="Organization name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  disabled={creating}
                  maxLength={100}
                  aria-label="Organization name"
                />
                <Button
                  onClick={handleCreate}
                  disabled={creating || !newOrgName.trim()}
                  className="shrink-0"
                >
                  {creating ? (
                    <Loader2
                      className="mr-1.5 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Building2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  )}
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    setNewOrgName("");
                  }}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}

        {orgs.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Member of {orgs.length} organization{orgs.length !== 1 ? "s" : ""}
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
