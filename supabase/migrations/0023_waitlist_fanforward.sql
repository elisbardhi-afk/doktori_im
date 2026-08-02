-- supabase/migrations/0023_waitlist_fanforward.sql
-- Fix KAN-22: Fan-forward to next waiter when a notified entry is declined or expires.
--
-- BUG 1 — cancel_waitlist_entry: declining an offer doesn't notify the next waiter
-- -----------------------------------------------------------------------------------------
-- When a patient declines a waitlist offer (status: notified → cancelled), the freed
-- slot is no longer actively offered to anyone. The next waiter must wait until an
-- entirely different appointment is cancelled before they're notified.
--
-- Fix: when cancel_waitlist_entry transitions a 'notified' entry to 'cancelled', and the
-- entry has an offered slot (offered_starts_at set since migration 0020), immediately call
-- notify_next_waiter for that slot so the next patient in line gets their chance.
--
-- BUG 2 — lazy expiry: claim window expiry never re-notifies the next waiter
-- -----------------------------------------------------------------------------------------
-- getWaitlistEntries() lazily expires stale 'notified' entries via a plain Supabase JS
-- client UPDATE (status = 'expired'). This UPDATE does not call notify_next_waiter, so
-- the freed slot is silently discarded — the next waiter never learns the slot is
-- available until another unrelated appointment cancellation happens.
--
-- Fix: add an AFTER UPDATE trigger on waitlist_entries that fires when status transitions
-- 'notified' → 'expired' and the entry has offered slot coordinates. The trigger calls
-- notify_next_waiter, offering the slot to the next active waiter.
--
-- No changes to TypeScript are required — the existing lazy-expiry UPDATE in
-- getWaitlistEntries() fires the trigger automatically via the Supabase client.

-- ---------------------------------------------------------------------------
-- Fix 1: cancel_waitlist_entry — re-notify next waiter when declining an offer
-- ---------------------------------------------------------------------------
create or replace function public.cancel_waitlist_entry(
  p_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_rows  int;
begin
  -- Atomic check-and-transition: ownership and status guards are inside the WHERE
  -- clause of the UPDATE itself (mirrors migration 0019's pattern). This prevents a
  -- concurrent claim_waitlist_slot from setting status = 'claimed' between a
  -- separate SELECT and UPDATE, which would silently overwrite 'claimed' →
  -- 'cancelled' under READ COMMITTED isolation.
  update public.waitlist_entries
  set status = 'cancelled'
  where id        = p_entry_id
    and patient_id = auth.uid()
    and status    in ('active', 'notified')
  returning * into v_entry;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode = 'P0001';
  end if;

  -- offered_starts_at is only set by notify_next_waiter when promoting an entry to
  -- 'notified'. It is NULL for plain 'active' entries. Using it as the proxy for
  -- "the patient was declining a concrete offer" is correct and avoids needing the
  -- pre-update status value (RETURNING reflects the post-update row).
  if v_entry.offered_starts_at is not null then
    perform public.notify_next_waiter(
      v_entry.doctor_id,
      v_entry.offered_starts_at::date,  -- UTC date of the offered slot
      v_entry.patient_id,               -- skip the declining patient
      v_entry.offered_starts_at,
      v_entry.offered_ends_at
    );
  end if;
end $$;

grant execute on function public.cancel_waitlist_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fix 2: trigger on waitlist_entries — re-notify when claim window expires
-- ---------------------------------------------------------------------------
-- Fires after any UPDATE on waitlist_entries. Only acts when:
--   - status transitions from 'notified' to 'expired'   (the expiry condition)
--   - offered_starts_at is not null                      (set since migration 0020)
-- This is safe against infinite recursion: notify_next_waiter sets the next entry's
-- status to 'notified' (from 'active'), not 'expired', so the trigger won't re-fire.
create or replace function public.trg_fn_waitlist_on_expire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'expired'
     and old.status = 'notified'
     and old.offered_starts_at is not null
  then
    perform public.notify_next_waiter(
      new.doctor_id,
      old.offered_starts_at::date,  -- UTC date of the slot that was offered
      new.patient_id,               -- skip the patient whose window expired
      old.offered_starts_at,
      old.offered_ends_at
    );
  end if;
  return null;
end $$;

drop trigger if exists trg_waitlist_on_expire on public.waitlist_entries;
create trigger trg_waitlist_on_expire
  after update on public.waitlist_entries
  for each row execute function public.trg_fn_waitlist_on_expire();
