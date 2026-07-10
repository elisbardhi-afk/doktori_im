"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setDoctorStatus } from "@/actions/admin";
import type { DoctorStatus } from "@/lib/database.types";

export function DoctorStatusActions({
  doctorId,
  status,
}: {
  doctorId: string;
  status: DoctorStatus;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const L = (en: string, sq: string) => (locale === "en" ? en : sq);

  async function set(next: DoctorStatus) {
    setLoading(true);
    const res = await setDoctorStatus(doctorId, next);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "approved" && (
        <Button size="sm" onClick={() => set("approved")} disabled={loading}>
          {L("Approve", "Mirato")}
        </Button>
      )}
      {status === "pending" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => set("suspended")}
          disabled={loading}
        >
          {L("Reject", "Refuzo")}
        </Button>
      )}
      {status === "approved" && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => set("suspended")}
          disabled={loading}
        >
          {L("Suspend", "Pezullo")}
        </Button>
      )}
    </div>
  );
}
