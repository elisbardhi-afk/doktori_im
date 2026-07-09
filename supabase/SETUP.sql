-- ============================================================
-- Doktori Im — FULL DATABASE SETUP
-- Paste this entire file into the Supabase SQL Editor and Run.
-- Idempotent: safe to run more than once.
-- ============================================================

-- Doktori Im — Core schema
-- Extensions, enums, tables, constraints. RLS + functions live in later files.
-- Safe to run top-to-bottom in the Supabase SQL Editor.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('patient', 'doctor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doctor_status as enum ('pending', 'approved', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum
    ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_type as enum ('male', 'female', 'other', 'prefer_not_to_say');
exception when duplicate_object then null; end $$;

do $$ begin
  create type waitlist_status as enum
    ('active', 'notified', 'claimed', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'appointment_confirmed', 'appointment_reminder', 'appointment_cancelled',
    'appointment_rescheduled', 'waitlist_available', 'review_request',
    'doctor_approved', 'doctor_rejected', 'doctor_suspended',
    'new_booking'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type exception_kind as enum ('block', 'extra');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared helper: touch updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- users (mirrors auth.users; canonical role lives here)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null,
  role user_role not null default 'patient',
  full_name text,
  phone text,
  preferred_locale text not null default 'sq',
  notify_email boolean not null default true,
  notify_sms boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_users_touch on public.users;
create trigger trg_users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- specialties (lookup, bilingual)
-- ---------------------------------------------------------------------------
create table if not exists public.specialties (
  id smallint generated always as identity primary key,
  slug text unique not null,
  name_en text not null,
  name_sq text not null,
  icon_slug text not null default 'stethoscope',
  sort_order smallint not null default 100
);

-- ---------------------------------------------------------------------------
-- doctor_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  slug text unique not null,
  bio text,
  license_number text unique not null,
  clinic_name text,
  clinic_address text,
  city text,
  photo_url text,
  status doctor_status not null default 'pending',
  requires_approval boolean not null default false,
  consultation_fee numeric(10, 2) check (consultation_fee >= 0),
  languages text[] not null default '{sq}',
  avg_rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_doctor_status on public.doctor_profiles(status);
create index if not exists idx_doctor_city on public.doctor_profiles(city);
create index if not exists idx_doctor_rating on public.doctor_profiles(avg_rating desc);
drop trigger if exists trg_doctor_touch on public.doctor_profiles;
create trigger trg_doctor_touch before update on public.doctor_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- patient_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.patient_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  date_of_birth date,
  gender gender_type,
  national_id text,
  insurance_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_patient_touch on public.patient_profiles;
create trigger trg_patient_touch before update on public.patient_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- doctor_credentials (files reviewed by admin)
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_credentials (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  original_filename text,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_credentials_doctor on public.doctor_credentials(doctor_id);

-- ---------------------------------------------------------------------------
-- doctor_specialties (junction)
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_specialties (
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  specialty_id smallint not null references public.specialties(id) on delete cascade,
  primary key (doctor_id, specialty_id)
);

-- ---------------------------------------------------------------------------
-- availability_rules (recurring weekly, Tirane wall-clock)
-- ---------------------------------------------------------------------------
create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISODOW Mon=1
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null check (slot_duration_minutes between 5 and 240),
  valid_from date not null default current_date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists idx_rules_doctor on public.availability_rules(doctor_id, weekday)
  where is_active;

-- ---------------------------------------------------------------------------
-- availability_exceptions (one-off block/extra)
-- ---------------------------------------------------------------------------
create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  exception_date date not null,
  kind exception_kind not null,
  start_time time,
  end_time time,
  slot_duration_minutes integer check (slot_duration_minutes between 5 and 240),
  reason text,
  created_at timestamptz not null default now(),
  -- extra windows require a full definition; blocks may be whole-day (nulls)
  check (
    kind = 'block'
    or (start_time is not null and end_time is not null and slot_duration_minutes is not null)
  ),
  check (start_time is null or end_time is null or end_time > start_time)
);
create index if not exists idx_exceptions_doctor on public.availability_exceptions(doctor_id, exception_date);

-- ---------------------------------------------------------------------------
-- appointments — the reservation row. Double-booking is made physically
-- impossible by GiST exclusion constraints on the generated slot_range.
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'confirmed',
  slot_duration_minutes integer not null,
  reason text,
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id),
  cancellation_reason text,
  rescheduled_from uuid references public.appointments(id),
  claim_expires_at timestamptz, -- for waitlist holds
  slot_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.appointments drop constraint if exists no_overlap_per_doctor;
alter table public.appointments add constraint no_overlap_per_doctor
  exclude using gist (doctor_id with =, slot_range with &&)
  where (status in ('pending', 'confirmed'));

alter table public.appointments drop constraint if exists no_overlap_per_patient;
alter table public.appointments add constraint no_overlap_per_patient
  exclude using gist (patient_id with =, slot_range with &&)
  where (status in ('pending', 'confirmed'));

create index if not exists idx_appt_patient on public.appointments(patient_id, starts_at desc);
create index if not exists idx_appt_doctor on public.appointments(doctor_id, starts_at desc);
create index if not exists idx_appt_reminder on public.appointments(starts_at)
  where status = 'confirmed' and reminder_sent_at is null;
drop trigger if exists trg_appt_touch on public.appointments;
create trigger trg_appt_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- appointment_notes (doctor-private; kept off patient reads)
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_notes (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  body text,
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_notes_touch on public.appointment_notes;
create trigger trg_notes_touch before update on public.appointment_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- appointment_status_history
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_status appointment_status,
  to_status appointment_status not null,
  changed_by uuid references public.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_history_appt on public.appointment_status_history(appointment_id);

-- ---------------------------------------------------------------------------
-- waitlist_entries
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  specialty_id smallint references public.specialties(id),
  preferred_range daterange not null,
  status waitlist_status not null default 'active',
  notified_at timestamptz,
  claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (patient_id, doctor_id, preferred_range)
);
create index if not exists idx_waitlist_doctor on public.waitlist_entries(doctor_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- reviews (one per completed appointment; never deletable by patient/doctor)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid unique not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.users(id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reviews_doctor on public.reviews(doctor_id, created_at desc);
drop trigger if exists trg_reviews_touch on public.reviews;
create trigger trg_reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- notifications (in-app; realtime)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type notification_type not null,
  title text not null,
  message text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, created_at desc)
  where read_at is null;


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
    insert into public.doctor_profiles (user_id, slug, license_number, status)
    values (
      new.id,
      -- provisional unique slug; doctor edits later
      'dr-' || substr(new.id::text, 1, 8),
      coalesce(new.raw_user_meta_data->>'license_number', 'PENDING-' || substr(new.id::text, 1, 8)),
      'pending'
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
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if a.patient_id <> v_uid then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  if a.status <> 'completed' then raise exception 'NOT_COMPLETED' using errcode='P0001'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'INVALID_RATING' using errcode='P0001'; end if;

  insert into public.reviews (appointment_id, patient_id, doctor_id, rating, comment)
  values (p_appointment_id, v_uid, a.doctor_id, p_rating, p_comment)
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


-- Doktori Im — Row-Level Security
-- Default-deny on every table; explicit policies per role.
-- Role/status checks use helper functions that read public.users /
-- doctor_profiles (NOT the JWT) so changes take effect immediately.

alter table public.users               enable row level security;
alter table public.specialties         enable row level security;
alter table public.doctor_profiles     enable row level security;
alter table public.patient_profiles    enable row level security;
alter table public.doctor_credentials  enable row level security;
alter table public.doctor_specialties  enable row level security;
alter table public.availability_rules  enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.appointments        enable row level security;
alter table public.appointment_notes   enable row level security;
alter table public.appointment_status_history enable row level security;
alter table public.waitlist_entries    enable row level security;
alter table public.reviews             enable row level security;
alter table public.notifications       enable row level security;

-- ------------------------- users -------------------------
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- role is immutable via self-update: new role must equal current role
    and role = (select role from public.users where id = auth.uid())
  );

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------- specialties (public read) -------------------------
drop policy if exists specialties_read on public.specialties;
create policy specialties_read on public.specialties
  for select using (true);

drop policy if exists specialties_admin_write on public.specialties;
create policy specialties_admin_write on public.specialties
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------- doctor_profiles -------------------------
-- Approved doctors are publicly visible; a doctor sees their own row; admin all.
drop policy if exists doctor_public_read on public.doctor_profiles;
create policy doctor_public_read on public.doctor_profiles
  for select using (
    status = 'approved' or user_id = auth.uid() or public.is_admin()
  );

drop policy if exists doctor_self_update on public.doctor_profiles;
create policy doctor_self_update on public.doctor_profiles
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- doctor cannot self-approve or change their own status
    and status = (select status from public.doctor_profiles where user_id = auth.uid())
  );

drop policy if exists doctor_admin_all on public.doctor_profiles;
create policy doctor_admin_all on public.doctor_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------- patient_profiles -------------------------
drop policy if exists patient_self on public.patient_profiles;
create policy patient_self on public.patient_profiles
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ------------------------- doctor_credentials -------------------------
drop policy if exists credentials_owner on public.doctor_credentials;
create policy credentials_owner on public.doctor_credentials
  for all using (doctor_id = auth.uid() or public.is_admin())
  with check (doctor_id = auth.uid() or public.is_admin());

-- ------------------------- doctor_specialties -------------------------
drop policy if exists docspec_read on public.doctor_specialties;
create policy docspec_read on public.doctor_specialties
  for select using (true);

drop policy if exists docspec_owner_write on public.doctor_specialties;
create policy docspec_owner_write on public.doctor_specialties
  for all using (doctor_id = auth.uid() or public.is_admin())
  with check (doctor_id = auth.uid() or public.is_admin());

-- ------------------------- availability_rules -------------------------
drop policy if exists rules_public_read on public.availability_rules;
create policy rules_public_read on public.availability_rules
  for select using (true);

-- Only approved doctors may write their own rules.
drop policy if exists rules_owner_write on public.availability_rules;
create policy rules_owner_write on public.availability_rules
  for all using (
    (doctor_id = auth.uid() and public.is_approved_doctor(auth.uid())) or public.is_admin()
  )
  with check (
    (doctor_id = auth.uid() and public.is_approved_doctor(auth.uid())) or public.is_admin()
  );

-- ------------------------- availability_exceptions -------------------------
drop policy if exists exc_public_read on public.availability_exceptions;
create policy exc_public_read on public.availability_exceptions
  for select using (true);

drop policy if exists exc_owner_write on public.availability_exceptions;
create policy exc_owner_write on public.availability_exceptions
  for all using (
    (doctor_id = auth.uid() and public.is_approved_doctor(auth.uid())) or public.is_admin()
  )
  with check (
    (doctor_id = auth.uid() and public.is_approved_doctor(auth.uid())) or public.is_admin()
  );

-- ------------------------- appointments -------------------------
-- Patient sees own; doctor sees own; admin all. Writes go through RPCs
-- (SECURITY DEFINER), so no direct INSERT/UPDATE policy is granted.
drop policy if exists appt_select on public.appointments;
create policy appt_select on public.appointments
  for select using (
    patient_id = auth.uid() or doctor_id = auth.uid() or public.is_admin()
  );

-- ------------------------- appointment_notes (doctor-private) -------------------------
drop policy if exists notes_doctor on public.appointment_notes;
create policy notes_doctor on public.appointment_notes
  for all using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_notes.appointment_id
        and (a.doctor_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_notes.appointment_id
        and (a.doctor_id = auth.uid() or public.is_admin())
    )
  );

-- ------------------------- appointment_status_history -------------------------
drop policy if exists history_read on public.appointment_status_history;
create policy history_read on public.appointment_status_history
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_status_history.appointment_id
        and (a.patient_id = auth.uid() or a.doctor_id = auth.uid() or public.is_admin())
    )
  );

-- ------------------------- waitlist_entries -------------------------
drop policy if exists waitlist_owner on public.waitlist_entries;
create policy waitlist_owner on public.waitlist_entries
  for all using (patient_id = auth.uid() or public.is_admin())
  with check (patient_id = auth.uid() or public.is_admin());

drop policy if exists waitlist_doctor_read on public.waitlist_entries;
create policy waitlist_doctor_read on public.waitlist_entries
  for select using (doctor_id = auth.uid() or patient_id = auth.uid() or public.is_admin());

-- ------------------------- reviews -------------------------
-- Public read (shown on profiles). Insert via submit_review RPC only.
-- No update/delete policy → patients and doctors can never edit/delete.
drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews
  for select using (true);

drop policy if exists reviews_admin_moderate on public.reviews;
create policy reviews_admin_moderate on public.reviews
  for delete using (public.is_admin());

-- ------------------------- notifications -------------------------
drop policy if exists notif_owner_read on public.notifications;
create policy notif_owner_read on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notif_owner_update on public.notifications;
create policy notif_owner_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- realtime (idempotent)
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;


-- ============================================================
-- SEED DATA
-- ============================================================
-- Doktori Im — Seed data
-- Specialties are bilingual reference data. Users/doctors are created through
-- Supabase Auth (see scripts/seed-users.mjs), then linked here if needed.

insert into public.specialties (slug, name_en, name_sq, icon_slug, sort_order) values
  ('general-practitioner', 'General Practitioner', 'Mjek i Përgjithshëm', 'stethoscope', 1),
  ('pediatrics',           'Pediatrics',           'Pediatri',            'baby', 2),
  ('cardiology',           'Cardiology',           'Kardiologji',         'heart-pulse', 3),
  ('dermatology',          'Dermatology',          'Dermatologji',        'scan-face', 4),
  ('dentistry',            'Dentistry',            'Stomatologji',        'tooth', 5),
  ('gynecology',           'Gynecology',           'Gjinekologji',        'flower', 6),
  ('orthopedics',          'Orthopedics',          'Ortopedi',            'bone', 7),
  ('ophthalmology',        'Ophthalmology',        'Oftalmologji',        'eye', 8),
  ('ent',                  'ENT (Otolaryngology)', 'Otorinolaringologji', 'ear', 9),
  ('neurology',            'Neurology',            'Neurologji',          'brain', 10),
  ('psychiatry',           'Psychiatry',           'Psikiatri',           'brain-circuit', 11),
  ('psychology',           'Psychology',           'Psikologji',          'message-circle-heart', 12),
  ('endocrinology',        'Endocrinology',        'Endokrinologji',      'activity', 13),
  ('gastroenterology',     'Gastroenterology',     'Gastroenterologji',   'pill', 14),
  ('urology',              'Urology',              'Urologji',            'droplet', 15),
  ('pulmonology',          'Pulmonology',          'Pneumologji',         'wind', 16),
  ('rheumatology',         'Rheumatology',         'Reumatologji',        'hand', 17),
  ('physiotherapy',        'Physiotherapy',        'Fizioterapi',         'dumbbell', 18)
on conflict (slug) do nothing;
