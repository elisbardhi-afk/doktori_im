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
  full_name text, -- denormalized (doctor names are public; users rows are not)
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
  patient_name text, -- denormalized (reviews are public; users rows are not)
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
