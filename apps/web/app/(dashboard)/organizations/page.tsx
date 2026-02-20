"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Building2,
  Users,
  Crown,
  Shield,
  User,
  Loader2,
  Plus,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";

interface OrgMembership {
  organization: {
    id: number;
    name: string;
    slug: string;
    planType: string;
    maxMembers: number;
    createdAt: string;
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

export default function OrganizationsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const loadOrgs = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const res = await fetch("/api/organizations", { signal });
      if (!res.ok) throw new Error("Failed to load organizations");
      if (signal?.aborted) return;
      const data = (await res.json()) as { organizations: OrgMembership[] };
      setOrgs(data.organizations);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadOrgs(controller.signal);
    return () => controller.abort();
  }, [loadOrgs, retryKey]);

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
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errorData.error ?? "Failed to create organization");
      }
    } catch {
      toast.error("Failed to create organization");
    } finally {
      setCreating(false);
    }
  }, [newOrgName, loadOrgs]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={Building2}
        title="Organizations"
        description="Manage your team and organization accounts."
        count={!loading ? orgs.length : undefined}
        actions={
          !showCreate ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New Organization
            </Button>
          ) : undefined
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Create form */}
        {showCreate && (
          <Card className="mb-6 p-4">
            <h2 className="text-sm font-medium">Create Organization</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Give your organization a name to get started.
            </p>
            <div className="mt-3 flex gap-2">
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
                  if (e.key === "Escape") {
                    setShowCreate(false);
                    setNewOrgName("");
                  }
                }}
                disabled={creating}
                maxLength={100}
                autoFocus
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
                  <Building2
                    className="mr-1.5 h-4 w-4"
                    aria-hidden="true"
                  />
                )}
                Create
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false);
                  setNewOrgName("");
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        ) : orgs.length === 0 && !showCreate ? (
          <EmptyState
            icon={Building2}
            title="No organizations yet"
            description="Create an organization to collaborate with your team."
          >
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Create Organization
            </Button>
          </EmptyState>
        ) : (
          <ul className="space-y-3" role="list" aria-label="Organizations">
            {orgs.map((membership) => {
              const RoleIcon = getRoleIcon(membership.role);
              return (
                <li key={membership.organization.id}>
                  <Link href={`/organizations/${membership.organization.id}`}>
                    <Card className="p-4 transition-colors hover:bg-accent/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                            <Building2
                              className="h-5 w-5 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {membership.organization.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {membership.organization.slug} · {membership.organization.planType} plan
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={getRoleBadgeVariant(membership.role)}
                            className="gap-1 text-[10px]"
                          >
                            <RoleIcon
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {membership.role}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>
                              {membership.organization.maxMembers} max
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
