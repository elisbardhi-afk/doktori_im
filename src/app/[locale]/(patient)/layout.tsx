import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/guards";
import { PortalShell } from "@/components/portal-shell";
import type { NavItem } from "@/components/portal-nav";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, t] = await Promise.all([
    requireRole(["patient"]),
    getTranslations(),
  ]);

  const items: NavItem[] = [
    { href: "/", label: t("search.title"), icon: "Search" },
    { href: "/patient", label: t("nav.dashboard"), icon: "LayoutDashboard" },
    { href: "/patient/appointments", label: t("nav.myAppointments"), icon: "Calendar" },
    { href: "/patient/waitlist", label: t("nav.waitlist"), icon: "Clock" },
    { href: "/patient/profile", label: t("profile.title"), icon: "User" },
  ];

  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/patient"
      userId={user.id}
      variant="patient"
    >
      {children}
    </PortalShell>
  );
}
