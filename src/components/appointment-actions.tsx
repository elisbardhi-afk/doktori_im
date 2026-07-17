"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transitionAppointment } from "@/actions/appointment-status";
import { cancelAppointment } from "@/actions/booking";
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

  async function act(transition: "confirm" | "complete") {
    setLoading(true);
    const res = await transitionAppointment(appointmentId, transition);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    router.refresh();
  }

  async function onCancel() {
    setLoading(true);
    const res = await cancelAppointment({ appointmentId });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("appointments.cancelled"));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" && (
        <>
          <Button size="sm" onClick={() => act("confirm")} disabled={loading}>
            {t("common.confirm")}
          </Button>
          <Button size="sm" variant="destructive" onClick={onCancel} disabled={loading}>
            {t("appointments.cancel")}
          </Button>
        </>
      )}
      {status === "confirmed" && (
        <>
          <Button size="sm" variant="soft" onClick={() => act("complete")} disabled={loading}>
            {t("appointments.status.completed")}
          </Button>
          <Button size="sm" variant="destructive" onClick={onCancel} disabled={loading}>
            {t("appointments.cancel")}
          </Button>
        </>
      )}
    </div>
  );
}
