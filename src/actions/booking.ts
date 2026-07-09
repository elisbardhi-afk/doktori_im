"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BookErrorCode =
  | "AUTH_REQUIRED"
  | "SLOT_IN_PAST"
  | "SLOT_NOT_AVAILABLE"
  | "SLOT_TAKEN"
  | "DUPLICATE_BOOKING"
  | "DOCTOR_NOT_BOOKABLE"
  | "SERVICE_NOT_FOUND"
  | "UNKNOWN";

export interface BookingResult {
  ok: boolean;
  appointmentId?: string;
  error?: BookErrorCode;
}

/** Map a Postgres error message to a typed, translatable code. */
function mapError(message: string): BookErrorCode {
  const codes: BookErrorCode[] = [
    "AUTH_REQUIRED",
    "SLOT_IN_PAST",
    "SLOT_NOT_AVAILABLE",
    "SLOT_TAKEN",
    "DUPLICATE_BOOKING",
    "DOCTOR_NOT_BOOKABLE",
    "SERVICE_NOT_FOUND",
  ];
  const found = codes.find((c) => message.includes(c));
  return found ?? "UNKNOWN";
}

/** Book an appointment. Strictly server-confirmed via the book_appointment RPC. */
export async function createBooking(input: {
  doctorId: string;
  startsAt: string; // ISO UTC
  reason?: string;
  serviceId?: string;
}): Promise<BookingResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("book_appointment", {
    p_doctor_id: input.doctorId,
    p_starts_at: input.startsAt,
    p_reason: input.reason ?? undefined,
    p_service_id: input.serviceId ?? undefined,
  });

  if (error) {
    return { ok: false, error: mapError(error.message) };
  }
  revalidatePath("/patient/appointments");
  return { ok: true, appointmentId: data as unknown as string };
}

/** Cancel an appointment (patient or doctor). */
export async function cancelAppointment(input: {
  appointmentId: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_appointment", {
    p_appointment_id: input.appointmentId,
    p_reason: input.reason ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/patient/appointments");
  revalidatePath("/doctor/appointments");
  return { ok: true };
}
