"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LayoutDashboard, LogOut } from "lucide-react";

export function UserMenu({
  name,
  dashboardHref,
}: {
  name: string;
  dashboardHref: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="soft" size="sm">
        <Link href={dashboardHref}>
          <LayoutDashboard className="size-4" />
          <span className="hidden sm:inline">{t("nav.dashboard")}</span>
        </Link>
      </Button>
      <span className="hidden max-w-28 truncate text-sm font-semibold text-foreground lg:inline">
        {name}
      </span>
      <Button variant="ghost" size="icon" onClick={logout} aria-label={t("common.logout")}>
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
