"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@ever-hust/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ever-hust/ui/card";
import { Separator } from "@ever-hust/ui/separator";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { BriefcaseBusiness, Linkedin, Shield, Sparkles, Search, FileText, Github, Twitter, Mail, MailCheck, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { signIn, signUp, sendVerificationEmail } from "@ever-hust/auth/client";
import type { SocialProviderId } from "@ever-hust/auth/providers";
import { authErrorMessage } from "@/lib/auth-errors";
import { Input } from "@ever-hust/ui/input";
import { Label } from "@ever-hust/ui/label";
import { toast } from "sonner";
import { APP_NAME } from "@ever-hust/utils";

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
  const SAFE_DEFAULT = "/dashboard";
  if (!raw) return SAFE_DEFAULT;

  // Decode percent-encoded sequences to catch bypass attempts like /%2F%2Fevil.com
  // which would decode to //evil.com (protocol-relative) on redirect.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return SAFE_DEFAULT;
  }

  // Must start with "/" and not "//" (protocol-relative)
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return SAFE_DEFAULT;
  // Reject backslash tricks (e.g. "/\evil.com")
  if (decoded.includes("\\")) return SAFE_DEFAULT;
  // Reject any URL that contains a colon before the first slash (e.g. "/javascript:...")
  // If there's no second slash, indexOf("/") returns -1 which would bypass the check,
  // so we treat "no slash" as Infinity to always reject colons in that case.
  const withoutLeadingSlash = decoded.slice(1);
  const colonIdx = withoutLeadingSlash.indexOf(":");
  const slashIdx = withoutLeadingSlash.indexOf("/");
  if (colonIdx !== -1 && (slashIdx === -1 || colonIdx < slashIdx)) {
    return SAFE_DEFAULT;
  }
  return decoded;
}

function LoginButtons() {
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // Capture referral code from URL and persist it in localStorage so it
  // survives the OAuth redirect flow. The code will be redeemed after
  // the user lands on the dashboard (see use-referral-redeem hook).
  const refCode = searchParams.get("ref");
  useEffect(() => {
    if (refCode && /^[A-Z0-9]+$/.test(refCode)) {
      try {
        window.localStorage.setItem("ej_referral_code", refCode);
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [refCode]);

  // Error from a failed OAuth round-trip (Better Auth → /login?error=…).
  // Shown inline (toasts are easy to miss) and once as a toast.
  const errorParam = searchParams.get("error");
  const [authError, setAuthError] = useState<string | null>(() => authErrorMessage(errorParam));
  useEffect(() => {
    const message = authErrorMessage(errorParam);
    if (message) {
      setAuthError(message);
      toast.error(message);
      // Shown once: a refresh or a later attempt shouldn't resurface it.
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [errorParam]);

  // Only offer providers this deployment has credentials for.
  const [enabledProviders, setEnabledProviders] = useState<SocialProviderId[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth-providers")
      .then((res) => (res.ok ? res.json() : { providers: [] }))
      .then((data: { providers?: SocialProviderId[] }) => {
        if (active) setEnabledProviders(data.providers ?? []);
      })
      .catch(() => {
        if (active) setEnabledProviders([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSocialLogin = async (provider: SocialProviderId) => {
    setLoadingProvider(provider);
    setAuthError(null);
    const fail = (message: string) => {
      setAuthError(message);
      toast.error(message);
      setLoadingProvider(null);
    };
    try {
      // Better Auth returns errors (it doesn't throw) — e.g. a provider that
      // isn't configured — so check the result, or the spinner never stops.
      const { error } = await signIn.social({
        provider,
        callbackURL: callbackUrl,
        errorCallbackURL: "/login",
      });
      if (error) fail("This sign-in option isn't available right now. Please use another one.");
    } catch {
      fail("Failed to start sign-in. Please try again.");
    }
  };

  const ProviderButton = ({ provider, label, icon: Icon }: {
    provider: SocialProviderId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => (
    <Button
      variant={provider === "linkedin" ? "default" : "outline"}
      className="w-full gap-2"
      size="lg"
      onClick={() => handleSocialLogin(provider)}
      disabled={loadingProvider !== null}
    >
      {loadingProvider === provider ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      Continue with {label}
    </Button>
  );

  // Compact icon-only button for the secondary providers (keeps the card short).
  const IconProviderButton = ({ provider, label, icon: Icon }: {
    provider: Exclude<SocialProviderId, "linkedin">;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={() => handleSocialLogin(provider)}
      disabled={loadingProvider !== null}
      aria-label={`Continue with ${label}`}
      title={`Continue with ${label}`}
    >
      {loadingProvider === provider ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
    </Button>
  );

  const secondaryProviders = SECONDARY_PROVIDERS.filter((p) => enabledProviders?.includes(p.id));
  const linkedinEnabled = enabledProviders?.includes("linkedin") ?? false;
  const anySocial = linkedinEnabled || secondaryProviders.length > 0;

  return (
    <div className="space-y-3">
      {authError && <FormAlert tone="error">{authError}</FormAlert>}

      {enabledProviders === null ? (
        <Skeleton className="h-11 w-full rounded-md" />
      ) : (
        <>
          {linkedinEnabled && <ProviderButton provider="linkedin" label="LinkedIn" icon={Linkedin} />}

          {/* Secondary providers — compact icon row */}
          {secondaryProviders.length > 0 && (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${secondaryProviders.length}, minmax(0, 1fr))` }}
            >
              {secondaryProviders.map((p) => (
                <IconProviderButton key={p.id} provider={p.id} label={p.label} icon={p.icon} />
              ))}
            </div>
          )}

          {linkedinEnabled && (
            <p className="text-[10px] text-center text-muted-foreground/70">
              First time? Continue with LinkedIn to create your account.
            </p>
          )}

          {/* Email/Password separator */}
          {anySocial && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or use email</span>
              </div>
            </div>
          )}
        </>
      )}

      <EmailPasswordForm callbackUrl={callbackUrl} onAttempt={() => setAuthError(null)} />
    </div>
  );
}

const SECONDARY_PROVIDERS: {
  id: Exclude<SocialProviderId, "linkedin">;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "google", label: "Google", icon: GoogleIcon },
  { id: "github", label: "GitHub", icon: Github },
  { id: "facebook", label: "Facebook", icon: FacebookIcon },
  { id: "twitter", label: "X (Twitter)", icon: Twitter },
];

/** Inline status box — toasts alone were easy to miss on this page. */
function FormAlert({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          : "rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
      }
    >
      {children}
    </div>
  );
}

/** Email/password sign-in / sign-up form with toggle */
function EmailPasswordForm({
  callbackUrl,
  onAttempt,
}: {
  callbackUrl: string;
  /** Called when the user submits — clears an earlier social sign-in error. */
  onAttempt?: () => void;
}) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Set once a confirmation email is pending → show "check your inbox". */
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) return;

      // Forgot password flow
      if (forgotMode) {
        setLoading(true);
        try {
          await fetch("/api/auth/forget-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, redirectTo: "/reset-password" }),
          });
          setForgotSent(true);
          toast.success("If an account exists with that email, you'll receive a reset link.");
        } catch {
          toast.error("Unable to send reset email. Please try again.");
        } finally {
          setLoading(false);
        }
        return;
      }

      if (!password || password.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }

      setLoading(true);
      setFormError(null);
      onAttempt?.();
      const fail = (message: string) => {
        setFormError(message);
        toast.error(message);
      };
      try {
        if (mode === "signup") {
          const { data, error } = await signUp.email({
            email,
            password,
            name: name || email.split("@")[0] || "User",
            callbackURL: callbackUrl,
          });
          if (error) {
            fail(error.message ?? "Sign-up failed. Please try again.");
          } else if (data?.token) {
            // Signed in straight away (email verification not required).
            window.location.href = callbackUrl;
          } else {
            // Verification required: no session until the emailed link is clicked.
            setVerificationEmail(email);
          }
        } else {
          const { data, error } = await signIn.email({
            email,
            password,
            callbackURL: callbackUrl,
          });
          if (error?.code === "EMAIL_NOT_VERIFIED") {
            setVerificationEmail(email);
          } else if (error) {
            fail(error.message ?? "Invalid email or password.");
          } else if (data?.token) {
            window.location.href = callbackUrl;
          }
        }
      } catch {
        fail("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, password, name, mode, forgotMode, callbackUrl, onAttempt]
  );

  if (verificationEmail) {
    return (
      <CheckEmailPanel
        email={verificationEmail}
        callbackUrl={callbackUrl}
        onBack={() => {
          setVerificationEmail(null);
          setMode("signin");
        }}
      />
    );
  }

  if (forgotMode) {
    return (
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email" className="text-xs">Email address</Label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <Button type="submit" className="w-full gap-2" size="lg" disabled={loading || forgotSent}>
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          {forgotSent ? "Check your email" : "Send reset link"}
        </Button>
        <button
          type="button"
          onClick={() => { setForgotMode(false); setForgotSent(false); }}
          className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {formError && <FormAlert tone="error">{formError}</FormAlert>}

      {mode === "signup" && (
        <div className="space-y-1.5">
          <Label htmlFor="signup-name" className="text-xs">Full name</Label>
          <Input
            id="signup-name"
            type="text"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="auth-email" className="text-xs">Email address</Label>
        <Input
          id="auth-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="auth-password" className="text-xs">Password</Label>
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => setForgotMode(true)}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </button>
          )}
        </div>
        <div className="relative">
          <Input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" variant="outline" className="w-full gap-2" size="lg" disabled={loading}>
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        {mode === "signup" ? "Create account" : "Sign in with email"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {mode === "signin" ? (
          <>Don&apos;t have an account?{" "}
            <button type="button" onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">Sign up</button>
          </>
        ) : (
          <>Already have an account?{" "}
            <button type="button" onClick={() => setMode("signin")} className="text-primary hover:underline font-medium">Sign in</button>
          </>
        )}
      </p>
    </form>
  );
}

/** Cooldown between "Resend email" clicks (s). */
const RESEND_COOLDOWN_S = 30;

/**
 * Shown after an email sign-up (or a sign-in with an unconfirmed address):
 * there is no session until the emailed link is clicked, so say so plainly
 * instead of leaving the form looking like nothing happened.
 */
function CheckEmailPanel({
  email,
  callbackUrl,
  onBack,
}: {
  email: string;
  callbackUrl: string;
  onBack: () => void;
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setSending(true);
    try {
      const { error } = await sendVerificationEmail({ email, callbackURL: callbackUrl });
      if (error) toast.error(error.message ?? "Couldn't resend the email. Please try again.");
      else toast.success("Confirmation email sent again.");
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      toast.error("Couldn't resend the email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center" role="status">
      <MailCheck className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
          Click it to activate your account — you&apos;ll be signed in automatically.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={resend}
        disabled={sending || cooldown > 0}
      >
        {sending ? "Sending…" : cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Not seeing it? Check your spam folder, or{" "}
        <button type="button" onClick={onBack} className="font-medium text-primary hover:underline">
          use a different email
        </button>
        .
      </p>
    </div>
  );
}

function LoginButtonFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-11 w-full rounded-md" />
      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div id="main-content" className="relative flex min-h-screen items-center justify-center px-4 py-10">
      {/* Dark mode toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Left: brand + value (desktop only) */}
        <div className="hidden flex-col gap-8 lg:flex">
          <Link href="/" className="inline-flex items-center gap-2" aria-label={`${APP_NAME} home`}>
            <BriefcaseBusiness className="h-8 w-8 text-primary" aria-hidden="true" />
            <span className="text-2xl font-bold">{APP_NAME}</span>
          </Link>
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
              Land your next role, with AI on your side.
            </h1>
            <p className="mt-3 text-muted-foreground">
              Sign in to pick up your job search exactly where you left off.
            </p>
          </div>
          <ul className="space-y-3">
            {VALUE_PROPS.map((prop) => (
              <li key={prop.text} className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <prop.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <span>{prop.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            <span>We never post or apply on your behalf without your approval.</span>
          </div>
        </div>

        {/* Right: auth card */}
        <div className="mx-auto w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-6 text-center lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2" aria-label={`${APP_NAME} home`}>
              <BriefcaseBusiness className="h-7 w-7 text-primary" aria-hidden="true" />
              <span className="text-xl font-bold">{APP_NAME}</span>
            </Link>
          </div>

          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>
                Sign in or create your account to continue
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Suspense fallback={<LoginButtonFallback />}>
                <LoginButtons />
              </Suspense>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground lg:hidden">
                <Shield className="h-3 w-3" aria-hidden="true" />
                <span>We never post on your behalf</span>
              </div>

              <p className="pt-1 text-center text-[10px] text-muted-foreground/70">
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
    </div>
  );
}
