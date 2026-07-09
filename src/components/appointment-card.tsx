"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { cancelAppointment } from "@/actions/booking";
import { formatInTirane } from "@/lib/datetime";
import { Calendar, User, Stethoscope } from "lucide-react";
import type { AppointmentView } from "@/lib/queries/appointments";

export function AppointmentCard({
  appt,
  perspective,
}: {
  appt: AppointmentView;
  perspective: "patient" | "doctor";
}) {
  const t = useTranslations();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isUpcoming =
    new Date(appt.startsAt) > new Date() &&
    (appt.status === "confirmed" || appt.status === "pending");

  async function onCancel() {
    if (!confirm(t("appointments.cancelConfirm"))) return;
    setLoading(true);
    const res = await cancelAppointment({ appointmentId: appt.id });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success("✓");
    router.refresh();
  }

  const counterparty =
    perspective === "patient" ? appt.doctorName : appt.patientName;
  const CounterIcon = perspective === "patient" ? Stethoscope : User;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <CounterIcon className="size-4 text-primary" />
          <span className="font-bold text-foreground">{counterparty}</span>
          {appt.specialty && (
            <span className="text-sm text-primary">· {appt.specialty}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="size-4" />
          {formatInTirane(appt.startsAt, "EEEE, d MMM yyyy — HH:mm")}
        </div>
        {appt.reason && (
          <p className="text-sm text-muted-foreground">“{appt.reason}”</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={appt.status} />
        {isUpcoming && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </Card>
  );
}
