"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { requireDoctor } from "@/lib/guards";
import type { AvailableSlot } from "@/lib/database.types";
import type { MessageThread, DoctorThreadSummary } from "@/lib/queries/messages";
import { getDoctorMessageThreads } from "@/lib/queries/messages";

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
  newStartsAt: string,
  durationMinutes?: number
): Promise<RescheduleResult> {
  // Verify authentication
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "AUTH_REQUIRED" };
  }

  const supabase = createClient();

  // Fetch the appointment to get duration if not provided
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

  // Use provided duration or calculate from appointment times
  let finalDurationMinutes = durationMinutes;
  if (!finalDurationMinutes) {
    const startTime = new Date(appointment.starts_at).getTime();
    const endTime = new Date(appointment.ends_at).getTime();
    finalDurationMinutes = Math.round((endTime - startTime) / (1000 * 60));
  }

  // Call RPC to reschedule
  const { data, error } = await supabase.rpc("reschedule_appointment", {
    p_appointment_id: appointmentId,
    p_new_starts_at: newStartsAt,
    p_duration_minutes: finalDurationMinutes,
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
  revalidatePath("/doctor/messages");

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

/**
 * Fetch available slots for a doctor on a given date range.
 * Server action wrapper around getDoctorSlots query (cannot be called from client).
 */
export async function fetchDoctorSlots(
  doctorId: string,
  fromDate: string,
  toDate: string
): Promise<AvailableSlot[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_available_slots", {
    p_doctor_id: doctorId,
    p_from: fromDate,
    p_to: toDate,
  });
  const slots = (data ?? []) as AvailableSlot[];
  return slots.sort((a, b) => a.slot_start.localeCompare(b.slot_start));
}

/**
 * Fetch a message thread with all messages.
 * Server action wrapper (cannot be called from client due to server-only imports).
 */
export async function fetchMessageThread(
  threadId: string
): Promise<MessageThread | null> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  const supabase = createClient();

  const { data: thread } = await supabase
    .from("message_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    return null;
  }

  // Verify user is a participant
  if (thread.patient_id !== user.id && thread.doctor_id !== user.id) {
    throw new Error("UNAUTHORIZED");
  }

  // Fetch all messages in thread, ordered chronologically
  const { data: messages } = await supabase
    .from("messages")
    .select(
      `
      id, sender_id, body, created_at, read_at,
      sender:users(full_name)
    `
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  return {
    id: thread.id,
    type: thread.type as "appointment" | "general",
    appointmentId: thread.appointment_id,
    messages: (messages || []).map(
      (m: Record<string, unknown>) => ({
        id: m.id as string,
        senderId: m.sender_id as string,
        senderName: ((m.sender as Record<string, unknown> | null)?.full_name as string) ?? "Unknown",
        body: m.body as string,
        createdAt: m.created_at as string,
        readAt: (m.read_at as string | null) ?? null,
      })
    ),
  };
}

/**
 * Fetch all message threads for the currently authenticated doctor.
 * Returns threads sorted by most-recent message descending.
 */
export async function fetchDoctorMessageThreads(): Promise<DoctorThreadSummary[]> {
  const { user } = await requireDoctor();
  return getDoctorMessageThreads(user.id);
}

/**
 * Mark all messages in a thread as read for the current user.
 * Only marks messages where the current user is NOT the sender and read_at is null.
 * Relies on optimistic UI update in the component — do not revalidate cache
 * to avoid interfering with local state during active session.
 */
export async function markThreadRead(threadId: string): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .neq("sender_id", user.id)
      .is("read_at", null);
  } catch {
    // Silently ignore — marking read is best-effort and must not break UX
  }
}
