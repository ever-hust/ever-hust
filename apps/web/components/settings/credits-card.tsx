"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { Coins, Loader2 } from "lucide-react";
import { Card } from "@ever-hust/ui/card";
import { Button } from "@ever-hust/ui/button";
import { Badge } from "@ever-hust/ui/badge";
import { toast } from "sonner";
import { safeExternalUrl } from "@/lib/safe-url";

interface CreditsResponse {
  plan: "free" | "pro";
  balance: number;
  balanceUsd: number;
  spentThisPeriod: number;
  monthlyGrant: number;
  enforced: boolean;
  recent: { id: number; delta: number; reason: string; modelKey: string | null; createdAt: string }[];
}

const PACKS: { id: string; label: string; credits: number; price: string }[] = [
  { id: "small", label: "Starter", credits: 5000, price: "$5" },
  { id: "medium", label: "Plus", credits: 12000, price: "$12" },
  { id: "large", label: "Pro", credits: 30000, price: "$30" },
];

function fmtCredits(n: number) {
  return n.toLocaleString();
}

export function CreditsCard() {
  const { data, isLoading } = useQuery<CreditsResponse>({
    queryKey: ["user-credits"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/credits", { signal });
      if (!res.ok) throw new Error("Failed to load credits");
      const json = await res.json();
      return (json.data ?? json) as CreditsResponse;
    },
  });

  const topUp = useMutation({
    mutationFn: async (packId: string) => {
      const res = await fetch("/api/stripe/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? "Top-up unavailable");
      }
      return (await res.json()) as { url?: string };
    },
    onSuccess: (data) => {
      const url = safeExternalUrl(data.url);
      if (url) window.location.href = url;
      else toast.error("Credit top-up is not configured yet.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Top-up failed"),
  });

  return (
    <Card id="credits" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Coins className="h-5 w-5" aria-hidden="true" />
        AI Credits
      </h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Hust-provided AI is metered in credits (1,000 credits = $1). Each tier includes a
          monthly allowance; usage is charged by the model you pick. Bring your own API key to
          use a provider without spending credits.
        </p>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-lg font-semibold">{fmtCredits(data.balance)}</p>
                <p className="text-[11px] text-muted-foreground">≈ ${data.balanceUsd.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Used this month</p>
                <p className="text-lg font-semibold">{fmtCredits(data.spentThisPeriod)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Monthly allowance</p>
                <p className="text-lg font-semibold">{fmtCredits(data.monthlyGrant)}</p>
                <Badge variant="secondary" className="mt-1 text-[10px] capitalize">{data.plan}</Badge>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Buy more credits</p>
              <div className="flex flex-wrap gap-2">
                {PACKS.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    disabled={topUp.isPending}
                    onClick={() => topUp.mutate(p.id)}
                  >
                    {topUp.isPending && topUp.variables === p.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : null}
                    {p.label} — {fmtCredits(p.credits)} / {p.price}
                  </Button>
                ))}
              </div>
            </div>

            {data.recent.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Recent activity</p>
                <ul className="space-y-1 text-xs">
                  {data.recent.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted-foreground">
                        {t.reason === "usage"
                          ? `Usage${t.modelKey ? ` · ${t.modelKey.replace(/^hust:/, "")}` : ""}`
                          : t.reason.replace(/_/g, " ")}
                      </span>
                      <span className={t.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                        {t.delta < 0 ? "" : "+"}
                        {fmtCredits(t.delta)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
