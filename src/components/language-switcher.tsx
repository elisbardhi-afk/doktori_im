"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: "sq" | "en") {
    if (next === locale) return;
    router.replace(pathname, { locale: next });
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs font-semibold shadow-soft",
        className,
      )}
    >
      <button
        onClick={() => switchTo("sq")}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          locale === "sq" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        🇦🇱 SQ
      </button>
      <button
        onClick={() => switchTo("en")}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        🇬🇧 EN
      </button>
    </div>
  );
}
