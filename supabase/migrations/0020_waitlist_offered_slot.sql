-- supabase/migrations/0020_waitlist_offered_slot.sql
-- Store the offered slot time on waitlist entries so the patient can see
-- which specific slot they're being offered before accepting.

alter table public.waitlist_entries
  add column if not exists offered_starts_at timestamptz,
  add column if not exists offered_ends_at   timestamptz;

-- Redefine notify_next_waiter to populate offered_starts_at/offered_ends_at
-- from the freed appointment that triggered the notification.
create or replace function public.notify_next_waiter(
  p_doctor_id               uuid,
  p_freed_date              date,
  p_cancelled_by_patient_id uuid,
  p_freed_starts_at         timestamptz default null,
  p_freed_ends_at           timestamptz default null
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
  select * into v_entry
  from public.waitlist_entries
  where doctor_id = p_doctor_id
    and status = 'active'
    and preferred_range @> p_freed_date
    and patient_id <> p_cancelled_by_patient_id
  order by created_at asc
  limit 1;

  if not found then
    return;
  end if;

  update public.waitlist_entries
  set
    status            = 'notified',
    notified_at       = now(),
    claim_expires_at  = now() + interval '2 hours',
    offered_starts_at = p_freed_starts_at,
    offered_ends_at   = p_freed_ends_at
  where id = v_entry.id;

  select coalesce(full_name, 'Your doctor')
  into v_doctor_name
  from public.doctor_profiles
  where user_id = p_doctor_id;

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

-- Update the trigger to pass the freed appointment's times
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
      new.patient_id,
      new.starts_at,
      new.ends_at
    );
  end if;
  return null;
end $$;
