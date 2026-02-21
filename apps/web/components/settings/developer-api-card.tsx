"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Key, Copy, Trash2, Loader2, Shield, Plus, AlertTriangle, Book } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/alert-dialog";
import { toast } from "sonner";
import Link from "next/link";

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
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);
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

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/developer/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(
          (data.keys as ApiKeyRecord[]).filter((k: ApiKeyRecord) => k.isActive)
        );
      }
    } catch {
      // Non-critical on load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) {
      toast.error("Please provide a name for the API key");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: ["read"],
          rateLimit: 1000,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewlyCreatedKey(data.key as string);
        setNewKeyName("");
        // Reload keys list
        await loadKeys();
        toast.success("API key created successfully");
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(
          (errData as { error?: string }).error ?? "Failed to create API key"
        );
      }
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  }, [newKeyName, loadKeys]);

  const handleRevoke = useCallback(
    async (keyId: number) => {
      setRevoking(keyId);
      try {
        const res = await fetch(`/api/developer/keys/${keyId}`, {
          method: "DELETE",
        });

        if (res.ok || res.status === 204) {
          setKeys((prev) => prev.filter((k) => k.id !== keyId));
          toast.success("API key revoked");
        } else {
          toast.error("Failed to revoke API key");
        }
      } catch {
        toast.error("Failed to revoke API key");
      } finally {
        setRevoking(null);
      }
    },
    []
  );

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
          Create API keys to access the Ever Jobs API programmatically. Use
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
                  disabled={revoking === apiKey.id}
                  aria-label={`Revoke ${apiKey.name}`}
                >
                  {revoking === apiKey.id ? (
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
          <div className="mt-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/api-docs">
                <Book className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                View API Docs
              </Link>
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
                  handleRevoke(revokeConfirm.id);
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
                  disabled={creating || !newKeyName.trim()}
                >
                  {creating ? (
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
