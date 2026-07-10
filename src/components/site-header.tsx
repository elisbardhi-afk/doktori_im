import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { Stethoscope } from "lucide-react";
import { SiteHeaderMobileMenu } from "@/components/site-header-mobile-menu";

export async function SiteHeader() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  const dashboardHref =
    user?.role === "doctor"
      ? "/doctor"
      : user?.role === "admin"
        ? "/admin"
        : "/patient";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-primary">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Stethoscope className="size-5" />
          </span>
          <span className="text-lg">{t("common.appName")}</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
          <Link href="/doctors" className="transition-colors hover:text-foreground">
            {t("nav.forPatients")}
          </Link>
          <Link href="/register/doctor" className="transition-colors hover:text-foreground">
            {t("nav.forDoctors")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user && <NotificationBell userId={user.id} />}
          {user ? (
            <UserMenu name={user.full_name ?? user.email} dashboardHref={dashboardHref} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t("common.login")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/register">{t("common.register")}</Link>
              </Button>
            </>
          )}
          {/* Mobile hamburger — only shown when user is not logged in (nav links are hidden) */}
          {!user && (
            <SiteHeaderMobileMenu
              menuLabel={t("nav.menu")}
              closeLabel={t("nav.close")}
              forPatientsLabel={t("nav.forPatients")}
              forDoctorsLabel={t("nav.forDoctors")}
              loginLabel={t("common.login")}
              registerLabel={t("common.register")}
              appNameLabel={t("common.appName")}
            />
          )}
        </div>
      </div>
    </header>
  );
}
