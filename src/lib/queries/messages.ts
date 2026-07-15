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
  type: "appointment" | "general";
  appointmentId: string | null;
  patientId?: string;
  doctorId?: string;
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
      type: thread.type as "appointment" | "general",
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
    type: thread.type as "appointment" | "general",
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
    type: thread.type as "appointment" | "general",
    appointmentId: thread.appointment_id,
    patientId: thread.patient_id,
    doctorId: thread.doctor_id,
    messages: messagesByThread.get(thread.id) ?? [],
  }));
}

export interface DoctorThreadSummary {
  threadId: string;
  appointmentId: string;
  appointmentStartsAt: string;
  patientName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

/**
 * Fetch all message threads for a doctor, with patient info, last message
 * preview, and unread count. Sorted by most-recent message descending.
 */
export async function getDoctorMessageThreads(
  doctorId: string,
): Promise<DoctorThreadSummary[]> {
  const supabase = createClient();

  // Fetch all threads for this doctor with their messages
  const { data: threadsData } = await supabase
    .from("message_threads")
    .select(
      `
      id, appointment_id,
      patient:users!message_threads_patient_id_fkey(full_name),
      appointment:appointments!message_threads_appointment_id_fkey(starts_at),
      messages(id, body, created_at, read_at, sender_id)
    `,
    )
    .eq("doctor_id", doctorId)
    .not("appointment_id", "is", null);

  if (!threadsData || threadsData.length === 0) return [];

  return (
    threadsData as unknown as Array<{
      id: string;
      appointment_id: string;
      patient: { full_name: string | null } | { full_name: string | null }[];
      appointment:
        | { starts_at: string }
        | { starts_at: string }[]
        | null;
      messages: Array<{
        id: string;
        body: string;
        created_at: string;
        read_at: string | null;
        sender_id: string;
      }>;
    }>
  )
    .map((t) => {
      const patientRaw = t.patient;
      const patientName = Array.isArray(patientRaw)
        ? (patientRaw[0]?.full_name ?? "Unknown")
        : ((patientRaw as { full_name: string | null })?.full_name ?? "Unknown");

      const apptRaw = t.appointment;
      const appointmentStartsAt = Array.isArray(apptRaw)
        ? (apptRaw[0]?.starts_at ?? "")
        : ((apptRaw as { starts_at: string } | null)?.starts_at ?? "");

      const msgs = t.messages ?? [];
      const sorted = [...msgs].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      const last = sorted[0] ?? null;
      const unreadCount = msgs.filter(
        (m) => m.read_at === null && m.sender_id !== doctorId,
      ).length;

      return {
        threadId: t.id,
        appointmentId: t.appointment_id,
        appointmentStartsAt,
        patientName,
        lastMessageBody: last?.body ?? null,
        lastMessageAt: last?.created_at ?? null,
        unreadCount,
      };
    })
    .filter((t) => t.appointmentStartsAt !== "")
    .sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
}

export interface PatientThreadSummary {
  threadId: string;
  appointmentId: string;
  appointmentStartsAt: string;
  doctorName: string;
  serviceName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export async function getPatientMessageThreads(
  patientId: string,
): Promise<PatientThreadSummary[]> {
  const supabase = createClient();

  const { data: threadsData } = await supabase
    .from("message_threads")
    .select(
      `
      id, doctor_id, appointment_id,
      appointment:appointments!message_threads_appointment_id_fkey(starts_at, service_id),
      messages(id, body, created_at, read_at, sender_id)
    `,
    )
    .eq("patient_id", patientId)
    .not("appointment_id", "is", null);

  if (!threadsData || threadsData.length === 0) return [];

  // Fetch doctor profiles for the doctor IDs
  const doctorIds = Array.from(new Set(threadsData.map((t) => t.doctor_id)));
  const { data: doctorProfiles } = await supabase
    .from("doctor_profiles")
    .select("user_id, full_name")
    .in("user_id", doctorIds);

  const doctorNameMap = new Map<string, string>();
  if (doctorProfiles) {
    doctorProfiles.forEach((profile) => {
      doctorNameMap.set(profile.user_id, profile.full_name ?? "Unknown");
    });
  }

  // Collect service IDs
  const serviceIds = new Set<string>();
  (threadsData as unknown as Array<{
    appointment:
      | { starts_at: string; service_id: string | null }
      | { starts_at: string; service_id: string | null }[]
      | null;
  }>).forEach((t) => {
    const apptRaw = t.appointment;
    if (apptRaw) {
      const serviceId = Array.isArray(apptRaw)
        ? apptRaw[0]?.service_id
        : ((apptRaw as { service_id: string | null }).service_id);
      if (serviceId) {
        serviceIds.add(serviceId);
      }
    }
  });

  // Fetch service names for the service IDs
  const serviceNameMap = new Map<string, string>();
  if (serviceIds.size > 0) {
    const { data: services } = await supabase
      .from("doctor_services")
      .select("id, name")
      .in("id", Array.from(serviceIds));

    if (services) {
      services.forEach((service) => {
        serviceNameMap.set(service.id, service.name);
      });
    }
  }

  return (
    threadsData as unknown as Array<{
      id: string;
      doctor_id: string;
      appointment_id: string;
      appointment:
        | { starts_at: string; service_id: string | null }
        | { starts_at: string; service_id: string | null }[]
        | null;
      messages: Array<{
        id: string;
        body: string;
        created_at: string;
        read_at: string | null;
        sender_id: string;
      }>;
    }>
  )
    .map((t) => {
      const doctorName = doctorNameMap.get(t.doctor_id) ?? "Unknown";

      const apptRaw = t.appointment;
      const appointmentStartsAt = Array.isArray(apptRaw)
        ? (apptRaw[0]?.starts_at ?? "")
        : ((apptRaw as { starts_at: string } | null)?.starts_at ?? "");

      const serviceId = Array.isArray(apptRaw)
        ? apptRaw[0]?.service_id ?? null
        : ((apptRaw as { service_id: string | null } | null)?.service_id ?? null);
      const serviceName = serviceId ? serviceNameMap.get(serviceId) ?? "Unknown" : "General";

      const msgs = t.messages ?? [];
      const sorted = [...msgs].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      const last = sorted[0] ?? null;
      const unreadCount = msgs.filter(
        (m) => m.read_at === null && m.sender_id !== patientId,
      ).length;

      return {
        threadId: t.id,
        appointmentId: t.appointment_id,
        appointmentStartsAt,
        doctorName,
        serviceName,
        lastMessageBody: last?.body ?? null,
        lastMessageAt: last?.created_at ?? null,
        unreadCount,
      };
    })
    .filter((t) => t.appointmentStartsAt !== "")
    .sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
}
