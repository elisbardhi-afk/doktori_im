-- supabase/migrations/0022_waitlist_logic_fixes.sql
-- Fix KAN-22: Audit and correct waitlist logic.
--
-- Two bugs are fixed:
--
-- BUG 1 — claim_waitlist_slot: wrong order of operations (intermediate 'cancelled' state)
-- -----------------------------------------------------------------------------------------
-- The original order was:
--   1. book_appointment(...)
--   2. cancel source appointment   ← trigger fires cancel_waitlist_for_appointment(source_id)
--                                     which sets THIS entry to 'cancelled' (it's still 'notified')
--   3. mark entry as 'claimed'     ← overrides back to 'claimed' (works but fragile)
--
-- The entry briefly passes through an unintended 'cancelled' state. Any concurrent
-- reader (e.g. getWaitlistEntries) could observe this transient state. More importantly,
-- if the final UPDATE to 'claimed' were to fail (e.g. another concurrent claim), the
-- entry would be left in 'cancelled' even though the new appointment was already booked,
-- creating an orphaned booking with no corresponding waitlist record.
--
-- Fix: mark the entry 'claimed' BEFORE cancelling the source appointment.
-- When the trigger then calls cancel_waitlist_for_appointment, the entry status is
-- already 'claimed' — which is not in the ('active','notified') filter — so the trigger
-- leaves it untouched.
--
-- BUG 2 — join_waitlist: silent no-op on re-join after terminal status
-- -----------------------------------------------------------------------------------------
-- The unique constraint on (patient_id, doctor_id, preferred_range) is unconditional.
-- If a patient already has a cancelled/expired/claimed entry for the exact same
-- (doctor, range), the ON CONFLICT DO NOTHING silently succeeds without inserting or
-- updating. The patient believes they joined the waitlist but they have not.
--
-- This happens whenever a patient:
--   - books the same slot again after their previous waitlist entry was cancelled/expired
--   - is offered and declines a slot, then books the same date again
--
-- Fix: upsert — on conflict, reactivate the entry if it is in a terminal state.
-- If the existing entry is still 'active' or 'notified', the WHERE clause prevents
-- the update, preserving the current behaviour (no duplicate active entries).

-- ---------------------------------------------------------------------------
-- Fix 1: claim_waitlist_slot — mark entry 'claimed' before cancelling source
-- ---------------------------------------------------------------------------
create or replace function public.claim_waitlist_slot(
  p_entry_id      uuid,
  p_new_starts_at timestamptz
)
returns table(ok boolean, appointment_id uuid, error_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry       record;
  v_new_appt_id uuid;
begin
  -- Load and verify the entry belongs to the calling patient.
  select * into v_entry
  from public.waitlist_entries
  where id = p_entry_id
    and patient_id = auth.uid();

  if not found then
    return query select false, null::uuid, 'NOT_FOUND'::text;
    return;
  end if;

  if v_entry.status <> 'notified' then
    return query select false, null::uuid, 'INVALID_STATUS'::text;
    return;
  end if;

  if v_entry.claim_expires_at < now() then
    -- Lazily expire the entry.
    update public.waitlist_entries set status = 'expired' where id = p_entry_id;
    return query select false, null::uuid, 'CLAIM_EXPIRED'::text;
    return;
  end if;

  -- Book the offered slot (raises on SLOT_TAKEN, SLOT_NOT_AVAILABLE, etc.).
  begin
    select public.book_appointment(
      v_entry.doctor_id,
      p_new_starts_at,
      null,   -- reason
      null    -- service_id
    ) into v_new_appt_id;
  exception when others then
    return query select false, null::uuid, sqlerrm::text;
    return;
  end;

  -- IMPORTANT: mark the entry 'claimed' BEFORE cancelling the source appointment.
  --
  -- Cancelling the source appointment fires trg_fn_waitlist_on_cancel, which
  -- internally calls cancel_waitlist_for_appointment(source_id). That helper
  -- sets status = 'cancelled' for any 'active'/'notified' entry linked to the
  -- cancelled appointment. If we cancelled the source first, this entry (still
  -- 'notified') would be set to 'cancelled' by the trigger, and only then
  -- overridden back to 'claimed' — a fragile race window.
  --
  -- By marking 'claimed' first the trigger finds status = 'claimed' and skips it.
  update public.waitlist_entries
  set status = 'claimed'
  where id = p_entry_id;

  -- Now cancel the original appointment. The trigger will correctly:
  --   a) offer the freed slot to the next waiter (notify_next_waiter)
  --   b) call cancel_waitlist_for_appointment — which skips 'claimed' entries
  update public.appointments
  set
    status               = 'cancelled',
    cancelled_at         = now(),
    cancelled_by         = auth.uid(),
    cancellation_reason  = 'Replaced by earlier waitlist slot'
  where id = v_entry.source_appointment_id
    and status in ('pending', 'confirmed');

  return query select true, v_new_appt_id, null::text;
end $$;

grant execute on function public.claim_waitlist_slot(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Fix 2: join_waitlist — upsert to allow re-joining after terminal status
-- ---------------------------------------------------------------------------
create or replace function public.join_waitlist(
  p_doctor_id        uuid,
  p_appointment_id   uuid,
  p_preferred_range  daterange
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.waitlist_entries
    (patient_id, doctor_id, preferred_range, status, source_appointment_id)
  values
    (auth.uid(), p_doctor_id, p_preferred_range, 'active', p_appointment_id)
  on conflict (patient_id, doctor_id, preferred_range) do update
    -- Reactivate the entry only when it reached a terminal state.
    -- If the existing entry is still 'active' or 'notified', the WHERE clause
    -- prevents the update, so no duplicate active entries are created.
    set
      status                = 'active',
      source_appointment_id = excluded.source_appointment_id,
      notified_at           = null,
      claim_expires_at      = null,
      offered_starts_at     = null,
      offered_ends_at       = null
    where waitlist_entries.status in ('cancelled', 'expired', 'claimed');
end $$;

grant execute on function public.join_waitlist(uuid, uuid, daterange) to authenticated;
