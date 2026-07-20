# Doctor Calendar Appointment Popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make appointment blocks on the doctor's calendar clickable, opening a positioned popover with View Details, Confirm, and Cancel actions.

**Architecture:** Add a new `DoctorAppointmentQuickActions` component (mirroring the patient's `AppointmentQuickActions`) and wire it into `DoctorCalendar` by converting `AppointmentBlock` to a `<button>`, threading an `onAppointmentClick` handler through `DayView`/`WeekView`/`MonthView`, and managing `selectedAppt` + `popoverPos` state at the calendar root.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, next-intl, Tailwind CSS, Sonner (toast), Lucide icons, existing server actions (`transitionAppointment`, `cancelAppointment`).

## Global Constraints

- All i18n strings must use existing keys via `useTranslations()` — do not hardcode English text
- Existing translation keys to use: `appointments.viewDetails`, `appointments.cancel`, `appointments.cancelled`, `common.confirm`, `common.saved`
- Route for doctor appointment detail: `/doctor/appointments/${id}` (use `useRouter` from `@/i18n/navigation`)
- Server actions: `transitionAppointment` from `@/actions/appointment-status`, `cancelAppointment` from `@/actions/booking`
- Toast via `sonner`: `toast.error(msg)` / `toast.success(msg)`
- Use `formatInTirane` from `@/lib/datetime` for date formatting
- `AppointmentView` type from `@/lib/queries/appointments`
- `AppointmentStatus` type from `@/lib/database.types`
- No Co-Authored-By in commit messages

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/doctor-appointment-quick-actions.tsx` | **Create** | Positioned popover for doctor — View Details, Confirm, Cancel |
| `src/components/doctor-calendar.tsx` | **Modify** | Wire click state + handler; convert blocks to buttons; render popover |

---

### Task 1: Create `DoctorAppointmentQuickActions` component

**Files:**
- Create: `src/components/doctor-appointment-quick-actions.tsx`

**Interfaces:**
- Consumes: `AppointmentView` from `@/lib/queries/appointments`
- Produces: `DoctorAppointmentQuickActions` component, exported, with props:
  ```ts
  {
    appointment: AppointmentView;
    isOpen: boolean;
    position: { top: number; left: number };
    onClose: () => void;
  }
  ```

- [ ] **Step 1: Create the component file**

Create `src/components/doctor-appointment-quick-actions.tsx` with this full content:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:/Users/ebardhi/Downloads/claude demo projects/doktori_im"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `doctor-appointment-quick-actions.tsx`. (Other pre-existing errors are acceptable.)

- [ ] **Step 3: Commit**

```bash
git add src/components/doctor-appointment-quick-actions.tsx
git commit -m "feat: add DoctorAppointmentQuickActions popover component"
```

---

### Task 2: Wire click handling into `DoctorCalendar`

**Files:**
- Modify: `src/components/doctor-calendar.tsx`

**Interfaces:**
- Consumes: `DoctorAppointmentQuickActions` from `./doctor-appointment-quick-actions`
- `AppointmentBlock` new signature:
  ```ts
  function AppointmentBlock({
    appt,
    onClick,
  }: {
    appt: AppointmentView;
    onClick?: (appt: AppointmentView, e: React.MouseEvent) => void;
  })
  ```
- `DayView` new signature:
  ```ts
  function DayView({
    date,
    appointments,
    onAppointmentClick,
  }: {
    date: Date;
    appointments: AppointmentView[];
    onAppointmentClick: (appt: AppointmentView, e: React.MouseEvent) => void;
  })
  ```
- `WeekView` new signature: same `onAppointmentClick` prop added
- `MonthView` new signature: same `onAppointmentClick` prop added

- [ ] **Step 1: Update `AppointmentBlock` — convert `<div>` to `<button>` with `onClick`**

In `src/components/doctor-calendar.tsx`, replace the `AppointmentBlock` function (lines 88–105) with:

```tsx
function AppointmentBlock({
  appt,
  onClick,
}: {
  appt: AppointmentView;
  onClick?: (appt: AppointmentView, e: React.MouseEvent) => void;
}) {
  const top = topPx(appt.startsAt);
  const height = heightPx(appt.startsAt, appt.endsAt);
  return (
    <button
      type="button"
      onClick={(e) => onClick?.(appt, e)}
      className={cn(
        "absolute left-0.5 right-0.5 overflow-hidden rounded-lg px-1.5 py-0.5 text-left text-xs font-semibold shadow-sm",
        statusColor(appt.status),
      )}
      style={{ top, height }}
    >
      <p className="truncate">{appt.patientName}</p>
      <p className="truncate opacity-80">
        {timeInTirane(appt.startsAt)}–{timeInTirane(appt.endsAt)}
      </p>
    </button>
  );
}
```

- [ ] **Step 2: Update `DayView` to accept and pass `onAppointmentClick`**

Replace the `DayView` function signature and its `AppointmentBlock` usage:

```tsx
function DayView({
  date,
  appointments,
  onAppointmentClick,
}: {
  date: Date;
  appointments: AppointmentView[];
  onAppointmentClick: (appt: AppointmentView, e: React.MouseEvent) => void;
}) {
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
        {dayAppts.map((a) => (
          <AppointmentBlock key={a.id} appt={a} onClick={onAppointmentClick} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `WeekView` to accept and pass `onAppointmentClick`**

Replace the `WeekView` function signature and its `AppointmentBlock` usages:

```tsx
function WeekView({
  weekOf,
  appointments,
  onAppointmentClick,
}: {
  weekOf: Date;
  appointments: AppointmentView[];
  onAppointmentClick: (appt: AppointmentView, e: React.MouseEvent) => void;
}) {
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
            {dayAppts.map((a) => (
              <AppointmentBlock key={a.id} appt={a} onClick={onAppointmentClick} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Update `MonthView` to accept `onAppointmentClick` and make pills clickable**

Replace the `MonthView` function signature, adding the `onAppointmentClick` prop, and convert appointment pills from `<div>` to `<button>` with `stopPropagation`:

```tsx
function MonthView({
  year,
  month,
  appointments,
  onDayClick,
  onAppointmentClick,
  days,
}: {
  year: number;
  month: number;
  appointments: AppointmentView[];
  onDayClick: (date: Date) => void;
  onAppointmentClick: (appt: AppointmentView, e: React.MouseEvent) => void;
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
          const dayAppts = appointments
            .filter((a) => isSameDay(localDateOf(a.startsAt), cell))
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
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
                <button
                  key={a.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAppointmentClick(a, e); }}
                  className={cn(
                    "mb-0.5 w-full truncate rounded px-1 py-0.5 text-left text-xs font-medium",
                    statusColor(a.status),
                  )}
                >
                  {timeInTirane(a.startsAt)} {a.patientName}
                </button>
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
```

- [ ] **Step 5: Update `DoctorCalendar` root — add state, handler, and render popover**

In the `DoctorCalendar` function body, add these imports at the top of the file (after existing imports):

```tsx
import { useState } from "react";
import { DoctorAppointmentQuickActions } from "@/components/doctor-appointment-quick-actions";
```

Then inside the `DoctorCalendar` function, add state and handler after the existing `const weekOf` line:

```tsx
const [selectedAppt, setSelectedAppt] = useState<AppointmentView | null>(null);
const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

function handleAppointmentClick(appt: AppointmentView, e: React.MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setPopoverPos({ top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX });
  setSelectedAppt(appt);
}
```

Pass `onAppointmentClick={handleAppointmentClick}` to `DayView`, `WeekView`, and `MonthView`. Replace the three view renders:

```tsx
{view === "day" && (
  <div className="overflow-y-auto" style={{ maxHeight: "70vh" }}>
    <DayView date={date} appointments={appointments} onAppointmentClick={handleAppointmentClick} />
  </div>
)}
{view === "week" && (
  <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
    <WeekView weekOf={weekOf} appointments={appointments} onAppointmentClick={handleAppointmentClick} />
  </div>
)}
{view === "month" && (
  <MonthView
    year={date.getFullYear()}
    month={date.getMonth()}
    appointments={appointments}
    onDayClick={(d) => navigate("day", d)}
    onAppointmentClick={handleAppointmentClick}
    days={weekdayAbbr}
  />
)}
```

Add the popover render at the very end of the returned JSX, just before the closing `</div>`:

```tsx
{selectedAppt && popoverPos && (
  <DoctorAppointmentQuickActions
    appointment={selectedAppt}
    isOpen={true}
    position={popoverPos}
    onClose={() => { setSelectedAppt(null); setPopoverPos(null); }}
  />
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "c:/Users/ebardhi/Downloads/claude demo projects/doktori_im"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/doctor-calendar.tsx
git commit -m "feat: make doctor calendar appointments clickable with quick-actions popover"
```

---

## Self-Review

**Spec coverage:**
- ✅ Appointments clickable in day/week/month views → Task 2, Steps 1–4
- ✅ Popover shows patient name + time → Task 1, header section
- ✅ View Details → Task 1, `handleViewDetails`
- ✅ Confirm shown only for `pending` → Task 1, `isPending` guard
- ✅ Cancel shown for `pending` or `confirmed` → Task 1, `isPending || isConfirmed` guard
- ✅ Uses `transitionAppointment("confirm")` → Task 1, `handleConfirm`
- ✅ Uses `cancelAppointment` → Task 1, `handleCancel`
- ✅ `router.refresh()` after actions → Task 1, both handlers
- ✅ `stopPropagation` on MonthView pills to preserve day navigation → Task 2, Step 4
- ✅ Loading state disables buttons → Task 1, `disabled={loading}`

**Placeholder scan:** None found — all code is complete and concrete.

**Type consistency:**
- `onAppointmentClick: (appt: AppointmentView, e: React.MouseEvent) => void` used consistently across `DayView`, `WeekView`, `MonthView`, `AppointmentBlock`, and `handleAppointmentClick`.
- `DoctorAppointmentQuickActionsProps` matches usage in `DoctorCalendar`.
