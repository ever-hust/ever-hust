"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Briefcase,
  User,
  Settings,
  LogOut,
  BriefcaseBusiness,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Separator } from "@repo/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@repo/auth/client";
import { cn } from "@repo/ui/lib/utils";

const navItems = [
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside aria-label="Sidebar navigation" className="flex h-full w-16 flex-col items-center border-r bg-card py-4 lg:w-56">
      {/* Logo */}
      <Link
        href="/dashboard/chat"
        className="mb-6 flex items-center gap-2 px-3"
      >
        <BriefcaseBusiness className="h-7 w-7 shrink-0 text-primary" />
        <span className="hidden text-lg font-bold lg:inline">Ever Jobs</span>
      </Link>

      {/* Navigation */}
      <nav aria-label="Dashboard navigation" className="flex flex-1 flex-col gap-1 px-2 w-full">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  !isActive && "text-muted-foreground"
                )}
                size="sm"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      <Separator className="my-2 w-10 lg:w-[calc(100%-1rem)]" />

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-2 px-2 w-full">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Sign out</span>
        </Button>
      </div>
    </aside>
  );
}
