"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  SearchX,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ever-hust/ui/card";
import { Button } from "@ever-hust/ui/button";
import { Badge } from "@ever-hust/ui/badge";
import { Input } from "@ever-hust/ui/input";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import type { UserRole } from "@ever-hust/db/schema";

interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  subscriptionStatus: string;
  createdAt: string;
}

interface UsersResponse {
  users: UserRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const ROLES: UserRole[] = ["user", "recruiter", "admin"];

function subscriptionBadgeVariant(status: string) {
  switch (status) {
    case "active":
      return "default" as const;
    case "past_due":
      return "destructive" as const;
    case "canceled":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (search) params.set("search", search);

    const result = await apiFetch<UsersResponse>(
      `/api/admin/users?${params.toString()}`,
    );
    if (result) {
      setData(result);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingRole(userId);
    const result = await apiMutate<{ id: string; role: string }>(
      `/api/admin/users/${userId}/role`,
      {
        method: "PATCH",
        body: { role: newRole },
      },
    );

    if (result) {
      // Update the local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === userId ? { ...u, role: newRole } : u,
          ),
        };
      });
    }
    setUpdatingRole(null);
  };

  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          View, search, and manage user roles across the platform.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            {pagination
              ? `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} users`
              : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40 mb-1" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : data?.users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                {search ? (
                  <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {search ? "No users match your search" : "No users found"}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {search
                  ? `No users found matching "${search}". Try a different name or email address.`
                  : "There are no registered users on the platform yet."}
              </p>
              {search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    setPage(1);
                  }}
                >
                  Clear Search
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto] gap-4 pb-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>User</span>
                <span className="w-28 text-center">Role</span>
                <span className="w-24 text-center">Plan</span>
                <span className="w-24 text-right">Joined</span>
              </div>

              {/* Table rows */}
              <div className="divide-y">
                {data?.users.map((user) => {
                  return (
                    <div
                      key={user.id}
                      className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 py-4 items-center"
                    >
                      {/* User info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      {/* Role selector */}
                      <div className="w-28 flex justify-center">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(
                              user.id,
                              e.target.value as UserRole,
                            )
                          }
                          disabled={updatingRole === user.id}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          aria-label={`Change role for ${user.name}`}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Subscription status */}
                      <div className="w-24 flex justify-center">
                        <Badge
                          variant={subscriptionBadgeVariant(
                            user.subscriptionStatus,
                          )}
                        >
                          {user.subscriptionStatus}
                        </Badge>
                      </div>

                      {/* Joined date */}
                      <div className="w-24 text-right">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={pagination.page >= pagination.totalPages || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
