-- supabase/migrations/0021_waitlist_cancel_on_appointment_end.sql
-- Fix KAN-23: "Appointment after deletion / cancel still on waitlist".
--
-- A waitlist entry is created after a patient books an appointment and opts in
-- to be notified of an earlier slot with the same doctor (join_waitlist stores
-- the booked appointment in source_appointment_id, status = 'active'). Its whole
-- purpose is "I already hold appointment X but I'd take an earlier slot."
--
-- When appointment X is cancelled or deleted, that entry becomes stale: nothing
-- resolved it, so the patient stayed on the waitlist (getWaitlistEntries shows
-- 'active'/'notified') and could even be offered an "earlier slot" for an
-- appointment that no longer exists.
--
-- Fix: whenever the source appointment ends (cancel or hard delete), resolve its
-- own still-open waitlist entry to 'cancelled'. The happy path of
-- claim_waitlist_slot is unaffected — it re-sets the entry to 'claimed' after the
-- old appointment is cancelled, and this helper only touches 'active'/'notified'.

-- ---------------------------------------------------------------------------
-- Helper: cancel still-open waitlist entries tied to a given appointment.
-- Only 'active'/'notified' are touched, so 'claimed'/'expired'/'cancelled'
-- entries are left as-is.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_waitlist_for_appointment(
  p_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_appointment_id is null then
    return;
  end if;

  update public.waitlist_entries
  set status = 'cancelled'
  where source_appointment_id = p_appointment_id
    and status in ('active', 'notified');
end $$;

-- ---------------------------------------------------------------------------
-- Extend the cancellation trigger: in addition to offering the freed slot to
-- the next waiter, resolve THIS patient's own waitlist entry for the cancelled
-- appointment (they no longer hold an appointment to "upgrade").
-- ---------------------------------------------------------------------------
create or replace function public.trg_fn_waitlist_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    -- Offer the freed slot to the next patient waiting for this doctor/date.
    perform public.notify_next_waiter(
      new.doctor_id,
      new.starts_at::date,
      new.patient_id,
      new.starts_at,
      new.ends_at
    );

    -- Resolve the cancelling patient's own stale waitlist entry.
    perform public.cancel_waitlist_for_appointment(new.id);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Handle hard deletes too. source_appointment_id is `on delete set null`, so we
-- must clean up BEFORE the delete while the reference still resolves; an AFTER
-- trigger would see the link already nulled.
-- ---------------------------------------------------------------------------
create or replace function public.trg_fn_waitlist_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cancel_waitlist_for_appointment(old.id);
  return old; -- must return old so the delete proceeds
end $$;

drop trigger if exists trg_waitlist_on_delete on public.appointments;
create trigger trg_waitlist_on_delete
  before delete on public.appointments
  for each row execute function public.trg_fn_waitlist_on_delete();

-- ---------------------------------------------------------------------------
-- One-off backfill: resolve entries already stranded by past cancellations
-- (source appointment cancelled but entry still active/notified).
-- ---------------------------------------------------------------------------
update public.waitlist_entries w
set status = 'cancelled'
from public.appointments a
where w.source_appointment_id = a.id
  and a.status = 'cancelled'
  and w.status in ('active', 'notified');
