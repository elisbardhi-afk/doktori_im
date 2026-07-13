"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Result of rescheduling an appointment.
 * - ok: true if reschedule succeeded
 * - appointmentId: the rescheduled appointment's ID (on success)
 * - error: error code/message (on failure)
 */
export interface RescheduleResult {
  ok: boolean;
  appointmentId?: string;
  error?: string;
}

/**
 * Result of sending a message.
 * - ok: true if message was sent
 * - messageId: the created message's ID (on success)
 * - error: error message (on failure)
 */
export interface SendMessageResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Result of getting or creating a message thread.
 * - ok: true if thread was retrieved or created
 * - threadId: the thread's ID (on success)
 * - error: error message (on failure)
 */
export interface GetThreadResult {
  ok: boolean;
  threadId?: string;
  error?: string;
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Reschedule an appointment to a new date/time.
 * Validates that the user is authenticated and calls the reschedule_appointment RPC.
 * On success, revalidates the appointments cache.
 */
export async function rescheduleAppointment(
  appointmentId: string,
  newStartsAt: string
): Promise<RescheduleResult> {
  // Verify authentication
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "AUTH_REQUIRED" };
  }

  const supabase = createClient();

  // Fetch the appointment to get duration
  const { data: appointment, error: fetchError } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, status, doctor_id, patient_id")
    .eq("id", appointmentId)
    .single();

  if (fetchError || !appointment) {
    return { ok: false, error: "APPOINTMENT_NOT_FOUND" };
  }

  // Verify user is the patient
  if (appointment.patient_id !== user.id) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  // Calculate duration in minutes
  const startTime = new Date(appointment.starts_at).getTime();
  const endTime = new Date(appointment.ends_at).getTime();
  const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

  // Call RPC to reschedule
  const { data, error } = await supabase.rpc("reschedule_appointment", {
    p_appointment_id: appointmentId,
    p_new_starts_at: newStartsAt,
    p_duration_minutes: durationMinutes,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // data should be an array with one row: { success, appointment_id, error_code }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.success) {
    return { ok: false, error: result?.error_code || "UNKNOWN" };
  }

  // Revalidate caches
  revalidatePath("/patient/appointments");
  revalidatePath("/patient");

  return { ok: true, appointmentId: result.appointment_id };
}

/**
 * Send a message in a thread.
 * Validates that the user is authenticated and the message body is non-empty.
 * Calls the send_message RPC and returns the message ID.
 */
export async function sendMessage(
  threadId: string,
  body: string
): Promise<SendMessageResult> {
  // Verify authentication
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "AUTH_REQUIRED" };
  }

  // Validate body is non-empty
  if (!body || body.trim() === "") {
    return { ok: false, error: "EMPTY_MESSAGE" };
  }

  const supabase = createClient();

  // Call RPC to send message
  const { data, error } = await supabase.rpc("send_message", {
    p_thread_id: threadId,
    p_sender_id: user.id,
    p_body: body.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // data should be an array with one row: { message_id, created_at }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.message_id) {
    return { ok: false, error: "Failed to send message" };
  }

  // Revalidate caches if needed (optional for messaging)
  revalidatePath("/patient");

  return { ok: true, messageId: result.message_id };
}

/**
 * Get or create a message thread.
 * Validates that the user is authenticated, then calls the create_or_get_message_thread RPC.
 * Idempotent — returns the same thread if it already exists.
 */
export async function getOrCreateMessageThread(
  type: "appointment" | "doctor",
  doctorId: string,
  appointmentId?: string
): Promise<GetThreadResult> {
  // Verify authentication
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "AUTH_REQUIRED" };
  }

  const supabase = createClient();

  // Call RPC to get or create thread
  const { data, error } = await supabase.rpc("create_or_get_message_thread", {
    p_type: type,
    p_appointment_id: appointmentId || null,
    p_patient_id: user.id,
    p_doctor_id: doctorId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // data should be an array with one row: { thread_id }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.thread_id) {
    return { ok: false, error: "Failed to create or retrieve thread" };
  }

  return { ok: true, threadId: result.thread_id };
}
