import type { Metadata } from "next";
import { APP_NAME } from "@ever-hust/utils";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/get-session-user";
import { getUserRole } from "@/lib/auth-roles";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: `%s | ${APP_NAME} Admin`,
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
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen">
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
