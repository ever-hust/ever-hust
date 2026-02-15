"use client";

import Link from "next/link";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";
import { BriefcaseBusiness, Linkedin } from "lucide-react";
import { signIn } from "@repo/auth/client";

export default function LoginPage() {
  const handleLinkedInLogin = async () => {
    await signIn.social({
      provider: "linkedin",
      callbackURL: "/chat",
    });
  };

  return (
    <div id="main-content" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <BriefcaseBusiness className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">Ever Jobs</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in with LinkedIn to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleLinkedInLogin}
            >
              <Linkedin className="h-5 w-5" />
              Continue with LinkedIn
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy
              Policy.
            </p>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
