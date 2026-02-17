"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import { BriefcaseBusiness, Linkedin, Shield, Sparkles, Search, FileText } from "lucide-react";
import { signIn } from "@repo/auth/client";
import { toast } from "sonner";

const VALUE_PROPS = [
  { icon: Search, text: "Search 2M+ jobs across 25+ platforms" },
  { icon: Sparkles, text: "AI-powered personalized recommendations" },
  { icon: FileText, text: "Generate tailored cover letters instantly" },
];

/**
 * Validate that a callback URL is a safe, same-origin relative path.
 * Rejects absolute URLs, protocol-relative URLs, and paths with backslashes
 * to prevent open redirect attacks.
 */
function getSafeCallbackUrl(raw: string | null): string {
  if (!raw) return "/chat";
  // Must start with "/" and not "//" (protocol-relative)
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/chat";
  // Reject backslash tricks (e.g. "/\evil.com")
  if (raw.includes("\\")) return "/chat";
  // Reject any URL that contains a colon before the first slash (e.g. "/javascript:...")
  // If there's no second slash, indexOf("/") returns -1 which would bypass the check,
  // so we treat "no slash" as Infinity to always reject colons in that case.
  const withoutLeadingSlash = raw.slice(1);
  const colonIdx = withoutLeadingSlash.indexOf(":");
  const slashIdx = withoutLeadingSlash.indexOf("/");
  if (colonIdx !== -1 && (slashIdx === -1 || colonIdx < slashIdx)) {
    return "/chat";
  }
  return raw;
}

function LoginButton() {
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  const handleLinkedInLogin = async () => {
    try {
      await signIn.social({
        provider: "linkedin",
        callbackURL: callbackUrl,
      });
    } catch {
      toast.error("Failed to start sign-in. Please try again.");
    }
  };

  return (
    <Button
      className="w-full gap-2"
      size="lg"
      onClick={handleLinkedInLogin}
    >
      <Linkedin className="h-5 w-5" aria-hidden="true" />
      Continue with LinkedIn
    </Button>
  );
}

function LoginButtonFallback() {
  return <Skeleton className="h-11 w-full rounded-md" />;
}

export default function LoginPage() {
  return (
    <div id="main-content" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="Ever Jobs home">
            <BriefcaseBusiness className="h-8 w-8 text-primary" aria-hidden="true" />
            <span className="text-2xl font-bold">Ever Jobs</span>
          </Link>
        </div>

        {/* Login card */}
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to access your AI-powered job search assistant
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Suspense fallback={<LoginButtonFallback />}>
              <LoginButton />
            </Suspense>

            <div className="flex items-center gap-1.5 justify-center text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" aria-hidden="true" />
              <span>We never post on your behalf</span>
            </div>

            <Separator />

            {/* Value props */}
            <div className="space-y-2.5">
              {VALUE_PROPS.map((prop) => (
                <div key={prop.text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <prop.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  </div>
                  {prop.text}
                </div>
              ))}
            </div>

            <p className="pt-2 text-center text-[10px] text-muted-foreground/70">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="underline hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
