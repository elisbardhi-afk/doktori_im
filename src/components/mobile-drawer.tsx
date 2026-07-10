"use client";

import { useEffect, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu, Stethoscope } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PortalNav, type NavItem } from "@/components/portal-nav";

export function MobileDrawer({
  items,
  portalLabel,
}: {
  items: NavItem[];
  portalLabel: string;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        aria-label={t("menu")}
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 pt-0">
          <SheetHeader className="border-b border-border/60 px-4 py-4">
            <SheetTitle className="flex items-center gap-2 text-primary">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="size-4" />
              </span>
              {portalLabel}
            </SheetTitle>
          </SheetHeader>
          <div className="p-3">
            <PortalNav items={items} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
