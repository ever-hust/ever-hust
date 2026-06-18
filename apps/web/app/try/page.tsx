"use client";

import { authClient } from "@ever-hust/auth/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Frictionless trial entry. Reached from the marketing site (hust.so) hero:
 * `app.hust.so/try?m=<message>`. Creates an anonymous session (no signup /
 * LinkedIn) and hands the message to the chat, which auto-sends it so the
 * guest immediately sees the AI respond. The dashboard then nudges them to
 * sign up to keep their progress.
 */
function TryFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const started = useRef(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const m = params.get("m") ?? "";
    const dest = m
      ? `/dashboard?m=${encodeURIComponent(m)}&trial=1`
      : "/dashboard?trial=1";

    (async () => {
      try {
        // Reuse an existing session if the visitor already has one.
        const { data } = await authClient.getSession();
        if (!data?.session) {
          const res = (await authClient.signIn.anonymous()) as {
            error?: unknown;
          };
          if (res?.error) throw new Error("anonymous sign-in failed");
        }
        router.replace(dest);
      } catch {
        setErrored(true);
        setTimeout(
          () => router.replace(`/login?callbackUrl=${encodeURIComponent(dest)}`),
          1600,
        );
      }
    })();
  }, [params, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
      <p className="text-lg font-medium">
        {errored ? "Taking you to sign in…" : "Setting up your workspace…"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {errored
          ? "We couldn't start a guest session — you can continue by signing in."
          : "Starting a free guest session — no signup required."}
      </p>
    </main>
  );
}

export default function TryPage() {
  return (
    <Suspense fallback={null}>
      <TryFlow />
    </Suspense>
  );
}
