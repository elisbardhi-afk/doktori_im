-- supabase/migrations/0019_waitlist_trigger.sql
-- Waitlist feature: schema addition, RPCs, and cancellation trigger.

-- ---------------------------------------------------------------------------
-- Add source_appointment_id to waitlist_entries
-- ---------------------------------------------------------------------------
alter table public.waitlist_entries
  add column if not exists source_appointment_id uuid
    references public.appointments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- join_waitlist — patient opts in after booking
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
  -- Only the authenticated patient may join
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.waitlist_entries
    (patient_id, doctor_id, preferred_range, status, source_appointment_id)
  values
    (auth.uid(), p_doctor_id, p_preferred_range, 'active', p_appointment_id)
  on conflict (patient_id, doctor_id, preferred_range) do nothing;
end $$;

grant execute on function public.join_waitlist(uuid, uuid, daterange) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_waitlist_entry — patient removes themselves from the waitlist
-- ---------------------------------------------------------------------------
create or replace function public.cancel_waitlist_entry(
  p_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.waitlist_entries
  set status = 'cancelled'
  where id = p_entry_id
    and patient_id = auth.uid()
    and status in ('active', 'notified');

  if not found then
    raise exception 'NOT_FOUND_OR_FORBIDDEN' using errcode = 'P0001';
  end if;
end $$;

grant execute on function public.cancel_waitlist_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- notify_next_waiter — internal helper called by trigger
-- ---------------------------------------------------------------------------
create or replace function public.notify_next_waiter(
  p_doctor_id               uuid,
  p_freed_date              date,
  p_cancelled_by_patient_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_doctor_name text;
begin
  -- Pick the oldest active entry for this doctor/date, skipping the cancelling patient
  select * into v_entry
  from public.waitlist_entries
  where doctor_id = p_doctor_id
    and status = 'active'
    and preferred_range @> p_freed_date
    and patient_id <> p_cancelled_by_patient_id
  order by created_at asc
  limit 1;

  if not found then
    return; -- no waiters, nothing to do
  end if;

  -- Mark as notified with 2-hour claim window
  update public.waitlist_entries
  set
    status           = 'notified',
    notified_at      = now(),
    claim_expires_at = now() + interval '2 hours'
  where id = v_entry.id;

  -- Get doctor's display name for the notification
  select coalesce(full_name, 'Your doctor')
  into v_doctor_name
  from public.doctor_profiles
  where user_id = p_doctor_id;

  -- Enqueue in-app notification
  perform public.enqueue_notification(
    v_entry.patient_id,
    'waitlist_available',
    'Earlier slot available',
    'An earlier appointment slot opened up with ' || v_doctor_name || '. You have 2 hours to accept.',
    jsonb_build_object(
      'waitlist_entry_id', v_entry.id,
      'doctor_id',         p_doctor_id,
      'freed_date',        p_freed_date::text
    )
  );
end $$;

-- Internal only — do NOT grant to authenticated

-- ---------------------------------------------------------------------------
-- Trigger: fire notify_next_waiter on every cancellation
-- ---------------------------------------------------------------------------
create or replace function public.trg_fn_waitlist_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.notify_next_waiter(
      new.doctor_id,
      new.starts_at::date,
      new.patient_id
    );
  end if;
  return null;
end $$;

drop trigger if exists trg_waitlist_on_cancel on public.appointments;
create trigger trg_waitlist_on_cancel
  after update on public.appointments
  for each row execute function public.trg_fn_waitlist_on_cancel();

-- ---------------------------------------------------------------------------
-- claim_waitlist_slot — patient accepts the offer
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
  v_entry  record;
  v_new_appt_id uuid;
begin
  -- Load and verify the entry
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
    -- Lazily expire the entry
    update public.waitlist_entries set status = 'expired' where id = p_entry_id;
    return query select false, null::uuid, 'CLAIM_EXPIRED'::text;
    return;
  end if;

  -- Book the new slot (raises on SLOT_TAKEN, SLOT_NOT_AVAILABLE, etc.)
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

  -- Cancel the original appointment if it still exists and is active
  update public.appointments
  set
    status           = 'cancelled',
    cancelled_at     = now(),
    cancelled_by     = auth.uid(),
    cancellation_reason = 'Replaced by earlier waitlist slot'
  where id = v_entry.source_appointment_id
    and status in ('pending', 'confirmed');

  -- Mark entry as claimed
  update public.waitlist_entries
  set status = 'claimed'
  where id = p_entry_id;

  return query select true, v_new_appt_id, null::text;
end $$;

grant execute on function public.claim_waitlist_slot(uuid, timestamptz) to authenticated;
