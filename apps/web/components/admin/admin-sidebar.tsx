"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  BarChart3,
  ArrowLeft,
  Shield,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Separator } from "@repo/ui/separator";
import { cn } from "@repo/ui/lib/utils";

const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
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
      </nav>

      <Separator className="my-2 mx-3" />

      {/* Back to app */}
      <div className="px-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          asChild
        >
          <Link href="/chat">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            Back to App
          </Link>
        </Button>
      </div>
    </aside>
  );
}
