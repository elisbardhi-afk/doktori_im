-- Doktori Im — Functions & RPCs
-- Identity trigger, role helpers, rating sync, availability generation,
-- and the SECURITY DEFINER booking state machine.

-- ---------------------------------------------------------------------------
-- New auth user → public.users row. Role from metadata, but 'admin' is never
-- self-assignable (coerced to patient). Doctors also get a doctor_profiles row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_full_name text;
  v_requested text;
begin
  v_requested := coalesce(new.raw_user_meta_data->>'role', 'patient');
  if v_requested = 'doctor' then
    v_role := 'doctor';
  else
    v_role := 'patient'; -- admin can never be self-assigned at signup
  end if;

  v_full_name := new.raw_user_meta_data->>'full_name';

  insert into public.users (id, email, role, full_name, phone, preferred_locale)
  values (
    new.id,
    new.email,
    v_role,
    v_full_name,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'locale', 'sq')
  )
  on conflict (id) do nothing;

  if v_role = 'doctor' then
    insert into public.doctor_profiles (user_id, slug, license_number, status, full_name)
    values (
      new.id,
      -- provisional unique slug; doctor edits later
      'dr-' || substr(new.id::text, 1, 8),
      coalesce(new.raw_user_meta_data->>'license_number', 'PENDING-' || substr(new.id::text, 1, 8)),
      'pending',
      v_full_name
    )
    on conflict (user_id) do nothing;
  else
    insert into public.patient_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers (read canonical role from public.users — NOT the JWT — so
-- suspension/role changes take effect immediately, not at next token refresh).
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_approved_doctor(p_doctor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.doctor_profiles
    where user_id = p_doctor and status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- Rating sync: recompute avg_rating / review_count when reviews change.
-- ---------------------------------------------------------------------------
create or replace function public.sync_doctor_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor uuid;
begin
  v_doctor := coalesce(new.doctor_id, old.doctor_id);
  update public.doctor_profiles d
  set
    avg_rating = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where doctor_id = v_doctor), 0),
    review_count = (select count(*) from public.reviews where doctor_id = v_doctor)
  where d.user_id = v_doctor;
  return null;
end $$;

drop trigger if exists trg_sync_rating on public.reviews;
create trigger trg_sync_rating
  after insert or update or delete on public.reviews
  for each row execute function public.sync_doctor_rating();

-- ---------------------------------------------------------------------------
-- enqueue_notification helper
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user uuid,
  p_type notification_type,
  p_title text,
  p_message text,
  p_data jsonb default '{}'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, message, data)
  values (p_user, p_type, p_title, p_message, p_data);
$$;

-- ---------------------------------------------------------------------------
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
-- book_appointment — authoritative in-transaction availability check + insert.
-- Returns the new appointment id. Raises typed errors mapped by the app.
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_reason text default null
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

  -- Authoritative: the requested instant must be an exact member of the grid.
  select * into v_slot
  from public.get_available_slots(p_doctor_id, v_from, v_from)
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
      (patient_id, doctor_id, starts_at, ends_at, status, slot_duration_minutes, reason)
    values
      (v_patient, p_doctor_id, v_slot.slot_start, v_slot.slot_end, v_status,
       v_slot.duration_minutes, p_reason)
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into public.appointment_status_history (appointment_id, from_status, to_status, changed_by, note)
  values (v_id, null, v_status, v_patient, 'booked');

  -- Notify doctor of the new booking.
  perform public.enqueue_notification(
    p_doctor_id, 'new_booking', 'Rezervim i ri', 'Keni një takim të ri.',
    jsonb_build_object('appointment_id', v_id));

  -- Confirm to patient (unless it needs approval).
  if v_status = 'confirmed' then
    perform public.enqueue_notification(
      v_patient, 'appointment_confirmed', 'Takimi u konfirmua',
      'Takimi juaj u rezervua me sukses.',
      jsonb_build_object('appointment_id', v_id));
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- cancel_appointment — patient (own) or doctor (own) may cancel. Frees the
-- slot and notifies the other party.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  a record;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_uid <> a.patient_id and v_uid <> a.doctor_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if a.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update public.appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancellation_reason = p_reason
  where id = p_appointment_id;

  insert into public.appointment_status_history (appointment_id, from_status, to_status, changed_by, note)
  values (p_appointment_id, a.status, 'cancelled', v_uid, p_reason);

  -- Notify the other party.
  if v_uid = a.patient_id then
    perform public.enqueue_notification(
      a.doctor_id, 'appointment_cancelled', 'Takim i anuluar',
      'Një pacient anuloi takimin.', jsonb_build_object('appointment_id', p_appointment_id));
  else
    perform public.enqueue_notification(
      a.patient_id, 'appointment_cancelled', 'Takim i anuluar',
      'Takimi juaj u anulua.', jsonb_build_object('appointment_id', p_appointment_id));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Transition helpers: confirm / complete / no_show (doctor or admin).
-- ---------------------------------------------------------------------------
create or replace function public._assert_doctor_or_admin(a public.appointments)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() <> a.doctor_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.confirm_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform public._assert_doctor_or_admin(a);
  if a.status <> 'pending' then raise exception 'INVALID_TRANSITION' using errcode='P0001'; end if;
  update public.appointments set status='confirmed' where id=p_appointment_id;
  insert into public.appointment_status_history(appointment_id,from_status,to_status,changed_by)
  values (p_appointment_id, a.status, 'confirmed', auth.uid());
  perform public.enqueue_notification(a.patient_id,'appointment_confirmed','Takimi u konfirmua',
    'Mjeku konfirmoi takimin tuaj.', jsonb_build_object('appointment_id',p_appointment_id));
end $$;

create or replace function public.complete_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform public._assert_doctor_or_admin(a);
  if a.status <> 'confirmed' then raise exception 'INVALID_TRANSITION' using errcode='P0001'; end if;
  update public.appointments set status='completed' where id=p_appointment_id;
  insert into public.appointment_status_history(appointment_id,from_status,to_status,changed_by)
  values (p_appointment_id, a.status, 'completed', auth.uid());
  perform public.enqueue_notification(a.patient_id,'review_request','Vlerësoni mjekun',
    'Si ishte takimi juaj? Lini një vlerësim.', jsonb_build_object('appointment_id',p_appointment_id));
end $$;

create or replace function public.mark_no_show(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform public._assert_doctor_or_admin(a);
  if a.status <> 'confirmed' then raise exception 'INVALID_TRANSITION' using errcode='P0001'; end if;
  update public.appointments set status='no_show' where id=p_appointment_id;
  insert into public.appointment_status_history(appointment_id,from_status,to_status,changed_by)
  values (p_appointment_id, a.status, 'no_show', auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- submit_review — patient reviews own completed appointment (one per appt).
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(
  p_appointment_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  a record;
  v_id uuid;
  v_name text;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if a.patient_id <> v_uid then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  if a.status <> 'completed' then raise exception 'NOT_COMPLETED' using errcode='P0001'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'INVALID_RATING' using errcode='P0001'; end if;

  select full_name into v_name from public.users where id = v_uid;

  insert into public.reviews (appointment_id, patient_id, doctor_id, rating, comment, patient_name)
  values (p_appointment_id, v_uid, a.doctor_id, p_rating, p_comment, v_name)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REVIEWED' using errcode='P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated may call the RPCs.
-- ---------------------------------------------------------------------------
grant execute on function public.get_available_slots(uuid, date, date, uuid) to authenticated, anon;
grant execute on function public.book_appointment(uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.confirm_appointment(uuid) to authenticated;
grant execute on function public.complete_appointment(uuid) to authenticated;
grant execute on function public.mark_no_show(uuid) to authenticated;
grant execute on function public.submit_review(uuid, smallint, text) to authenticated;
