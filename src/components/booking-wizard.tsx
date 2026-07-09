"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createBooking, type BookErrorCode } from "@/actions/booking";
import { timeInTirane, formatInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { CalendarCheck, Clock } from "lucide-react";
import type { AvailableSlot } from "@/lib/database.types";

const errorMsg: Record<BookErrorCode, string> = {
  SLOT_TAKEN: "booking.slotTaken",
  SLOT_NOT_AVAILABLE: "booking.slotTaken",
  SLOT_IN_PAST: "booking.slotTaken",
  DUPLICATE_BOOKING: "booking.slotTaken",
  DOCTOR_NOT_BOOKABLE: "booking.slotTaken",
  AUTH_REQUIRED: "booking.slotTaken",
  UNKNOWN: "booking.slotTaken",
};

function periodOf(localTime: string): "morning" | "afternoon" | "evening" {
  const h = parseInt(localTime.slice(0, 2), 10);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function BookingWizard({
  doctorId,
  doctorName,
  slots,
  isAuthed,
}: {
  doctorId: string;
  doctorName: string;
  slots: AvailableSlot[];
  isAuthed: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [selected, setSelected] = useState<AvailableSlot | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Group slots by local date.
  const byDate = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>();
    for (const s of slots) {
      const arr = map.get(s.local_date) ?? [];
      arr.push(s);
      map.set(s.local_date, arr);
    }
    return map;
  }, [slots]);

  const dates = Array.from(byDate.keys());
  const [activeDate, setActiveDate] = useState<string | null>(dates[0] ?? null);

  const daySlots = activeDate ? (byDate.get(activeDate) ?? []) : [];
  const periods = {
    morning: daySlots.filter((s) => periodOf(s.local_time) === "morning"),
    afternoon: daySlots.filter((s) => periodOf(s.local_time) === "afternoon"),
    evening: daySlots.filter((s) => periodOf(s.local_time) === "evening"),
  };

  async function confirm() {
    if (!selected) return;
    if (!isAuthed) {
      router.push("/login");
      return;
    }
    setLoading(true);
    const res = await createBooking({
      doctorId,
      startsAt: selected.slot_start,
      reason: reason || undefined,
    });
    setLoading(false);

    if (!res.ok) {
      toast.error(t(errorMsg[res.error ?? "UNKNOWN"]));
      // Refresh to pull fresh availability if the slot was taken.
      router.refresh();
      setSelected(null);
      return;
    }
    toast.success(t("booking.success"));
    router.push("/patient/appointments");
    router.refresh();
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        {t("booking.noSlots")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Date selector */}
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          {t("booking.selectDate")}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => {
                setActiveDate(d);
                setSelected(null);
              }}
              className={cn(
                "flex min-w-16 flex-col items-center rounded-xl border px-3 py-2 text-sm shadow-soft transition-colors",
                activeDate === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              <span className="font-bold">{formatInTirane(`${d}T12:00:00Z`, "d")}</span>
              <span className="text-xs">{formatInTirane(`${d}T12:00:00Z`, "MMM")}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Time selector grouped by period */}
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          {t("booking.selectTime")}
        </p>
        <div className="flex flex-col gap-3">
          {(["morning", "afternoon", "evening"] as const).map((period) =>
            periods[period].length > 0 ? (
              <div key={period}>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {t(`booking.${period}`)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {periods[period].map((s) => (
                    <button
                      key={s.slot_start}
                      onClick={() => setSelected(s)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold shadow-soft transition-colors",
                        selected?.slot_start === s.slot_start
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-primary hover:bg-primary-soft",
                      )}
                    >
                      {timeInTirane(s.slot_start)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </div>

      {/* Summary + confirm */}
      {selected && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary-tint p-4">
          <p className="text-sm font-semibold text-foreground">{t("booking.summary")}</p>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CalendarCheck className="size-4 text-primary" />
            {doctorName}
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Clock className="size-4 text-primary" />
            {formatInTirane(selected.slot_start, "EEEE, d MMM yyyy — HH:mm")}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("booking.reasonPlaceholder")}
            rows={2}
          />
          <Button onClick={confirm} size="lg" disabled={loading}>
            {loading ? t("common.loading") : t("booking.confirmBooking")}
          </Button>
        </div>
      )}
    </div>
  );
}
