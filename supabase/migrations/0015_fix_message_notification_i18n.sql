-- Store sender_name in notification data so the frontend can build a localized title.
create or replace function public.notify_on_message_insert()
returns trigger language plpgsql security definer as $$
declare
  v_thread record;
  v_recipient_id uuid;
  v_sender_name text;
begin
  select t.patient_id, t.doctor_id, t.type, t.appointment_id
  into v_thread
  from public.message_threads t
  where t.id = new.thread_id;

  if new.sender_id = v_thread.patient_id then
    v_recipient_id := v_thread.doctor_id;
  else
    v_recipient_id := v_thread.patient_id;
  end if;

  select full_name into v_sender_name
  from public.users
  where id = new.sender_id;

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
      'sender_name', coalesce(v_sender_name, ''),
      'appointment_id', v_thread.appointment_id
    ),
    now()
  );

  return new;
end;
$$;
