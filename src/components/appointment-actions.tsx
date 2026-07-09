"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transitionAppointment } from "@/actions/appointment-status";
import type { AppointmentStatus } from "@/lib/database.types";

export function AppointmentActions({
  appointmentId,
  status,
  startsAt,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  startsAt: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const past = new Date(startsAt) < new Date();

  async function act(transition: "confirm" | "complete" | "no_show") {
    setLoading(true);
    const res = await transitionAppointment(appointmentId, transition);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success("✓");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" && (
        <Button size="sm" onClick={() => act("confirm")} disabled={loading}>
          {t("common.confirm")}
        </Button>
      )}
      {status === "confirmed" && (
        <>
          <Button size="sm" variant="soft" onClick={() => act("complete")} disabled={loading}>
            {t("appointments.status.completed")}
          </Button>
          {past && (
            <Button size="sm" variant="ghost" onClick={() => act("no_show")} disabled={loading}>
              {t("appointments.status.no_show")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
