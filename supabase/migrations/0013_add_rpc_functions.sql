-- Doktori Im — RPC Functions for Appointment Editing
-- Three functions: reschedule_appointment, create_or_get_message_thread, send_message

-- ---------------------------------------------------------------------------
-- reschedule_appointment: Validates and reschedules an appointment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_starts_at timestamp with time zone,
  p_duration_minutes integer
)
RETURNS TABLE (
  success boolean,
  appointment_id uuid,
  error_code text
) AS $$
DECLARE
  v_appointment appointments%ROWTYPE;
  v_slot_available boolean;
BEGIN
  -- Fetch appointment
  SELECT * INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id;

  IF v_appointment.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'APPOINTMENT_NOT_FOUND'::text;
    RETURN;
  END IF;

  -- Check if cancelled
  IF v_appointment.status = 'cancelled' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'APPOINTMENT_CANCELLED'::text;
    RETURN;
  END IF;

  -- Check if time is in past
  IF p_new_starts_at < now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'SLOT_IN_PAST'::text;
    RETURN;
  END IF;

  -- Check if slot is available (exclude current appointment)
  WITH available AS (
    SELECT * FROM get_available_slots(
      v_appointment.doctor_id,
      (p_new_starts_at AT TIME ZONE 'Europe/Tirane')::date,
      (p_new_starts_at AT TIME ZONE 'Europe/Tirane')::date,
      p_appointment_id,
      p_duration_minutes
    )
  )
  SELECT COUNT(*) > 0 INTO v_slot_available
  FROM available
  WHERE slot_start = p_new_starts_at;

  IF NOT v_slot_available THEN
    RETURN QUERY SELECT false, NULL::uuid, 'SLOT_NOT_AVAILABLE'::text;
    RETURN;
  END IF;

  -- Update appointment
  UPDATE appointments
  SET
    starts_at = p_new_starts_at,
    ends_at = p_new_starts_at + (p_duration_minutes || ' minutes')::interval,
    rescheduled_from = v_appointment.id,
    updated_at = now()
  WHERE id = p_appointment_id;

  -- Create notification for doctor
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    data,
    created_at
  ) VALUES (
    v_appointment.doctor_id,
    'appointment_rescheduled'::notification_type,
    'Appointment rescheduled',
    'An appointment has been rescheduled',
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'new_start', p_new_starts_at,
      'patient_id', v_appointment.patient_id
    ),
    now()
  );

  RETURN QUERY SELECT true, p_appointment_id, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- create_or_get_message_thread: Idempotent thread creation/retrieval
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_or_get_message_thread(
  p_type text,
  p_appointment_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid
)
RETURNS TABLE (
  thread_id uuid
) AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  -- Try to find existing thread
  IF p_type = 'appointment' THEN
    SELECT id INTO v_thread_id
    FROM message_threads
    WHERE type = 'appointment'
      AND appointment_id = p_appointment_id
      AND patient_id = p_patient_id
      AND doctor_id = p_doctor_id;
  ELSE
    SELECT id INTO v_thread_id
    FROM message_threads
    WHERE type = 'general'
      AND appointment_id IS NULL
      AND patient_id = p_patient_id
      AND doctor_id = p_doctor_id;
  END IF;

  -- If not found, create new thread
  IF v_thread_id IS NULL THEN
    INSERT INTO message_threads (
      type,
      appointment_id,
      patient_id,
      doctor_id
    ) VALUES (
      p_type,
      CASE WHEN p_type = 'appointment' THEN p_appointment_id ELSE NULL END,
      p_patient_id,
      p_doctor_id
    )
    RETURNING message_threads.id INTO v_thread_id;
  END IF;

  RETURN QUERY SELECT v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- send_message: Send a message in a thread with validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_message(
  p_thread_id uuid,
  p_sender_id uuid,
  p_body text
)
RETURNS TABLE (
  message_id uuid,
  created_at timestamp
) AS $$
DECLARE
  v_sender_is_participant boolean;
  v_message_id uuid;
  v_created_at timestamp;
BEGIN
  -- Verify sender is a participant in the thread
  SELECT EXISTS (
    SELECT 1 FROM message_threads
    WHERE id = p_thread_id
      AND (patient_id = p_sender_id OR doctor_id = p_sender_id)
  ) INTO v_sender_is_participant;

  IF NOT v_sender_is_participant THEN
    RAISE EXCEPTION 'Sender is not a participant in this thread';
  END IF;

  -- Verify body is not empty
  IF p_body IS NULL OR p_body = '' THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;

  -- Insert message (trigger will create notification)
  INSERT INTO messages (
    thread_id,
    sender_id,
    body
  ) VALUES (
    p_thread_id,
    p_sender_id,
    p_body
  )
  RETURNING messages.id, messages.created_at INTO v_message_id, v_created_at;

  RETURN QUERY SELECT v_message_id, v_created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
