-- Doktori Im — PATCH: make names readable where needed.
-- Problem: public.users RLS is self+admin only, so (a) anon can't read a
-- doctor's name for public profiles, and (b) a doctor can't read their
-- patient's name on an appointment. Paste into the SQL Editor and Run.

-- (1) Doctor names are public → denormalize onto doctor_profiles (avoids a
--     row-level users policy that would also leak the doctor's email/phone).
alter table public.doctor_profiles add column if not exists full_name text;

update public.doctor_profiles d
set full_name = u.full_name
from public.users u
where u.id = d.user_id and (d.full_name is distinct from u.full_name);

-- Keep it populated on new doctor signups.
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
  if v_requested = 'doctor' then v_role := 'doctor'; else v_role := 'patient'; end if;
  v_full_name := new.raw_user_meta_data->>'full_name';

  insert into public.users (id, email, role, full_name, phone, preferred_locale)
  values (new.id, new.email, v_role, v_full_name,
          new.raw_user_meta_data->>'phone',
          coalesce(new.raw_user_meta_data->>'locale', 'sq'))
  on conflict (id) do nothing;

  if v_role = 'doctor' then
    insert into public.doctor_profiles (user_id, slug, license_number, status, full_name)
    values (new.id, 'dr-' || substr(new.id::text, 1, 8),
            coalesce(new.raw_user_meta_data->>'license_number', 'PENDING-' || substr(new.id::text, 1, 8)),
            'pending', v_full_name)
    on conflict (user_id) do nothing;
  else
    insert into public.patient_profiles (user_id)
    values (new.id) on conflict (user_id) do nothing;
  end if;

  return new;
end $$;

-- (2) Counterparty names on appointments: you may read the users row of anyone
--     you share an appointment with (doctor↔patient).
drop policy if exists users_shared_appointment on public.users;
create policy users_shared_appointment on public.users
  for select using (
    exists (
      select 1 from public.appointments a
      where (a.patient_id = public.users.id and a.doctor_id = auth.uid())
         or (a.doctor_id = public.users.id and a.patient_id = auth.uid())
    )
  );

-- (3) Reviewer names are public → denormalize patient_name onto reviews at
--     insert time (reviews are public, users rows are not).
alter table public.reviews add column if not exists patient_name text;

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
