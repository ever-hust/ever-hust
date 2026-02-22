"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Gift,
  Copy,
  Check,
  Share2,
  Loader2,
  Users,
  Coins,
  Send,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ever-hust/ui/badge";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { Separator } from "@ever-hust/ui/separator";
import { toast } from "sonner";
import { APP_NAME } from "@ever-hust/utils";

interface Referral {
  id: number;
  referredEmail: string | null;
  status: string;
  creditAmount: number;
  createdAt: string;
  completedAt: string | null;
}

interface ReferralCredits {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

interface ReferralData {
  referralCode: string;
  referrals: Referral[];
  credits: ReferralCredits;
}

function getStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" {
  switch (status) {
    case "credited":
      return "default";
    case "signed_up":
      return "outline";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "credited":
      return "Credited";
    case "signed_up":
      return "Signed Up";
    default:
      return "Pending";
  }
}

export function ReferralProgramCard() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const { data, isLoading: loading } = useQuery<ReferralData>({
    queryKey: ["referrals"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/referrals", { signal });
      if (!res.ok) throw new Error("Failed to load referral data");
      return res.json() as Promise<ReferralData>;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/referrals/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string };
        throw new Error(errorData.error ?? "Failed to create invite");
      }
    },
    onSuccess: (_data, email) => {
      toast.success(`Referral invite created for ${email}`);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create invite");
    },
  });

  const referralLink =
    typeof window !== "undefined" && data
      ? `${window.location.origin}/signup?ref=${data.referralCode}`
      : "";

  const handleCopy = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied to clipboard");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }, [referralLink]);

  const handleShare = useCallback(async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${APP_NAME}`,
          text: `Check out ${APP_NAME} - an AI-powered job search platform! Sign up with my referral link and we both earn credits.`,
          url: referralLink,
        });
      } catch (err) {
        // User cancelled share — not an error
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error("Failed to share");
        }
      }
    } else {
      await handleCopy();
    }
  }, [referralLink, handleCopy]);

  const handleInvite = useCallback(() => {
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    inviteMutation.mutate(trimmed);
  }, [inviteEmail, inviteMutation]);

  // Compute stats from referrals (exclude the placeholder entry without an email)
  const sentInvites = data
    ? data.referrals.filter((r) => r.referredEmail !== null).length
    : 0;
  const successfulReferrals = data
    ? data.referrals.filter(
        (r) => r.status === "signed_up" || r.status === "credited",
      ).length
    : 0;

  if (loading) {
    return (
      <Card id="referrals" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Gift className="h-5 w-5" aria-hidden="true" />
          Referral Program
        </h2>
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Loading referral data...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card id="referrals" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Gift className="h-5 w-5" aria-hidden="true" />
        Referral Program
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Invite friends to {APP_NAME} and earn credits when they sign up.
      </p>

      <div className="mt-4">
        {/* Referral Link */}
        <div>
          <p className="text-sm font-medium">Your Referral Link</p>
          <div className="mt-1.5 flex gap-2">
            <Input
              readOnly
              value={referralLink}
              className="font-mono text-xs"
              onClick={handleCopy}
              aria-label="Referral link"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label={copied ? "Copied" : "Copy referral link"}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleShare}
              aria-label="Share referral link"
              className="shrink-0"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Credit Balance */}
        <div>
          <p className="text-sm font-medium">Credit Balance</p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div className="rounded-md border p-3 text-center">
              <Coins
                className="mx-auto h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-1 text-lg font-semibold">
                {data?.credits.balance ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Available</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="mt-1 text-lg font-semibold text-green-600 dark:text-green-400">
                {data?.credits.totalEarned ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Total Earned</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="mt-1 text-lg font-semibold">
                {data?.credits.totalSpent ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Total Spent</p>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Invite by Email */}
        <div>
          <p className="text-sm font-medium">Invite a Friend</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Enter an email address to generate a personalized invite link.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="email"
              placeholder="friend@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              maxLength={320}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleInvite();
                }
              }}
              disabled={inviteMutation.isPending}
              aria-label="Friend's email address"
            />
            <Button
              onClick={handleInvite}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="shrink-0"
            >
              {inviteMutation.isPending ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Invite
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {sentInvites} invite{sentInvites !== 1 ? "s" : ""} sent
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {successfulReferrals} successful referral
              {successfulReferrals !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Referral List */}
        {sentInvites > 0 && (
          <>
            <Separator className="my-4" />
            <div>
              <p className="text-sm font-medium">Your Referrals</p>
              <div className="mt-2 space-y-2">
                {data?.referrals
                  .filter((r) => r.referredEmail !== null)
                  .map((referral) => (
                    <div
                      key={referral.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {referral.referredEmail}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(referral.createdAt).toLocaleDateString()}
                          {referral.creditAmount > 0 &&
                            ` — ${referral.creditAmount} credits`}
                        </p>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(referral.status)}
                        className="ml-2 shrink-0 text-[10px]"
                      >
                        {getStatusLabel(referral.status)}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
