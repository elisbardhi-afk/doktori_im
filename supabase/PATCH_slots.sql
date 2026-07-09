-- Doktori Im — PATCH: fix get_available_slots timezone drift
-- Paste into Supabase SQL Editor and Run. Replaces the function.

-- get_available_slots — the single source of truth for "is this free".
-- Computes slots from rules + exceptions in Tirane wall-clock, converts to
-- UTC per-date (DST-correct), excludes past + overlapping active appointments.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_doctor_id uuid,
  p_from date,
  p_to date,
  p_exclude_appointment_id uuid default null
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
begin
  return query
  with days as (
    select d::date as day
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  -- whole-day blocks
  day_blocks as (
    select exception_date
    from public.availability_exceptions
    where doctor_id = p_doctor_id
      and kind = 'block'
      and start_time is null and end_time is null
  ),
  -- candidate windows: recurring rules for the weekday + extra exceptions
  windows as (
    select
      d.day,
      r.start_time,
      r.end_time,
      r.slot_duration_minutes
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
      e.slot_duration_minutes
    from public.availability_exceptions e
    where e.doctor_id = p_doctor_id
      and e.kind = 'extra'
      and e.exception_date between p_from and p_to
      and e.exception_date not in (select exception_date from day_blocks)
  ),
  -- expand each window into grid slots (local wall-clock minutes). Casting
  -- day to a NAIVE timestamp is critical: `at time zone tz` must interpret the
  -- value as Tirane wall-clock, not convert a timestamptz out of it.
  grid as (
    select
      w.day,
      w.slot_duration_minutes as dur,
      ((w.day::timestamp) + make_interval(mins => gs.startmin)) as local_naive_start,
      ((w.day::timestamp) + make_interval(mins => gs.startmin + w.slot_duration_minutes)) as local_naive_end,
      gs.startmin
    from windows w
    cross join lateral (
      select generate_series(
        extract(hour from w.start_time)::int * 60 + extract(minute from w.start_time)::int,
        (extract(hour from w.end_time)::int * 60 + extract(minute from w.end_time)::int) - w.slot_duration_minutes,
        w.slot_duration_minutes
      ) as startmin
    ) gs
  ),
  -- convert local wall-clock to UTC instant (DST-correct per date)
  resolved as (
    select
      (g.local_naive_start at time zone tz) as slot_start,
      (g.local_naive_end at time zone tz) as slot_end,
      g.day as local_date,
      lpad((g.startmin / 60)::text, 2, '0') || ':' || lpad((g.startmin % 60)::text, 2, '0') as local_time,
      g.dur as duration_minutes
    from grid g
  ),
  -- partial blocks (as UTC ranges) for the same doctor
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
    -- not overlapping a partial block
    and not exists (
      select 1 from partial_blocks pb
      where pb.rng && tstzrange(r.slot_start, r.slot_end, '[)')
    )
    -- not overlapping an active appointment (optionally excluding one, for reschedule)
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = p_doctor_id
        and a.status in ('pending', 'confirmed')
        and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
        and a.slot_range && tstzrange(r.slot_start, r.slot_end, '[)')
    )
  order by r.slot_start;
end $$;

-- ---------------------------------------------------------------------------

grant execute on function public.get_available_slots(uuid, date, date, uuid) to authenticated, anon;
