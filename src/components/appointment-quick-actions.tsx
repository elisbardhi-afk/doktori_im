"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatInTirane } from "@/lib/datetime";
import { Eye, MessageSquare, Clock } from "lucide-react";
import type { AppointmentView } from "@/lib/queries/appointments";

export interface AppointmentQuickActionsProps {
  appointment: AppointmentView;
  isOpen: boolean;
  position: {
    top: number;
    left: number;
  };
  onClose: () => void;
  onSendMessage: () => void;
  onReschedule: () => void;
}

export function AppointmentQuickActions({
  appointment,
  isOpen,
  position,
  onClose,
  onSendMessage,
  onReschedule,
}: AppointmentQuickActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  if (!isOpen) return null;

  const isUpcoming =
    new Date(appointment.startsAt) > new Date() &&
    (appointment.status === "confirmed" || appointment.status === "pending");

  const handleViewDetails = () => {
    router.push(`/patient/appointments/${appointment.id}`);
    onClose();
  };

  const handleSendMessage = () => {
    onSendMessage();
    onClose();
  };

  const handleReschedule = () => {
    onReschedule();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Popover */}
      <div
        className="absolute z-50 w-56 rounded-2xl border border-border bg-card shadow-lift"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {appointment.doctorName}
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
          >
            <Eye className="mr-2 size-4" />
            {t("appointments.viewDetails")}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSendMessage}
            className="justify-start"
          >
            <MessageSquare className="mr-2 size-4" />
            {t("appointments.sendMessage")}
          </Button>

          {isUpcoming && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReschedule}
              className="justify-start"
            >
              <Clock className="mr-2 size-4" />
              {t("appointments.changeTime")}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
