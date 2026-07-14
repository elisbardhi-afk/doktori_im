-- Doktori Im — Messaging System
-- Supports doctor-patient conversations tied to appointments or standalone.

-- ---------------------------------------------------------------------------
-- message_threads (conversation metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('appointment', 'general')),
  appointment_id uuid references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.users(id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- appointment_id must be present when type='appointment'
  check (
    (type = 'appointment' and appointment_id is not null) or
    (type = 'general' and appointment_id is null)
  )
);

-- Partial unique indexes (cannot use table constraints with WHERE clause)
create unique index if not exists idx_unique_appointment_thread on public.message_threads(appointment_id, patient_id, doctor_id)
  where (type = 'appointment');

create unique index if not exists idx_unique_general_thread on public.message_threads(patient_id, doctor_id)
  where (type = 'general');

-- Additional lookup indexes
create index if not exists idx_msg_threads_patient on public.message_threads(patient_id);
create index if not exists idx_msg_threads_doctor on public.message_threads(doctor_id);
create index if not exists idx_msg_threads_appointment on public.message_threads(appointment_id)
  where appointment_id is not null;

-- ---------------------------------------------------------------------------
-- messages (individual messages in a thread)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_messages_thread_created on public.messages(thread_id, created_at);
create index if not exists idx_messages_sender on public.messages(sender_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

-- message_threads RLS
alter table public.message_threads enable row level security;

drop policy if exists message_threads_select on public.message_threads;
create policy message_threads_select on public.message_threads
  for select using (
    patient_id = auth.uid() or
    doctor_id = auth.uid() or
    public.is_admin()
  );

drop policy if exists message_threads_insert on public.message_threads;
create policy message_threads_insert on public.message_threads
  for insert with check (
    (patient_id = auth.uid() or doctor_id = auth.uid() or public.is_admin()) and
    (
      type = 'appointment' or
      (type = 'general' and patient_id = auth.uid())
    )
  );

-- messages RLS
alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id and
            (t.patient_id = auth.uid() or t.doctor_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid() and
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id and
            (t.patient_id = auth.uid() or t.doctor_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Notifications Trigger
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_message_insert()
returns trigger as $$
declare
  v_thread record;
  v_recipient_id uuid;
  v_sender_name text;
begin
  -- Get thread info and determine recipient
  select t.patient_id, t.doctor_id, t.type, t.appointment_id
  into v_thread
  from public.message_threads t
  where t.id = new.thread_id;

  -- Determine recipient (the non-sender)
  if new.sender_id = v_thread.patient_id then
    v_recipient_id := v_thread.doctor_id;
  else
    v_recipient_id := v_thread.patient_id;
  end if;

  -- Get sender's full name
  select full_name into v_sender_name
  from public.users
  where id = new.sender_id;

  -- Create notification for recipient
  insert into public.notifications (user_id, type, title, message, data, created_at)
  values (
    v_recipient_id,
    'message_received',
    'New message from ' || coalesce(v_sender_name, 'Unknown'),
    'You have a new message',
    jsonb_build_object(
      'thread_id', new.thread_id,
      'message_id', new.id,
      'sender_id', new.sender_id,
      'appointment_id', v_thread.appointment_id
    ),
    now()
  );

  return new;
end;
$$ language plpgsql;

drop trigger if exists on_message_inserted on public.messages;
create trigger on_message_inserted
  after insert on public.messages
  for each row
  execute function public.notify_on_message_insert();
