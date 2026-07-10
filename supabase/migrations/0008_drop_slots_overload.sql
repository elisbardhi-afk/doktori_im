-- Drop legacy overloads that cause PostgREST HTTP 300 (ambiguous function) errors,
-- and recreate book_appointment with the fixed internal get_available_slots call.
--
-- Root cause: migration 0004 added p_duration_minutes to get_available_slots and
-- added p_service_id to book_appointment. Migration 0007 replaced get_available_slots
-- with a hardcoded-15-min version (4 params) but never dropped the 5-param overload.
-- book_appointment from 0004 still calls get_available_slots with 5 params internally.

-- 1. Drop both old overloads.
drop function if exists public.get_available_slots(uuid, date, date, uuid, integer);
drop function if exists public.book_appointment(uuid, timestamptz, text);

-- 2. Recreate book_appointment calling the current 4-param get_available_slots.
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

  -- Use the current 4-param signature (p_duration_minutes was dropped in 0007).
  select * into v_slot
  from public.get_available_slots(p_doctor_id, v_from, v_from, null)
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
