"use client";

import { useEffect, useState } from "react";
import { usePathname, Link } from "@/i18n/navigation";
import { Menu, Stethoscope } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function SiteHeaderMobileMenu({
  menuLabel,
  closeLabel,
  asPatientLabel,
  asDoctorLabel,
  loginLabel,
  registerLabel,
  appNameLabel,
}: {
  menuLabel: string;
  closeLabel: string;
  asPatientLabel: string;
  asDoctorLabel: string;
  loginLabel: string;
  registerLabel: string;
  appNameLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        aria-label={open ? closeLabel : menuLabel}
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2 text-primary">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="size-4" />
              </span>
              {appNameLabel}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-3">
            <Button asChild variant="ghost" className="min-h-[48px] w-full justify-start">
              <Link href="/login">{loginLabel}</Link>
            </Button>
            <div className="h-px bg-border/60" />
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {registerLabel}
            </p>
            <Button asChild variant="outline" className="min-h-[48px] w-full justify-start">
              <Link href="/register">{asPatientLabel}</Link>
            </Button>
            <Button asChild className="min-h-[48px] w-full justify-start">
              <Link href="/register/doctor">{asDoctorLabel}</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
