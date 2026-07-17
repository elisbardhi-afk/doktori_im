"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatInTirane } from "@/lib/datetime";
import { Eye, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { transitionAppointment } from "@/actions/appointment-status";
import { cancelAppointment } from "@/actions/booking";
import type { AppointmentView } from "@/lib/queries/appointments";

export interface DoctorAppointmentQuickActionsProps {
  appointment: AppointmentView;
  isOpen: boolean;
  position: { top: number; left: number };
  onClose: () => void;
}

export function DoctorAppointmentQuickActions({
  appointment,
  isOpen,
  position,
  onClose,
}: DoctorAppointmentQuickActionsProps) {
  const router = useRouter();
  const t = useTranslations();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const isPending = appointment.status === "pending";
  const isConfirmed = appointment.status === "confirmed";

  const handleViewDetails = () => {
    router.push(`/doctor/appointments/${appointment.id}`);
    onClose();
  };

  const handleConfirm = async () => {
    setLoading(true);
    const res = await transitionAppointment(appointment.id, "confirm");
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    router.refresh();
    onClose();
  };

  const handleCancel = async () => {
    setLoading(true);
    const res = await cancelAppointment({ appointmentId: appointment.id });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("appointments.cancelled"));
    router.refresh();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <div
        className="absolute z-50 w-56 rounded-2xl border border-border bg-card shadow-lift"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {appointment.patientName}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatInTirane(appointment.startsAt, "d MMM, HH:mm")}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewDetails}
            className="justify-start"
            disabled={loading}
          >
            <Eye className="mr-2 size-4" />
            {t("appointments.viewDetails")}
          </Button>

          {isPending && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleConfirm}
              className="justify-start"
              disabled={loading}
            >
              <CheckCircle className="mr-2 size-4" />
              {t("common.confirm")}
            </Button>
          )}

          {(isPending || isConfirmed) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="justify-start text-destructive hover:text-destructive"
              disabled={loading}
            >
              <XCircle className="mr-2 size-4" />
              {t("appointments.cancel")}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
