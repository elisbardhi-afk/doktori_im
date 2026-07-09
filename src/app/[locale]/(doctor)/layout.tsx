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
    { href: "/doctor/availability", label: "Availability", icon: "CalendarClock" },
    { href: "/doctor/appointments", label: t("nav.myAppointments"), icon: "Calendar" },
    { href: "/doctor/profile", label: "Profile", icon: "UserCog" },
    { href: "/doctor/reviews", label: t("doctor.reviews"), icon: "Star" },
  ];

  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/doctor"
    >
      {children}
    </PortalShell>
  );
}
