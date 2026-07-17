# Doctor Calendar Appointment Popup — Design Spec

**Date:** 2026-07-18  
**Status:** Approved

---

## Problem

On the doctor's calendar (`DoctorCalendar`), appointment blocks are plain `<div>` elements with no `onClick`. Doctors cannot tap an appointment to see its details or take action — they must navigate away manually. On mobile this is a blocking UX gap.

The patient calendar already has a fully working clickable appointment + popover pattern. This feature mirrors that pattern for doctors.

---

## Goals

- Make appointment blocks clickable in all three calendar views (day, week, month)
- On click/tap, open a positioned popover showing appointment details
- Popover actions: **View Details**, **Confirm** (pending only), **Cancel** (pending or confirmed only)
- Reuse existing server actions (`transitionAppointment`, `cancelAppointment`)

---

## New Component: `DoctorAppointmentQuickActions`

**File:** `src/components/doctor-appointment-quick-actions.tsx`

Modeled directly on `appointment-quick-actions.tsx`. Props:

```ts
{
  appointment: AppointmentView
  isOpen: boolean
  position: { top: number; left: number }
  onClose: () => void
}
```

**Rendering:**
- Fixed backdrop (`fixed inset-0 z-40`) closes popover on click-outside
- Absolute positioned card (`absolute z-50 w-56 rounded-2xl border bg-card shadow-lift`)
- Header: patient name + formatted appointment time
- Actions list:

| Button | Condition | Action |
|--------|-----------|--------|
| View Details | always | `router.push(/doctor/appointments/${id})` then `onClose()` |
| Confirm | `status === "pending"` | `transitionAppointment(id, "confirm")` → `router.refresh()` → `onClose()` |
| Cancel | `status === "pending"` \| `"confirmed"` | `cancelAppointment({ appointmentId })` → `router.refresh()` → `onClose()` |

Both Confirm and Cancel show a `loading` state (disabled buttons) while the server action runs. On error, show a `toast.error`. On success, `toast.success`, refresh, and close.

---

## Changes to `DoctorCalendar`

**File:** `src/components/doctor-calendar.tsx`

### `AppointmentBlock`

- Change from `<div>` to `<button>`
- Add optional `onClick?: (appt: AppointmentView, e: React.MouseEvent) => void` prop
- Wire `onClick={(e) => onClick?.(appt, e)}`

### `DayView` and `WeekView`

- Accept `onAppointmentClick: (appt: AppointmentView, e: React.MouseEvent) => void` prop
- Pass it through to each `<AppointmentBlock>`

### `MonthView`

- Accept `onAppointmentClick` prop
- Change appointment pills from `<div>` to `<button>`
- Add `onClick={(e) => { e.stopPropagation(); onAppointmentClick(a, e); }}` on each pill
- Day-cell `onClick` (navigates to day view) is preserved — `stopPropagation` on the pill prevents it from firing when an appointment is tapped

### `DoctorCalendar` (root component)

Add state:
```ts
const [selectedAppt, setSelectedAppt] = useState<AppointmentView | null>(null);
const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
```

Add handler:
```ts
function handleAppointmentClick(appt: AppointmentView, e: React.MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setPopoverPos({ top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX });
  setSelectedAppt(appt);
}
```

Render at the end of the component:
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

---

## What Is Not Changed

- Patient calendar — no changes
- `AppointmentActions` component — no changes (used on the detail page)
- Doctor appointment detail page — no changes
- Server actions — no changes (reused as-is)

---

## Files Touched

| File | Change |
|------|--------|
| `src/components/doctor-appointment-quick-actions.tsx` | New file |
| `src/components/doctor-calendar.tsx` | `AppointmentBlock` → button, add click state + handler, render popover |
