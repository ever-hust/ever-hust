"use client";

import Link from "next/link";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import { BriefcaseBusiness, Linkedin, Shield, Sparkles, Search, FileText } from "lucide-react";
import { signIn } from "@repo/auth/client";
import { toast } from "sonner";

const VALUE_PROPS = [
  { icon: Search, text: "Search 2M+ jobs across 25+ platforms" },
  { icon: Sparkles, text: "AI-powered personalized recommendations" },
  { icon: FileText, text: "Generate tailored cover letters instantly" },
];

export default function LoginPage() {
  const handleLinkedInLogin = async () => {
    try {
      await signIn.social({
        provider: "linkedin",
        callbackURL: "/chat",
      });
    } catch {
      toast.error("Failed to start sign-in. Please try again.");
    }
  };

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
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleLinkedInLogin}
            >
              <Linkedin className="h-5 w-5" aria-hidden="true" />
              Continue with LinkedIn
            </Button>

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
