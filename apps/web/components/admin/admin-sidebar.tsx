"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  BarChart3,
  Bot,
  Palette,
  ArrowLeft,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@ever-hust/ui/button";
import { Separator } from "@ever-hust/ui/separator";
import { cn } from "@ever-hust/ui/lib/utils";

const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/branding", label: "Branding", icon: Palette },
  { href: "/admin/ai-config", label: "AI Config", icon: Bot },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Focus management: when menu opens, focus close button; when it closes, focus hamburger
  useEffect(() => {
    if (mobileOpen) {
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

  const navContent = (
    <>
      {adminNavItems.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Button
            key={item.href}
            variant={isActive ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start gap-3",
              !isActive && "text-muted-foreground",
            )}
            size="sm"
            asChild
          >
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </>
  );

  const backToApp = (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-3 text-muted-foreground"
      asChild
    >
      <Link href="/dashboard">
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        Back to App
      </Link>
    </Button>
  );

  return (
    <>
      {/* Mobile hamburger button - fixed in top-left */}
      <button
        ref={mobileMenuButtonRef}
        type="button"
        className="fixed left-3 top-3 z-40 rounded-md border bg-card p-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin navigation menu"
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
            aria-label="Admin navigation menu"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card py-4 shadow-lg md:hidden"
          >
            {/* Close button */}
            <button
              ref={mobileCloseButtonRef}
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMobileOpen(false)}
              aria-label="Close admin navigation menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Logo / Title */}
            <Link href="/admin" className="mb-2 flex items-center gap-2 px-4">
              <Shield className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-lg font-bold">Admin</span>
            </Link>

            <Separator className="my-2 mx-3" />

            {/* Navigation */}
            <nav
              aria-label="Admin navigation"
              className="flex flex-1 flex-col gap-1 px-3 w-full"
            >
              {navContent}
            </nav>

            <Separator className="my-2 mx-3" />

            {/* Back to app */}
            <div className="px-3">{backToApp}</div>
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        aria-label="Admin navigation"
        className="hidden h-full w-56 flex-col border-r bg-card py-4 md:flex"
      >
        {/* Logo / Title */}
        <Link href="/admin" className="mb-2 flex items-center gap-2 px-4">
          <Shield className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-lg font-bold">Admin</span>
        </Link>

        <Separator className="my-2 mx-3" />

        {/* Navigation */}
        <nav
          aria-label="Admin navigation"
          className="flex flex-1 flex-col gap-1 px-3 w-full"
        >
          {navContent}
        </nav>

        <Separator className="my-2 mx-3" />

        {/* Back to app */}
        <div className="px-3">{backToApp}</div>
      </aside>
    </>
  );
}
