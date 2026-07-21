# Waitlist Feature Design

**Date:** 2026-07-21  
**JIRA:** KAN-3  
**Branch:** feature/waitlist  
**Status:** Approved

---

## Overview

Patients can opt into a waitlist for an earlier slot after successfully booking an appointment. When any appointment with that doctor is cancelled (by either party), the oldest waiting patient is notified with a 2-hour claim window. They can accept (moving their appointment earlier) or decline (keeping their existing appointment). The existing confirmed booking is always retained until the patient actively accepts the offer.

---

## Scope

- Opt-in during booking confirmation (post-success step in BookingWizard)
- DB trigger fan-out on any appointment cancellation
- 2-hour accept window with lazy expiry on page load
- Accept/Decline UI at `/patient/waitlist`
- Notification bell integration for `waitlist_available` type

Out of scope for v1: pg_cron fan-forward to next waiter (expired entries stay expired; next cancellation will pick the next active entry), SMS/email notifications, doctor-side waitlist visibility.

---

## State Machine

```
waitlist_entries.status:

active    → notified   slot freed, claim_expires_at = now() + 2h
notified  → claimed    patient accepted (new appt created, old cancelled)
notified  → cancelled  patient declined
notified  → expired    claim_expires_at passed (lazy on page load)
active    → cancelled  patient manually removed entry
```

---

## Section 1: Database

### Existing schema (no changes needed)
- `waitlist_entries(id, patient_id, doctor_id, specialty_id, preferred_range daterange, status waitlist_status, notified_at, claim_expires_at, created_at)`
- `waitlist_status` enum: `active | notified | claimed | expired | cancelled`
- `notification_type` enum already includes `waitlist_available`
- `notifications` table + `enqueue_notification` RPC

### New migration: `0019_waitlist_trigger.sql`

**0. Schema addition in same migration**
- `ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS source_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL`
- Stores which appointment the patient booked when joining — used by `claim_waitlist_slot` to cancel the right one

**1. `join_waitlist(p_doctor_id uuid, p_appointment_id uuid, p_preferred_range daterange)`**
- `SECURITY DEFINER`, callable by `authenticated`
- Inserts `waitlist_entries` row with `status = 'active'`, `source_appointment_id = p_appointment_id`
- `preferred_range` = caller-supplied range (booking wizard sends `[booked_date - 30, booked_date - 1]`)
- Idempotent: `ON CONFLICT (patient_id, doctor_id, preferred_range) DO NOTHING`
- Returns `void`

**2. `cancel_waitlist_entry(p_entry_id uuid)`**
- Verifies `patient_id = auth.uid()`, sets `status = 'cancelled'`
- Returns `void`

**3. `notify_next_waiter(p_doctor_id uuid, p_freed_date date)`**
- Internal helper (`SECURITY DEFINER`, not granted to `authenticated`)
- Finds oldest `active` entry for `p_doctor_id` where `preferred_range @> p_freed_date`
- Updates: `status = 'notified'`, `notified_at = now()`, `claim_expires_at = now() + interval '2 hours'`
- Calls `enqueue_notification(patient_id, 'waitlist_available', ...)` with `data = { waitlist_entry_id, doctor_id, freed_date }`
- No-op if no active entries found

**4. `trg_waitlist_on_cancel`**
- `AFTER UPDATE ON appointments FOR EACH ROW`
- Fires when `NEW.status = 'cancelled' AND OLD.status != 'cancelled'`
- Calls `notify_next_waiter(NEW.doctor_id, NEW.starts_at::date)`

**5. `claim_waitlist_slot(p_entry_id uuid, p_new_starts_at timestamptz)`**
- Verifies entry `patient_id = auth.uid()`, `status = 'notified'`, `claim_expires_at > now()`
- Raises `CLAIM_EXPIRED` if window passed
- Calls `book_appointment` for the new slot (raises on conflict as normal)
- Cancels the patient's `source_appointment_id` appointment (sets `status = 'cancelled'`; no-op if already cancelled)
- Sets entry `status = 'claimed'`
- Returns `{ ok boolean, appointment_id uuid, error_code text }`

---

## Section 2: Booking Wizard Opt-in

**Location:** `src/components/booking-wizard.tsx`

After a successful `createBooking` call, the wizard's success state gains a new inline opt-in step:

```
✓ Appointment confirmed for [date/time]

[ ] Notify me if an earlier slot opens up
    We'll let you know if a slot becomes available
    before your appointment.

        [ Join Waitlist ]
```

- The checkbox/toggle is off by default
- "Join Waitlist" button calls `joinWaitlist` server action → wraps `join_waitlist` RPC
- `preferred_range` = `[booked_date - 30 days, booked_date - 1 day]`
- On success: button replaced with "✓ You're on the waitlist", no further action
- On error: toast with error message
- If patient already has an active entry for this doctor (idempotent RPC), silently succeeds

**New server action:** `src/actions/waitlist.ts`
- `joinWaitlist(doctorId, appointmentId, bookedDate)` — calls `join_waitlist` RPC
- `cancelWaitlistEntry(entryId)` — calls `cancel_waitlist_entry` RPC  
- `claimWaitlistSlot(entryId, newStartsAt)` — calls `claim_waitlist_slot` RPC
- `getWaitlistEntries()` — queries `waitlist_entries` for current user with doctor name join

---

## Section 3: Patient Waitlist Page

**Location:** `src/app/[locale]/(patient)/patient/waitlist/page.tsx`

Replaces stub. Server component fetches entries on load, lazily expires stale `notified` entries before rendering.

### Lazy expiry on load
```sql
UPDATE waitlist_entries
SET status = 'expired'
WHERE patient_id = auth.uid()
  AND status = 'notified'
  AND claim_expires_at < now()
```
Run via Supabase client before the main fetch.

### Two sections

**Pending Offers** (notified, not expired):
- Card per entry: doctor name, offered date, countdown to expiry
- **Accept** button → `claimWaitlistSlot` → toast + navigate to `/patient/appointments`
- **Decline** button → `cancelWaitlistEntry` → card removed

**Watching For Earlier Slots** (active):
- Card per entry: doctor name, preferred date range
- **Remove** button → `cancelWaitlistEntry` → card removed

**Empty state:** "You're not on any waitlists" if both sections empty.

### New type: `WaitlistEntryRow`
Added to `src/lib/database.types.ts`:
```typescript
export interface WaitlistEntryRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  preferred_range: string; // daterange serialized as "[YYYY-MM-DD,YYYY-MM-DD)"
  status: WaitlistStatus;
  notified_at: string | null;
  claim_expires_at: string | null;
  created_at: string;
}
```

---

## Section 4: Notification Bell Integration

**Location:** `src/components/notification-bell.tsx`

- Add `'waitlist_available'` to `KNOWN_TYPES`
- `handleNotificationClick` for `waitlist_available`: navigate to `/patient/waitlist`
- i18n keys added to `messages/en.json` and `messages/sq.json`:
  ```json
  "waitlist_available": {
    "title": "Earlier slot available",
    "message": "An earlier appointment slot opened up. You have 2 hours to accept."
  }
  ```

---

## Edge Cases & Invariants

| Scenario | Behaviour |
|----------|-----------|
| Slot already taken when patient accepts | `claim_waitlist_slot` → `book_appointment` raises `SLOT_TAKEN`; entry stays `notified`; patient sees error toast and can try again or decline |
| Patient cancels their own appointment (the one they'd move away from) | Old appointment is already cancelled; `claim_waitlist_slot` still succeeds (cancelling a `cancelled` appt is a no-op) |
| Patient is on waitlist and also cancels their booked appointment | Cancellation trigger fires → could re-notify the same patient. Guard in `notify_next_waiter(p_doctor_id, p_freed_date, p_cancelled_by_patient_id)`: skip entries where `patient_id = p_cancelled_by_patient_id`. Trigger passes `NEW.patient_id` as the third argument. |
| Multiple active entries for same patient+doctor | Schema has `UNIQUE (patient_id, doctor_id, preferred_range)` — but ranges could differ. `notify_next_waiter` picks by `ORDER BY created_at ASC LIMIT 1`, so only one entry is notified at a time |
| Claim expires, no other waiters | Entry set to `expired`; no further action. Next cancellation will pick the next `active` entry if one exists |

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/0019_waitlist_trigger.sql` | New — all DB functions + trigger |
| `src/lib/database.types.ts` | Add `WaitlistEntryRow`, add `waitlist_available` to `KNOWN_TYPES` |
| `src/actions/waitlist.ts` | New — `joinWaitlist`, `cancelWaitlistEntry`, `claimWaitlistSlot`, `getWaitlistEntries` |
| `src/components/booking-wizard.tsx` | Add post-success opt-in step |
| `src/app/[locale]/(patient)/patient/waitlist/page.tsx` | Replace stub with full page |
| `src/components/notification-bell.tsx` | Add `waitlist_available` type handling |
| `messages/en.json` | Add waitlist i18n keys |
| `messages/sq.json` | Add waitlist i18n keys (Albanian) |
