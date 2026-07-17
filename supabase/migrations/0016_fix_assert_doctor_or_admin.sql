-- Fix _assert_doctor_or_admin: was declared with `a public.appointments` (typed row)
-- but all callers pass a `record` variable, causing "cannot cast type record to appointments".
-- Changed to accept doctor_id uuid directly — the only field the function ever uses.

create or replace function public._assert_doctor_or_admin(p_doctor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() <> p_doctor_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end $$;

-- Update callers to pass a.doctor_id instead of the whole record.

create or replace function public.confirm_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform public._assert_doctor_or_admin(a.doctor_id);
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
  perform public._assert_doctor_or_admin(a.doctor_id);
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
  perform public._assert_doctor_or_admin(a.doctor_id);
  if a.status <> 'confirmed' then raise exception 'INVALID_TRANSITION' using errcode='P0001'; end if;
  update public.appointments set status='no_show' where id=p_appointment_id;
  insert into public.appointment_status_history(appointment_id,from_status,to_status,changed_by)
  values (p_appointment_id, a.status, 'no_show', auth.uid());
end $$;
