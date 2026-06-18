"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Key, Copy, Trash2, Loader2, Shield, Plus, AlertTriangle, Book } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Badge } from "@ever-hust/ui/badge";
import { Input } from "@ever-hust/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ever-hust/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ever-hust/ui/alert-dialog";
import { toast } from "sonner";
import { APP_NAME } from "@ever-hust/utils";

interface ApiKeyRecord {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export function DeveloperApiCard() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<ApiKeyRecord | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const { data: keys = [], isLoading: loading } = useQuery<ApiKeyRecord[]>({
    queryKey: ["developer-keys"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/developer/keys", { signal });
      if (!res.ok) throw new Error("Failed to load API keys");
      const data = await res.json();
      return (data.keys as ApiKeyRecord[]).filter((k: ApiKeyRecord) => k.isActive);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: ["read"],
          rateLimit: 1000,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ?? "Failed to create API key"
        );
      }
      const data = await res.json();
      return data.key as string;
    },
    onSuccess: (key) => {
      setNewlyCreatedKey(key);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["developer-keys"] });
      toast.success("API key created successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create API key");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await fetch(`/api/developer/keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to revoke API key");
      }
      return keyId;
    },
    onMutate: async (keyId: number) => {
      await queryClient.cancelQueries({ queryKey: ["developer-keys"] });
      const prev = queryClient.getQueryData<ApiKeyRecord[]>(["developer-keys"]);
      queryClient.setQueryData<ApiKeyRecord[]>(["developer-keys"], (old) =>
        old ? old.filter((k) => k.id !== keyId) : old,
      );
      return { prev };
    },
    onError: (_err, _keyId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["developer-keys"], context.prev);
      }
      toast.error("Failed to revoke API key");
    },
    onSuccess: () => {
      toast.success("API key revoked");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-keys"] });
    },
  });

  const handleCreate = useCallback(() => {
    if (!newKeyName.trim()) {
      toast.error("Please provide a name for the API key");
      return;
    }
    createMutation.mutate(newKeyName.trim());
  }, [newKeyName, createMutation]);

  const handleCopy = useCallback(async () => {
    if (!newlyCreatedKey) return;
    try {
      await navigator.clipboard.writeText(newlyCreatedKey);
      setCopied(true);
      toast.success("API key copied to clipboard");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [newlyCreatedKey]);

  const handleCloseCreateDialog = useCallback(() => {
    setShowCreateDialog(false);
    setNewKeyName("");
    setNewlyCreatedKey(null);
    setCopied(false);
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card id="developer-api" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Shield className="h-5 w-5" aria-hidden="true" />
        Developer API
      </h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Create API keys to access the {APP_NAME} API programmatically. Use
          these keys to search jobs, retrieve company data, and get salary
          insights from your own applications.
        </p>

        {/* Create Key Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Create API Key
        </Button>

        {/* Keys List */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Loading API keys...</span>
          </div>
        ) : keys.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No API keys yet. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium">{apiKey.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {apiKey.keyPrefix}...
                    </code>
                    {apiKey.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>
                      Created {formatDate(apiKey.createdAt)}
                    </span>
                    <span>
                      Last used {formatDate(apiKey.lastUsedAt)}
                    </span>
                    <span>{apiKey.rateLimit} req/hr</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setRevokeConfirm(apiKey)}
                  disabled={revokeMutation.isPending}
                  aria-label={`Revoke ${apiKey.name}`}
                >
                  {revokeMutation.isPending && revokeMutation.variables === apiKey.id ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* API Docs hint */}
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Base URL:</strong>{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              /api/v1
            </code>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong>Endpoints:</strong>{" "}
            <code className="rounded bg-muted px-1 py-0.5">GET /jobs</code>
            {" "}
            <code className="rounded bg-muted px-1 py-0.5">
              GET /jobs/:id
            </code>
            {" "}
            <code className="rounded bg-muted px-1 py-0.5">
              GET /companies
            </code>
            {" "}
            <code className="rounded bg-muted px-1 py-0.5">GET /salary</code>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong>Auth:</strong>{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              Authorization: Bearer ej_live_...
            </code>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="https://docs.hust.so" target="_blank" rel="noopener noreferrer">
                <Book className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                View API Docs
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                API Reference
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/swg" target="_blank" rel="noopener noreferrer">
                Swagger UI
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeConfirm !== null} onOpenChange={(open) => { if (!open) setRevokeConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke <strong>{revokeConfirm?.name}</strong> ({revokeConfirm?.keyPrefix}...)? This action cannot be undone and any applications using this key will immediately lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeConfirm) {
                  revokeMutation.mutate(revokeConfirm.id);
                  setRevokeConfirm(null);
                }
              }}
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={handleCloseCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newlyCreatedKey ? "API Key Created" : "Create API Key"}
            </DialogTitle>
            <DialogDescription>
              {newlyCreatedKey
                ? "Copy your API key now. You will not be able to see it again."
                : "Give your API key a name to help you identify it later."}
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedKey ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                <AlertTriangle
                  className="h-4 w-4 flex-shrink-0 text-amber-500"
                  aria-hidden="true"
                />
                <p className="text-xs text-muted-foreground">
                  Store this key securely. It cannot be displayed again after
                  you close this dialog.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden rounded bg-muted px-3 py-2 text-xs break-all">
                  {newlyCreatedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy API key"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCloseCreateDialog}
                  variant={copied ? "default" : "outline"}
                >
                  {copied ? "Done" : "Close"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="api-key-name"
                  className="text-sm font-medium"
                >
                  Key Name
                </label>
                <Input
                  id="api-key-name"
                  placeholder="e.g., Production API Key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={100}
                  className="mt-1"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCloseCreateDialog}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newKeyName.trim()}
                >
                  {createMutation.isPending ? (
                    <Loader2
                      className="mr-1.5 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Key
                      className="mr-1.5 h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                  Create Key
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
