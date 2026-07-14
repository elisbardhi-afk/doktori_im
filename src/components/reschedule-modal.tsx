"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatInTirane, timeInTirane } from "@/lib/datetime";
import { rescheduleAppointment, fetchDoctorSlots } from "@/actions/appointment-edit";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { AvailableSlot } from "@/lib/database.types";

export function RescheduleModal({
  appointmentId,
  doctorId,
  currentStartsAt,
  durationMinutes,
  isOpen,
  onClose,
}: {
  appointmentId: string;
  doctorId: string;
  currentStartsAt: string;
  durationMinutes: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(
    formatInTirane(currentStartsAt, "yyyy-MM-dd"),
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Parse selected date for calendar navigation
  const [year, month, day] = selectedDate.split("-").map(Number);
  const currentDateObj = new Date(year, month - 1, day);

  // Fetch slots when date changes
  useEffect(() => {
    setSlotsLoading(true);
    fetchDoctorSlots(doctorId, selectedDate, selectedDate)
      .then((result) => {
        setSlots(result);
        setSelectedTime(null);
      })
      .catch(() => {
        toast.error("Failed to load available slots");
        setSlots([]);
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, doctorId]);

  if (!isOpen) return null;

  const handlePrevDay = () => {
    const prev = new Date(currentDateObj);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(formatInTirane(prev.toISOString(), "yyyy-MM-dd"));
  };

  const handleNextDay = () => {
    const next = new Date(currentDateObj);
    next.setDate(next.getDate() + 1);
    setSelectedDate(formatInTirane(next.toISOString(), "yyyy-MM-dd"));
  };

  const handleConfirm = async () => {
    if (!selectedTime) {
      toast.error(t("booking.selectTime") || "Please select a time");
      return;
    }

    setLoading(true);
    // Construct ISO timestamp with +00:00 offset (UTC; DB stores all times as UTC)
    const newStartsAt = `${selectedDate}T${selectedTime}:00+00:00`;
    const result = await rescheduleAppointment(appointmentId, newStartsAt, durationMinutes);
    setLoading(false);

    if (!result.ok) {
      const errorMessages: Record<string, string> = {
        SLOT_NOT_AVAILABLE:
          t("booking.errSlotTaken") || "This time is no longer available",
        SLOT_IN_PAST:
          t("booking.errSlotInPast") || "Cannot reschedule to a past time",
        APPOINTMENT_CANCELLED:
          t("appointments.cancelled") || "Cannot reschedule cancelled appointment",
      };
      toast.error(errorMessages[result.error || ""] || t("common.error"));
      return;
    }

    toast.success(t("appointments.rescheduled") || "Appointment rescheduled");
    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <h3 className="mb-4 text-lg font-bold text-foreground">
          {t("appointments.reschedule") || "Reschedule Appointment"}
        </h3>

        {/* Date Navigation */}
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevDay}
            disabled={slotsLoading}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-semibold text-foreground">
            {formatInTirane(new Date(year, month - 1, day).toISOString(), "EEEE, d MMM")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextDay}
            disabled={slotsLoading}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Time Slots */}
        <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
          {slotsLoading ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : slots.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("booking.noSlots") || "No available slots"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.slot_start}
                  onClick={() => setSelectedTime(slot.local_time)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-semibold shadow-soft transition-colors",
                    selectedTime === slot.local_time
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary",
                  )}
                >
                  {slot.local_time}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !selectedTime}>
            {loading ? t("common.loading") : t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
