-- Restore duration-aware slot validation for book_appointment.
-- Migration 0008 removed duration validation by dropping the 5-param get_available_slots overload.
-- This caused book_appointment to only validate the starting 15-minute slot is free,
-- not the full service duration window.
--
-- This migration extends get_available_slots with an optional 5th parameter p_duration_minutes
-- (default 15), and updates book_appointment to pass the service duration for validation.

-- 1. Drop and recreate get_available_slots with optional p_duration_minutes parameter.
--    (Preserves 4-param backward compatibility for UI calls without duration.)
drop function if exists public.get_available_slots(uuid, date, date, uuid);

create or replace function public.get_available_slots(
  p_doctor_id uuid,
  p_from date,
  p_to date,
  p_exclude_appointment_id uuid default null,
  p_duration_minutes integer default 15
)
returns table (
  slot_start timestamptz,
  slot_end timestamptz,
  local_date date,
  local_time text,
  duration_minutes integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz constant text := 'Europe/Tirane';
  v_dur integer := coalesce(p_duration_minutes, 15);
begin
  if v_dur < 15 or v_dur % 15 <> 0 then
    raise exception 'INVALID_DURATION' using errcode = 'P0001';
  end if;

  return query
  with days as (
    select d::date as day
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  day_blocks as (
    select exception_date
    from public.availability_exceptions
    where doctor_id = p_doctor_id
      and kind = 'block'
      and start_time is null and end_time is null
  ),
  windows as (
    select
      d.day,
      r.start_time,
      r.end_time,
      15 as slot_duration_minutes
    from days d
    join public.availability_rules r
      on r.doctor_id = p_doctor_id
     and r.is_active
     and r.weekday = extract(isodow from d.day)::int
     and d.day >= r.valid_from
     and (r.valid_until is null or d.day <= r.valid_until)
    where d.day not in (select exception_date from day_blocks)

    union all

    select
      e.exception_date as day,
      e.start_time,
      e.end_time,
      15 as slot_duration_minutes
    from public.availability_exceptions e
    where e.doctor_id = p_doctor_id
      and e.kind = 'extra'
      and e.exception_date between p_from and p_to
      and e.exception_date not in (select exception_date from day_blocks)
  ),
  grid as (
    select
      w.day,
      v_dur as dur,
      ((w.day::timestamp) + make_interval(mins => gs.startmin)) as local_naive_start,
      ((w.day::timestamp) + make_interval(mins => gs.startmin + v_dur)) as local_naive_end,
      gs.startmin
    from windows w
    cross join lateral (
      select generate_series(
        extract(hour from w.start_time)::int * 60 + extract(minute from w.start_time)::int,
        (extract(hour from w.end_time)::int * 60 + extract(minute from w.end_time)::int) - v_dur,
        15
      ) as startmin
    ) gs
  ),
  resolved as (
    select
      (g.local_naive_start at time zone tz) as slot_start,
      (g.local_naive_end at time zone tz) as slot_end,
      g.day as local_date,
      lpad((g.startmin / 60)::text, 2, '0') || ':' || lpad((g.startmin % 60)::text, 2, '0') as local_time,
      g.dur as duration_minutes
    from grid g
  ),
  partial_blocks as (
    select
      tstzrange(
        ((e.exception_date + e.start_time) at time zone tz),
        ((e.exception_date + e.end_time) at time zone tz),
        '[)'
      ) as rng
    from public.availability_exceptions e
    where e.doctor_id = p_doctor_id
      and e.kind = 'block'
      and e.start_time is not null and e.end_time is not null
      and e.exception_date between p_from and p_to
  )
  select r.slot_start, r.slot_end, r.local_date, r.local_time, r.duration_minutes
  from resolved r
  where r.slot_start > now()
    and not exists (
      select 1 from partial_blocks pb
      where pb.rng && tstzrange(r.slot_start, r.slot_end, '[)')
    )
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = p_doctor_id
        and a.status in ('pending', 'confirmed')
        and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
        and a.slot_range && tstzrange(r.slot_start, r.slot_end, '[)')
    )
  order by r.slot_start;
end $$;

grant execute on function public.get_available_slots(uuid, date, date, uuid, integer) to authenticated, anon;

-- 2. Update book_appointment to pass v_duration to get_available_slots.
create or replace function public.book_appointment(
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_reason text default null,
  p_service_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid := auth.uid();
  v_slot record;
  v_requires_approval boolean;
  v_status appointment_status;
  v_id uuid;
  v_from date := (p_starts_at at time zone 'Europe/Tirane')::date;
  v_duration integer := 15;
begin
  if v_patient is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not public.is_approved_doctor(p_doctor_id) then
    raise exception 'DOCTOR_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  if p_starts_at <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0001';
  end if;

  if p_service_id is not null then
    select duration_minutes into v_duration
    from public.doctor_services
    where id = p_service_id
      and doctor_id = p_doctor_id
      and is_active = true;

    if not found then
      raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  select * into v_slot
  from public.get_available_slots(p_doctor_id, v_from, v_from, null, v_duration)
  where slot_start = p_starts_at
  limit 1;

  if not found then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select requires_approval into v_requires_approval
  from public.doctor_profiles where user_id = p_doctor_id;

  v_status := case when v_requires_approval then 'pending' else 'confirmed' end;

  begin
    insert into public.appointments
      (patient_id, doctor_id, starts_at, ends_at, status, slot_duration_minutes, reason, service_id)
    values
      (v_patient, p_doctor_id, v_slot.slot_start, v_slot.slot_end, v_status,
       v_duration, p_reason, p_service_id)
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into public.appointment_status_history (appointment_id, from_status, to_status, changed_by, note)
  values (v_id, null, v_status, v_patient, 'booked');

  perform public.enqueue_notification(
    p_doctor_id, 'new_booking', 'Rezervim i ri', 'Keni një takim të ri.',
    jsonb_build_object('appointment_id', v_id));

  if v_status = 'confirmed' then
    perform public.enqueue_notification(
      v_patient, 'appointment_confirmed', 'Takimi u konfirmua',
      'Takimi juaj u rezervua me sukses.',
      jsonb_build_object('appointment_id', v_id));
  end if;

  return v_id;
end $$;

grant execute on function public.book_appointment(uuid, timestamptz, text, uuid) to authenticated;
