import { createClient } from "@/lib/supabase/server";
import type { MessageThreadRow } from "@/lib/database.types";

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface MessageThread {
  id: string;
  type: "appointment" | "doctor";
  appointmentId: string | null;
  patientId: string;
  doctorId: string;
  messages: Message[];
}

/**
 * Fetch a single message thread with all messages, ordered chronologically.
 * Returns null if user is not a participant (unauthorized).
 */
export async function getMessageThread(
  threadId: string,
  userId: string,
): Promise<MessageThread | null> {
  const supabase = createClient();

  // Fetch the thread metadata
  const { data: threadData } = await supabase
    .from("message_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (!threadData) return null;

  const thread = threadData as MessageThreadRow;

  // Verify authorization: user must be patient or doctor
  if (thread.patient_id !== userId && thread.doctor_id !== userId) {
    return null;
  }

  // Fetch all messages with sender names
  const { data: messagesData } = await supabase
    .from("messages")
    .select(
      `
      id, sender_id, body, created_at, read_at,
      sender:users!messages_sender_id_fkey(full_name)
    `,
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (!messagesData) {
    return {
      id: thread.id,
      type: thread.type as "appointment" | "doctor",
      appointmentId: thread.appointment_id,
      patientId: thread.patient_id,
      doctorId: thread.doctor_id,
      messages: [],
    };
  }

  const messages = (
    messagesData as unknown as Array<{
      id: string;
      sender_id: string;
      body: string;
      created_at: string;
      read_at: string | null;
      sender: { full_name: string | null } | { full_name: string | null }[];
    }>
  ).map((m) => {
    const senderName =
      Array.isArray(m.sender) && m.sender.length > 0
        ? m.sender[0].full_name ?? "Unknown"
        : (m.sender as { full_name: string | null }).full_name ?? "Unknown";

    return {
      id: m.id,
      senderId: m.sender_id,
      senderName,
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
    };
  });

  return {
    id: thread.id,
    type: thread.type as "appointment" | "doctor",
    appointmentId: thread.appointment_id,
    patientId: thread.patient_id,
    doctorId: thread.doctor_id,
    messages,
  };
}

/**
 * Fetch all message threads for an appointment where user is a participant.
 * Returns an empty array if user is not part of the appointment or no threads exist.
 */
export async function getAppointmentMessageThreads(
  appointmentId: string,
  userId: string,
): Promise<MessageThread[]> {
  const supabase = createClient();

  // Fetch all threads for this appointment where user is a participant
  const { data: threadsData } = await supabase
    .from("message_threads")
    .select("*")
    .eq("appointment_id", appointmentId)
    .or(`patient_id.eq.${userId},doctor_id.eq.${userId}`);

  if (!threadsData || threadsData.length === 0) {
    return [];
  }

  const threads = threadsData as MessageThreadRow[];

  // Fetch messages for all threads
  const { data: allMessagesData } = await supabase
    .from("messages")
    .select(
      `
      id, thread_id, sender_id, body, created_at, read_at,
      sender:users!messages_sender_id_fkey(full_name)
    `,
    )
    .in(
      "thread_id",
      threads.map((t) => t.id),
    )
    .order("created_at", { ascending: true });

  const messagesByThread = new Map<string, Message[]>();

  if (allMessagesData) {
    (
      allMessagesData as unknown as Array<{
        id: string;
        thread_id: string;
        sender_id: string;
        body: string;
        created_at: string;
        read_at: string | null;
        sender: { full_name: string | null } | { full_name: string | null }[];
      }>
    ).forEach((m) => {
      const senderName =
        Array.isArray(m.sender) && m.sender.length > 0
          ? m.sender[0].full_name ?? "Unknown"
          : (m.sender as { full_name: string | null }).full_name ?? "Unknown";

      const message: Message = {
        id: m.id,
        senderId: m.sender_id,
        senderName,
        body: m.body,
        createdAt: m.created_at,
        readAt: m.read_at,
      };

      if (!messagesByThread.has(m.thread_id)) {
        messagesByThread.set(m.thread_id, []);
      }
      messagesByThread.get(m.thread_id)!.push(message);
    });
  }

  return threads.map((thread) => ({
    id: thread.id,
    type: thread.type as "appointment" | "doctor",
    appointmentId: thread.appointment_id,
    patientId: thread.patient_id,
    doctorId: thread.doctor_id,
    messages: messagesByThread.get(thread.id) ?? [],
  }));
}
