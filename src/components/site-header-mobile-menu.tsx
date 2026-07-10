"use client";

import { useEffect, useState } from "react";
import { usePathname, Link } from "@/i18n/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Stethoscope } from "lucide-react";

export function SiteHeaderMobileMenu({
  menuLabel,
  closeLabel,
  forPatientsLabel,
  forDoctorsLabel,
  loginLabel,
  registerLabel,
}: {
  menuLabel: string;
  closeLabel: string;
  forPatientsLabel: string;
  forDoctorsLabel: string;
  loginLabel: string;
  registerLabel: string;
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
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
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
              Doktori Im
            </SheetTitle>
          </SheetHeader>

          <nav className="flex flex-col gap-2">
            <Link
              href="/doctors"
              className="flex min-h-[48px] items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {forPatientsLabel}
            </Link>
            <Link
              href="/register/doctor"
              className="flex min-h-[48px] items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {forDoctorsLabel}
            </Link>
          </nav>

          <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-6">
            <Button asChild variant="ghost" className="min-h-[48px] w-full justify-start">
              <Link href="/login">{loginLabel}</Link>
            </Button>
            <Button asChild className="min-h-[48px] w-full">
              <Link href="/register">{registerLabel}</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
