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
          "rounded-full px-2.5 py-1 transition-colors flex items-center gap-1.5",
          locale === "sq" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <svg width="16" height="12" viewBox="0 0 960 600" className="flex-shrink-0">
          <rect width="960" height="600" fill="#CE2B37"/>
          <g transform="translate(480, 300)">
            <path d="M -80,-100 Q -120,-80 -140,-40 Q -150,0 -140,40 Q -120,80 -80,100 L -40,60 Q -60,40 -70,0 Q -60,-40 -40,-60 Z" fill="#000"/>
            <path d="M 80,-100 Q 120,-80 140,-40 Q 150,0 140,40 Q 120,80 80,100 L 40,60 Q 60,40 70,0 Q 60,-40 40,-60 Z" fill="#000"/>
            <path d="M -40,-60 L -20,-50 L 0,-45 L 20,-50 L 40,-60 L 30,-75 L 10,-80 L -10,-80 L -30,-75 Z" fill="#000"/>
            <path d="M -50,50 L -30,70 L 0,75 L 30,70 L 50,50" fill="#000"/>
          </g>
        </svg>
        AL
      </button>
      <button
        onClick={() => switchTo("en")}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors flex items-center gap-1.5",
          locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <svg width="16" height="12" viewBox="0 0 60 30" className="flex-shrink-0">
          <rect width="60" height="30" fill="#012169"/>
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFF" strokeWidth="6"/>
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath="polygon(0 0, 60 0, 60 30, 0 30)"/>
          <path d="M30,0 V30 M0,15 H60" stroke="#FFF" strokeWidth="4"/>
          <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="2"/>
        </svg>
        EN
      </button>
    </div>
  );
}
