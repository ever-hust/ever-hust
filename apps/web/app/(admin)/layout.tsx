import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/get-session-user";
import { getUserRole } from "@/lib/auth-roles";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Ever Jobs Admin",
  },
  robots: {
    index: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?callbackUrl=/admin");
  }

  const role = await getUserRole(user.id);

  if (role !== "admin") {
    redirect("/chat");
  }

  return (
    <div className="flex h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <AdminSidebar />
      <main
        id="main-content"
        className="flex flex-1 flex-col overflow-y-auto bg-background"
      >
        {children}
      </main>
    </div>
  );
}
