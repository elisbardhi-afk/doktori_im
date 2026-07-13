import { setRequestLocale, getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import type { NavItem } from "@/components/portal-nav";

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, t] = await Promise.all([
    getCurrentUser(),
    getTranslations(),
  ]);

  const patientNavItems: NavItem[] = user?.role === "patient" ? [
    { href: "/", label: t("search.title"), icon: "Search" },
    { href: "/patient", label: t("nav.dashboard"), icon: "LayoutDashboard" },
    { href: "/patient/appointments", label: t("nav.myAppointments"), icon: "Calendar" },
    { href: "/patient/waitlist", label: t("nav.waitlist"), icon: "Clock" },
    { href: "/patient/profile", label: t("profile.title"), icon: "User" },
  ] : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className={`flex-1 ${user?.role === "patient" ? "pb-16 md:pb-0" : ""}`}>
        <div className="container">{children}</div>
      </div>
      <footer className="border-t border-border/60 py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © 2026 Doktori Im — Shqipëri
        </div>
      </footer>
      {user?.role === "patient" && <BottomNav items={patientNavItems} />}
    </div>
  );
}
