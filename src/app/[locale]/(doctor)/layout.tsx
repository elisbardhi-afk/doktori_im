import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/guards";
import { PortalShell } from "@/components/portal-shell";
import type { NavItem } from "@/components/portal-nav";

export default async function DoctorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(["doctor"]);
  const t = await getTranslations();

  const items: NavItem[] = [
    { href: "/doctor", label: t("nav.dashboard"), icon: "LayoutDashboard" },
    { href: "/doctor/availability", label: t("nav.availability"), icon: "CalendarClock" },
    { href: "/doctor/services", label: t("nav.services"), icon: "ClipboardList" },
    { href: "/doctor/calendar", label: t("nav.calendar"), icon: "CalendarDays" },
    { href: "/doctor/appointments", label: t("nav.appointments"), icon: "Calendar" },
    { href: "/doctor/profile", label: t("nav.profile"), icon: "UserCog" },
    { href: "/doctor/reviews", label: t("doctor.reviews"), icon: "Star" },
  ];

  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/doctor"
      userId={user.id}
    >
      {children}
    </PortalShell>
  );
}
