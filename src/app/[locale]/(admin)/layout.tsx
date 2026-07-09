import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/guards";
import { PortalShell } from "@/components/portal-shell";
import type { NavItem } from "@/components/portal-nav";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(["admin"]);

  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/admin/approvals", label: "Approvals", icon: "BadgeCheck" },
    { href: "/admin/doctors", label: "Doctors", icon: "Stethoscope" },
    { href: "/admin/users", label: "Users", icon: "Users" },
    { href: "/admin/specialties", label: "Specialties", icon: "Tags" },
    { href: "/admin/appointments", label: "Appointments", icon: "Calendar" },
  ];

  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/admin"
    >
      {children}
    </PortalShell>
  );
}
