"use client";

import { useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enUS, sq as sqLocale } from "date-fns/locale";
import { formatInTirane, timeInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { AppointmentView } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/lib/database.types";

export type CalendarView = "day" | "week" | "month";

const START_HOUR = 6;
const END_HOUR = 22;
const PX_PER_15MIN = 16;
const TOTAL_PX = (END_HOUR - START_HOUR) * 4 * PX_PER_15MIN;
const DAYS_SQ = ["Hë", "Ma", "Më", "En", "Pr", "Sh", "Di"];
const DAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function statusColor(status: AppointmentStatus) {
  switch (status) {
    case "confirmed": return "bg-primary text-primary-foreground";
    case "pending": return "bg-amber-400 text-amber-950";
    case "completed": return "bg-muted-foreground/40 text-foreground";
    case "cancelled":
    case "no_show": return "bg-destructive/30 text-destructive-foreground";
  }
}

function topPx(startsAt: string): number {
  const local = formatInTirane(startsAt, "HH:mm");
  const [h, m] = local.split(":").map(Number);
  const minsFromStart = (h - START_HOUR) * 60 + m;
  return Math.max(0, (minsFromStart / 15) * PX_PER_15MIN);
}

function heightPx(startsAt: string, endsAt: string): number {
  const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  const durationMins = durationMs / 60000;
  return Math.max(PX_PER_15MIN, (durationMins / 15) * PX_PER_15MIN);
}

function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function localDateOf(iso: string): Date {
  const tirane = formatInTirane(iso, "yyyy-MM-dd");
  return new Date(tirane + "T00:00:00");
}

function TimelineLabels() {
  return (
    <div className="flex flex-col" style={{ width: 48, minWidth: 48 }}>
      {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
        <div
          key={i}
          style={{ height: 4 * PX_PER_15MIN }}
          className="flex items-start justify-end pr-2 text-xs text-muted-foreground/60"
        >
          {String(START_HOUR + i).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

function AppointmentBlock({ appt }: { appt: AppointmentView }) {
  const top = topPx(appt.startsAt);
  const height = heightPx(appt.startsAt, appt.endsAt);
  return (
    <div
      className={cn(
        "absolute left-0.5 right-0.5 overflow-hidden rounded-lg px-1.5 py-0.5 text-xs font-semibold shadow-sm",
        statusColor(appt.status),
      )}
      style={{ top, height }}
    >
      <p className="truncate">{appt.patientName}</p>
      <p className="truncate opacity-80">
        {timeInTirane(appt.startsAt)}–{timeInTirane(appt.endsAt)}
      </p>
    </div>
  );
}

function DayView({ date, appointments }: { date: Date; appointments: AppointmentView[] }) {
  const dayAppts = appointments.filter((a) => isSameDay(localDateOf(a.startsAt), date));
  return (
    <div className="flex overflow-x-auto">
      <TimelineLabels />
      <div className="relative flex-1 border-l border-border" style={{ height: TOTAL_PX }}>
        {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-border/40"
            style={{ top: i * 4 * PX_PER_15MIN }}
          />
        ))}
        {dayAppts.map((a) => <AppointmentBlock key={a.id} appt={a} />)}
      </div>
    </div>
  );
}

function WeekView({ weekOf, appointments }: { weekOf: Date; appointments: AppointmentView[] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));

  return (
    <div className="flex overflow-x-auto">
      <TimelineLabels />
      {days.map((day, col) => {
        const dayAppts = appointments.filter((a) => isSameDay(localDateOf(a.startsAt), day));
        const isToday = isSameDay(day, today);
        return (
          <div
            key={col}
            className={cn(
              "relative flex-1 border-l border-border",
              isToday && "bg-primary/5",
            )}
            style={{ height: TOTAL_PX, minWidth: 90 }}
          >
            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-border/40"
                style={{ top: i * 4 * PX_PER_15MIN }}
              />
            ))}
            {dayAppts.map((a) => <AppointmentBlock key={a.id} appt={a} />)}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  year,
  month,
  appointments,
  onDayClick,
  days,
}: {
  year: number;
  month: number;
  appointments: AppointmentView[];
  onDayClick: (date: Date) => void;
  days: string[];
}) {
  const today = new Date();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = weekStart(firstOfMonth);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {days.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isCurrentMonth = cell.getMonth() === month;
          const isToday = isSameDay(cell, today);
          const dayAppts = appointments.filter((a) => isSameDay(localDateOf(a.startsAt), cell));
          const shown = dayAppts.slice(0, 3);
          const overflow = dayAppts.length - 3;

          return (
            <div
              key={i}
              onClick={() => onDayClick(cell)}
              className={cn(
                "min-h-24 cursor-pointer border-b border-r border-border p-1.5 transition-colors hover:bg-secondary/60",
                !isCurrentMonth && "bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  isToday && "bg-primary text-primary-foreground",
                  !isToday && isCurrentMonth && "text-foreground",
                  !isCurrentMonth && "text-muted-foreground",
                )}
              >
                {cell.getDate()}
              </span>
              {shown.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "mb-0.5 truncate rounded px-1 py-0.5 text-xs font-medium",
                    statusColor(a.status),
                  )}
                >
                  {timeInTirane(a.startsAt)} {a.patientName}
                </div>
              ))}
              {overflow > 0 && (
                <p className="text-xs text-muted-foreground">+{overflow}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DoctorCalendar({
  view,
  dateStr,
  appointments,
}: {
  view: CalendarView;
  dateStr: string;
  appointments: AppointmentView[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const weekdayAbbr = locale === "en" ? DAYS_EN : DAYS_SQ;
  const dateLocale = locale === "en" ? enUS : sqLocale;

  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();

  const navigate = useCallback(
    (newView: CalendarView, newDate: Date) => {
      const d = formatInTirane(newDate.toISOString(), "yyyy-MM-dd");
      router.replace(`${pathname}?view=${newView}&date=${d}`);
    },
    [router, pathname],
  );

  function prevDate() {
    if (view === "day") navigate("day", addDays(date, -1));
    else if (view === "week") navigate("week", addDays(date, -7));
    else navigate("month", new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }

  function nextDate() {
    if (view === "day") navigate("day", addDays(date, 1));
    else if (view === "week") navigate("week", addDays(date, 7));
    else navigate("month", new Date(date.getFullYear(), date.getMonth() + 1, 1));
  }

  const weekOf = weekStart(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));

  const headerLabel =
    view === "day"
      ? formatInTirane(date.toISOString(), "EEEE, d MMMM yyyy", dateLocale)
      : view === "week"
        ? `${formatInTirane(weekDays[0].toISOString(), "d MMM", dateLocale)} – ${formatInTirane(weekDays[6].toISOString(), "d MMM yyyy", dateLocale)}`
        : formatInTirane(new Date(date.getFullYear(), date.getMonth(), 1).toISOString(), "MMMM yyyy", dateLocale);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl border border-border bg-secondary p-1">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => navigate(v, date)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
                view === v
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`calendar.${v === "day" ? "daily" : v === "week" ? "weekly" : "monthly"}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevDate}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-48 text-center text-sm font-semibold text-foreground">
            {headerLabel}
          </span>
          <Button variant="ghost" size="icon" onClick={nextDate}>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(view, today)}
            className="ml-2"
          >
            {t("calendar.today")}
          </Button>
        </div>
      </div>

      {view === "week" && (
        <div className="flex pl-12">
          {weekDays.map((d, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 py-2 text-center text-xs font-semibold",
                isSameDay(d, today) ? "text-primary" : "text-muted-foreground",
              )}
              style={{ minWidth: 90 }}
            >
              {formatInTirane(d.toISOString(), "EEE d", dateLocale)}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {view === "day" && (
          <div className="overflow-y-auto" style={{ maxHeight: "70vh" }}>
            <DayView date={date} appointments={appointments} />
          </div>
        )}
        {view === "week" && (
          <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
            <WeekView weekOf={weekOf} appointments={appointments} />
          </div>
        )}
        {view === "month" && (
          <MonthView
            year={date.getFullYear()}
            month={date.getMonth()}
            appointments={appointments}
            onDayClick={(d) => navigate("day", d)}
            days={weekdayAbbr}
          />
        )}
      </div>

      {appointments.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {t("calendar.noAppointments")}
        </p>
      )}
    </div>
  );
}
