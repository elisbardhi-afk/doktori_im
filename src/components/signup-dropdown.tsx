"use client";

import { useState, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export function SignUpDropdown({
  registerLabel,
  asPatientLabel,
  asDoctorLabel,
}: {
  registerLabel: string;
  asPatientLabel: string;
  asDoctorLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function handleMouseLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      className="relative hidden sm:block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button size="sm" className="flex items-center gap-1 select-none" tabIndex={-1} aria-haspopup="true" aria-expanded={open}>
        {registerLabel}
        <ChevronDown
          className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </Button>

      <div
        className={`absolute right-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-border/60 bg-background shadow-lg transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <Link
          href="/register/patient"
          className="flex items-center px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          {asPatientLabel}
        </Link>
        <div className="mx-3 h-px bg-border/60" />
        <Link
          href="/register/doctor"
          className="flex items-center px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          {asDoctorLabel}
        </Link>
      </div>
    </div>
  );
}
