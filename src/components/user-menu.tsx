"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LogOut, User } from "lucide-react";

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
      <Button asChild variant="ghost" size="sm" className="hidden max-w-36 sm:flex">
        <Link href={dashboardHref}>
          <span className="truncate font-semibold">{name}</span>
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" aria-label={t("profile.title")}>
        <Link href="/patient/profile">
          <User className="size-4" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" onClick={logout} aria-label={t("common.logout")}>
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
