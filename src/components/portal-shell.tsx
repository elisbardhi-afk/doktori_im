import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { PortalNav, type NavItem } from "@/components/portal-nav";
import { BottomNav } from "@/components/bottom-nav";
import { MobileDrawer } from "@/components/mobile-drawer";
import { Stethoscope } from "lucide-react";

export async function PortalShell({
  items,
  userName,
  dashboardHref,
  userId,
  variant,
  children,
}: {
  items: NavItem[];
  userName: string;
  dashboardHref: string;
  userId: string;
  variant: "patient" | "doctor" | "admin";
  children: React.ReactNode;
}) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-primary-tint/40">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          {/* Mobile drawer trigger — doctor and admin only */}
          {(variant === "doctor" || variant === "admin") && (
            <MobileDrawer items={items} portalLabel={t("common.appName")} />
          )}

          <Link href="/" className="flex items-center gap-2 font-extrabold text-primary">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
              <Stethoscope className="size-5" />
            </span>
            <span className="text-lg">{t("common.appName")}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell userId={userId} userRole={variant} />
            <UserMenu name={userName} dashboardHref={dashboardHref} />
          </div>
        </div>
      </header>

      <div className="container flex flex-1 gap-6 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <PortalNav items={items} />
        </aside>
        <main className={`min-w-0 flex-1 ${variant === "patient" ? "pb-16 md:pb-0" : ""}`}>
          {children}
        </main>
      </div>

      {/* Patient bottom tab bar */}
      {variant === "patient" && <BottomNav items={items} />}
    </div>
  );
}
