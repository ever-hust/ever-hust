"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  MessageSquare,
  Briefcase,
  User,
  Settings,
  LogOut,
  BriefcaseBusiness,
  ClipboardList,
  Heart,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Separator } from "@repo/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { UsageQuota } from "@/components/shared/usage-quota";
import { signOut } from "@repo/auth/client";
import { cn } from "@repo/ui/lib/utils";

const navItems = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/favorites", label: "Favorites", icon: Heart },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Focus management: when menu opens, focus close button; when it closes, focus hamburger
  useEffect(() => {
    if (mobileOpen) {
      // Small delay so the DOM is painted — cancel on cleanup to avoid
      // focusing a potentially unmounted element.
      const rafId = requestAnimationFrame(() =>
        mobileCloseButtonRef.current?.focus()
      );
      return () => cancelAnimationFrame(rafId);
    } else {
      mobileMenuButtonRef.current?.focus();
    }
  }, [mobileOpen]);

  // Close on escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [mobileOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSignOut = useCallback(() => {
    setSigningOut(true);
    signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
        onError: () => {
          setSigningOut(false);
          setSignOutOpen(false);
        },
      },
    });
  }, []);

  return (
    <>
      {/* Mobile hamburger button - fixed in top-left */}
      <button
        ref={mobileMenuButtonRef}
        type="button"
        className="fixed left-3 top-3 z-40 rounded-md border bg-card p-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Slide-out sidebar */}
          <aside
            role="navigation"
            aria-label="Navigation menu"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card py-4 shadow-lg md:hidden"
          >
            {/* Close button */}
            <button
              ref={mobileCloseButtonRef}
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Logo */}
            <Link href="/chat" className="mb-6 flex items-center gap-2 px-4">
              <BriefcaseBusiness className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-lg font-bold">Ever Jobs</span>
            </Link>

            {/* Navigation */}
            <nav
              aria-label="Dashboard navigation"
              className="flex flex-1 flex-col gap-1 px-3 w-full"
            >
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Button
                    key={item.href}
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-3",
                      !isActive && "text-muted-foreground"
                    )}
                    size="sm"
                    asChild
                  >
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>

            {/* Usage quota for free users */}
            <UsageQuota />

            <Separator className="my-2 mx-3" />

            <div className="flex flex-col gap-2 px-3 w-full">
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <LanguageSwitcher />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-3 text-muted-foreground"
                onClick={() => setSignOutOpen(true)}
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className="hidden h-full w-16 flex-col items-center border-r bg-card py-4 md:flex lg:w-56"
      >
        {/* Logo */}
        <Link href="/chat" className="mb-6 flex items-center gap-2 px-3">
          <BriefcaseBusiness className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
          <span className="hidden text-lg font-bold lg:inline">Ever Jobs</span>
        </Link>

        {/* Navigation */}
        <nav
          aria-label="Dashboard navigation"
          className="flex flex-1 flex-col gap-1 px-2 w-full"
        >
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Button
                key={item.href}
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  !isActive && "text-muted-foreground"
                )}
                size="sm"
                asChild
              >
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  title={item.label}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="sr-only lg:hidden">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </nav>

        {/* Usage quota — only on expanded sidebar */}
        <div className="hidden w-full lg:block">
          <UsageQuota />
        </div>

        <Separator className="my-2 w-10 lg:w-[calc(100%-1rem)]" />

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-2 px-2 w-full">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={() => setSignOutOpen(true)}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">Sign out</span>
          </Button>
        </div>
      </aside>

      {/* Sign-out confirmation dialog */}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out? You&apos;ll need to sign in
              again to access your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSignOutOpen(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
