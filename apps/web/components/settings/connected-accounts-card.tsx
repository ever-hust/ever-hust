"use client";

import { useState, useCallback } from "react";
import { Link2, Github, Linkedin, Loader2, Check, Plus, Twitter } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Badge } from "@ever-hust/ui/badge";
import { linkSocial } from "@ever-hust/auth/client";
import { toast } from "sonner";

// Inline SVG icons for providers not in lucide-react
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.025 4.388 11.022 10.125 11.927v-8.437H7.078v-3.49h3.047V9.412c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796v8.437C19.612 23.095 24 18.098 24 12.073z" />
    </svg>
  );
}

/** Social providers we support, in display order. */
const PROVIDERS = [
  {
    id: "linkedin" as const,
    label: "LinkedIn",
    icon: Linkedin,
    primary: true,
    description: "Primary account — used to create your profile",
  },
  {
    id: "google" as const,
    label: "Google",
    icon: GoogleIcon,
    primary: false,
    description: "Connect to sign in with Google",
  },
  {
    id: "github" as const,
    label: "GitHub",
    icon: Github,
    primary: false,
    description: "Connect to sign in with GitHub",
  },
  {
    id: "facebook" as const,
    label: "Facebook",
    icon: FacebookIcon,
    primary: false,
    description: "Connect to sign in with Facebook",
  },
  {
    id: "twitter" as const,
    label: "X (Twitter)",
    icon: Twitter,
    primary: false,
    description: "Connect to sign in with X",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

interface ConnectedAccount {
  providerId: string;
  createdAt: string;
}

/**
 * Settings card that shows which social providers are linked to the user's account
 * and allows connecting new ones.
 */
export function ConnectedAccountsCard() {
  const queryClient = useQueryClient();
  const [linkingProvider, setLinkingProvider] = useState<ProviderId | null>(null);

  // Fetch connected accounts from our API
  const { data: connectedAccounts = [], isLoading } = useQuery<ConnectedAccount[]>({
    queryKey: ["connected-accounts"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/accounts", { signal });
      if (!res.ok) throw new Error("Failed to load connected accounts");
      const data = await res.json();
      return data.accounts as ConnectedAccount[];
    },
    staleTime: 60_000,
  });

  const linkMutation = useMutation({
    mutationFn: async (provider: ProviderId) => {
      setLinkingProvider(provider);
      await linkSocial({
        provider,
        callbackURL: "/settings",
      });
    },
    onError: () => {
      toast.error("Failed to connect account. Please try again.");
      setLinkingProvider(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-accounts"] });
    },
  });

  const isConnected = useCallback(
    (providerId: string) =>
      connectedAccounts.some((a) => a.providerId === providerId),
    [connectedAccounts],
  );

  const handleLink = useCallback(
    (provider: ProviderId) => {
      if (linkMutation.isPending) return;
      linkMutation.mutate(provider);
    },
    [linkMutation],
  );

  return (
    <Card id="connected-accounts" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Link2 className="h-5 w-5" aria-hidden="true" />
        Connected Accounts
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage social accounts linked to your profile. You can sign in with any
        connected provider.
      </p>

      <div className="mt-4 space-y-3">
        {PROVIDERS.map((provider) => {
          const connected = isConnected(provider.id);
          const isLinking = linkingProvider === provider.id;

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                  <provider.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{provider.label}</span>
                    {provider.primary && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {provider.description}
                  </p>
                </div>
              </div>

              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : connected ? (
                <Badge
                  variant="outline"
                  className="gap-1 text-xs text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Connected
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleLink(provider.id)}
                  disabled={isLinking}
                >
                  {isLinking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground/70">
        Your LinkedIn account is always required. Additional providers give you
        more ways to sign in.
      </p>
    </Card>
  );
}
