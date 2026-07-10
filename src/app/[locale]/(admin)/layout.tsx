import { setRequestLocale, getTranslations } from "next-intl/server";
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
  const t = await getTranslations();

  const items: NavItem[] = [
    { href: "/admin", label: t("nav.dashboard"), icon: "LayoutDashboard" },
    { href: "/admin/approvals", label: t("nav.approvals"), icon: "BadgeCheck" },
    { href: "/admin/doctors", label: t("nav.doctors"), icon: "Stethoscope" },
    { href: "/admin/users", label: t("nav.users"), icon: "Users" },
    { href: "/admin/specialties", label: t("nav.specialties"), icon: "Tags" },
    { href: "/admin/appointments", label: t("nav.appointments"), icon: "Calendar" },
  ];

  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/admin"
      userId={user.id}
      variant="admin"
    >
      {children}
    </PortalShell>
  );
}
