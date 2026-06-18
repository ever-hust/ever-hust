"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Briefcase,
  User,
  Settings,
  LogOut,
  BriefcaseBusiness,
  ClipboardList,
  Heart,
  Bell,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  CreditCard,
  Building2,
  Gift,
  Code2,
  ChevronDown,
  Search,
  Check,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@ever-hust/ui/button";
import { Separator } from "@ever-hust/ui/separator";
import { Avatar, AvatarFallback } from "@ever-hust/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ever-hust/ui/dialog";
import { UsageQuota } from "@/components/shared/usage-quota";
import { AnonymousReminder } from "@/components/shared/anonymous-reminder";
import { useChatContext } from "@/components/chat/chat-context";
import { signOut, useSession } from "@ever-hust/auth/client";
import { cn } from "@ever-hust/ui/lib/utils";
import { APP_NAME } from "@ever-hust/utils";
import { locales, type Locale } from "@/i18n/config";
import { useLocale } from "next-intl";
import ReactCountryFlag from "react-country-flag";

// ---------------------------------------------------------------------------
// Locale metadata
// ---------------------------------------------------------------------------

const localeLabels: Record<Locale, { countryCode: string; label: string }> = {
  en: { countryCode: "US", label: "English" },
  es: { countryCode: "ES", label: "Español" },
};

// ---------------------------------------------------------------------------
// Language dropdown (searchable, supports 100+ locales)
// ---------------------------------------------------------------------------

function LanguageDropdown({
  currentLocale,
  onSelect,
}: {
  currentLocale: Locale;
  onSelect: (locale: Locale) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = locales.filter((locale) => {
    if (!query.trim()) return true;
    const { label } = localeLabels[locale];
    return label.toLowerCase().includes(query.toLowerCase()) ||
      locale.toLowerCase().includes(query.toLowerCase());
  });

  const current = localeLabels[currentLocale];

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ReactCountryFlag
          countryCode={current.countryCode}
          svg
          aria-hidden="true"
          className="!w-4 !h-3"
        />
        <span className="flex-1 text-left truncate">{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-full min-w-[180px] rounded-md border bg-popover shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search languages…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search languages"
            />
          </div>

          {/* Scrollable list */}
          <ul
            role="listbox"
            className="max-h-48 overflow-y-auto py-1"
            aria-label="Languages"
          >
            {filtered.length === 0 ? (
              <li role="none" className="px-2 py-3 text-center text-xs text-muted-foreground">
                No languages found
              </li>
            ) : (
              filtered.map((locale) => {
                const { countryCode, label } = localeLabels[locale];
                const isActive = locale === currentLocale;
                return (
                  <li
                    key={locale}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={0}
                    onClick={() => {
                      onSelect(locale);
                      setOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(locale);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      isActive && "bg-accent/50 font-medium"
                    )}
                  >
                    <ReactCountryFlag
                      countryCode={countryCode}
                      svg
                      aria-hidden="true"
                      className="!w-4 !h-3"
                    />
                    <span className="flex-1 text-left">{label}</span>
                    {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/favorites", label: "Saved Jobs", icon: Heart },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/profile", label: "My Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Fetches badge counts for nav items (applications pending, active alerts). */
function useNavBadges(): Record<string, number> {
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      try {
        const [appsRes, alertsRes] = await Promise.all([
          fetch("/api/user/applications?countOnly=true").catch(() => null),
          fetch("/api/user/alerts").catch(() => null),
        ]);

        if (cancelled) return;
        const next: Record<string, number> = {};

        if (appsRes?.ok) {
          const data = await appsRes.json();
          const count = data.count ?? (Array.isArray(data.applications) ? data.applications.filter((a: { status: string }) => a.status === "pending" || a.status === "in_progress").length : 0);
          if (count > 0) next["/applications"] = count;
        }

        if (alertsRes?.ok) {
          const data = await alertsRes.json();
          const count = Array.isArray(data.alerts) ? data.alerts.length : 0;
          if (count > 0) next["/alerts"] = count;
        }

        if (!cancelled) setBadges(next);
      } catch {
        /* non-blocking */
      }
    }

    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return badges;
}

// ---------------------------------------------------------------------------
// Collapse persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "sidebar-collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* quota exceeded — ignore */
  }
}

// ---------------------------------------------------------------------------
// User menu items (non-nav items in the dropdown)
// ---------------------------------------------------------------------------

const userMenuItems = [
  { href: "/account", label: "Account", icon: User },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/referral", label: "Referral Program", icon: Gift },
  { href: "/developer", label: "Developer API", icon: Code2 },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { focusChatInput } = useChatContext();
  const { data: session } = useSession();
  const navBadges = useNavBadges();
  const currentLocale = useLocale();
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Hydration-safe mount
  useEffect(() => {
    setMounted(true);
    setCollapsed(readCollapsed());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Focus management for mobile menu
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

  // Close on escape
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

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  // Close user menu on escape
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [userMenuOpen]);

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

  // Navigate + focus chat for all nav items
  const handleNavClick = useCallback(
    (href: string) => {
      router.push(href);
      focusChatInput();
    },
    [router, focusChatInput]
  );

  // Navigate from user menu
  const handleUserMenuNav = useCallback(
    (href: string) => {
      setUserMenuOpen(false);
      router.push(href);
      focusChatInput();
    },
    [router, focusChatInput]
  );

  const switchLocale = useCallback(
    (locale: Locale) => {
      document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;samesite=lax`;
      setUserMenuOpen(false);
      router.refresh();
    },
    [router]
  );

  const userName = session?.user?.name ?? "User";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const userImage = session?.user?.image;

  // Check if a nav item is active
  const isNavActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/" || pathname === "/dashboard";
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname]
  );

  // ─── Shared nav rendering ──────────────────────────────────────────
  function renderNavItem(
    item: (typeof navItems)[number],
    showLabel: boolean,
    isMobile = false
  ) {
    const active = isNavActive(item.href);
    const isCollapsedDesktop = !showLabel && !isMobile;
    const badgeCount = navBadges[item.href] ?? 0;

    return (
      <div key={item.href} className={cn("relative", isCollapsedDesktop && "group/tooltip")}>
        <Button
          variant={active ? "secondary" : "ghost"}
          className={cn(
            "w-full gap-3",
            showLabel ? "justify-start" : "justify-center",
            !active && "text-muted-foreground"
          )}
          size="sm"
          onClick={() => {
            handleNavClick(item.href);
            if (isMobile) setMobileOpen(false);
          }}
          title={!showLabel ? item.label : undefined}
        >
          <item.icon
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {showLabel && (
            <span className="flex-1 flex items-center justify-between">
              {item.label}
              {badgeCount > 0 && (
                <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
          )}
          {!showLabel && badgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold text-primary-foreground">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
          {!showLabel && badgeCount === 0 && (
            <span className="sr-only">{item.label}</span>
          )}
        </Button>
        {/* Tooltip on collapsed sidebar hover */}
        {isCollapsedDesktop && (
          <span
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md border opacity-0 transition-opacity group-hover/tooltip:opacity-100 z-50"
            role="tooltip"
          >
            {item.label}
          </span>
        )}
      </div>
    );
  }

  // ─── User menu popover content ────────────────────────────────────
  function renderUserMenu() {
    return (
      <>
        {/* Backdrop overlay to dim sidebar behind menu */}
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
          onClick={() => setUserMenuOpen(false)}
          aria-hidden="true"
        />
        <div
          role="menu"
          aria-label="User menu"
          className="absolute bottom-full left-2 right-2 mb-1 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl shadow-black/20 ring-1 ring-white/10 backdrop-blur-md z-50"
        >
        {/* User info with avatar */}
        <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
          <Avatar className="h-9 w-9 shrink-0">
            {userImage ? (
              <img
                src={userImage}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                {userInitials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{userName}</p>
            {session?.user?.email && (
              <p className="text-xs text-muted-foreground truncate">
                {session.user.email}
              </p>
            )}
          </div>
        </div>
        <Separator className="my-1" />

        {/* Menu navigation items */}
        {userMenuItems.map((item) => (
          <button
            key={item.href}
            type="button"
            role="menuitem"
            onClick={() => handleUserMenuNav(item.href)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pathname === item.href && "bg-accent/50 font-medium"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </button>
        ))}

        <Separator className="my-1" />

        {/* Theme selector */}
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground mb-1.5">Theme</p>
          <div className="flex items-center gap-0.5">
            {[
              { value: "light", icon: Sun, label: "Light" },
              { value: "dark", icon: Moon, label: "Dark" },
              { value: "system", icon: Monitor, label: "System" },
            ].map((t) => {
              const isActive = mounted && theme === t.value;
              return (
                <Button
                  key={t.value}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={`h-7 flex-1 gap-1 px-1 text-xs ${isActive ? "ring-2 ring-primary/30 font-medium" : "opacity-60"}`}
                  onClick={() => setTheme(t.value)}
                  aria-label={t.label}
                  aria-pressed={isActive}
                  title={t.label}
                >
                  <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {isActive && <span>{t.label}</span>}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Language selector dropdown */}
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground mb-1.5">Language</p>
          <LanguageDropdown
            currentLocale={currentLocale as Locale}
            onSelect={switchLocale}
          />
        </div>

        <Separator className="my-1" />

        {/* Sign out */}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setUserMenuOpen(false);
            setSignOutOpen(true);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            "text-destructive hover:bg-destructive/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign Out
        </button>
      </div>
      </>
    );
  }

  // ─── User avatar button ───────────────────────────────────────────
  function renderUserButton(showLabel: boolean) {
    return (
      <button
        type="button"
        onClick={() => setUserMenuOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg p-2 transition-colors",
          "hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          userMenuOpen && "bg-accent/50",
          !showLabel && "justify-center"
        )}
        aria-expanded={userMenuOpen}
        aria-haspopup="menu"
        aria-label="User menu"
      >
        <Avatar className="h-7 w-7 shrink-0">
          {userImage ? (
            <img
              src={userImage}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {userInitials}
            </AvatarFallback>
          )}
        </Avatar>
        {showLabel && (
          <>
            <span className="flex-1 truncate text-left text-sm font-medium">
              {userName}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                userMenuOpen && "rotate-180"
              )}
              aria-hidden="true"
            />
          </>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Mobile hamburger button */}
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
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="navigation"
            aria-label="Navigation menu"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card py-4 shadow-lg md:hidden"
          >
            <button
              ref={mobileCloseButtonRef}
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            <Link href="/" className="mb-6 flex items-center gap-2 px-4">
              <BriefcaseBusiness
                className="h-7 w-7 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-lg font-bold">{APP_NAME}</span>
            </Link>

            <nav
              aria-label="Dashboard navigation"
              className="flex flex-1 flex-col gap-1 px-3 w-full"
            >
              {navItems.map((item) => renderNavItem(item, true, true))}
            </nav>

            <UsageQuota />

            <Separator className="my-2 mx-3" />

            {/* Mobile user section */}
            <div ref={userMenuRef} className="relative px-3">
              <AnonymousReminder />
              {renderUserButton(true)}
              {userMenuOpen && renderUserMenu()}
            </div>
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={cn(
          "hidden h-full flex-col border-r bg-card py-4 md:flex transition-[width] duration-200",
          collapsed ? "w-[52px]" : "w-52"
        )}
      >
        {/* Logo */}
        <Link
          href="/"
          className={cn(
            "mb-6 flex items-center gap-2",
            collapsed ? "justify-center px-0" : "px-3"
          )}
          title={APP_NAME}
        >
          <BriefcaseBusiness
            className="h-7 w-7 shrink-0 text-primary"
            aria-hidden="true"
          />
          {!collapsed && (
            <span className="text-lg font-bold">{APP_NAME}</span>
          )}
        </Link>

        {/* Navigation */}
        <nav
          aria-label="Dashboard navigation"
          className={cn(
            "flex flex-1 flex-col gap-1 w-full",
            collapsed ? "items-center px-1" : "px-2"
          )}
        >
          {navItems.map((item) => renderNavItem(item, !collapsed))}
        </nav>

        {/* Usage quota (expanded only) */}
        {!collapsed && (
          <div className="w-full">
            <UsageQuota />
          </div>
        )}

        <Separator
          className={cn("my-2", collapsed ? "w-8 mx-auto" : "mx-2")}
        />

        {/* User section */}
        <div
          ref={!mobileOpen ? userMenuRef : undefined}
          className={cn("relative", collapsed ? "px-1" : "px-2")}
        >
          <AnonymousReminder collapsed={collapsed} />
          {renderUserButton(!collapsed)}
          {userMenuOpen && !mobileOpen && renderUserMenu()}
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "mt-2 flex items-center justify-center py-1 text-muted-foreground hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm mx-2"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
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
