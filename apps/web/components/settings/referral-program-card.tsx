"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Separator } from "@repo/ui/separator";
import { toast } from "sonner";

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
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadReferrals = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/referrals", { signal });
      if (res.ok && !signal?.aborted) {
        const json = (await res.json()) as ReferralData;
        setData(json);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load referral data:", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReferrals(controller.signal);
    return () => controller.abort();
  }, [loadReferrals]);

  const referralLink = data
    ? `${window.location.origin}/signup?ref=${data.referralCode}`
    : "";

  const handleCopy = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }, [referralLink]);

  const handleShare = useCallback(async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Ever Jobs",
          text: "Check out Ever Jobs - an AI-powered job search platform! Sign up with my referral link and we both earn credits.",
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

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/referrals/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (res.ok) {
        toast.success(`Referral invite created for ${inviteEmail.trim()}`);
        setInviteEmail("");
        // Reload referral data to show the new invite
        await loadReferrals();
      } else {
        const errorData = (await res.json()) as { error?: string };
        toast.error(errorData.error ?? "Failed to create invite");
      }
    } catch {
      toast.error("Failed to create invite");
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, loadReferrals]);

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
        Invite friends to Ever Jobs and earn credits when they sign up.
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleInvite();
                }
              }}
              disabled={inviting}
              aria-label="Friend's email address"
            />
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
