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
