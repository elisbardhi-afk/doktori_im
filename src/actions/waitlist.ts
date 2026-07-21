"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { WaitlistEntryRow, WaitlistStatus } from "@/lib/database.types";

export interface WaitlistEntry extends WaitlistEntryRow {
  doctorName: string;
}

/** Join the waitlist after successfully booking an appointment. */
export async function joinWaitlist(
  doctorId: string,
  appointmentId: string,
  bookedStartsAt: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  // preferred_range = 30 days before the booked date up to (but not including) the booked date
  const bookedDate = new Date(bookedStartsAt);
  const rangeEnd = bookedDate.toISOString().slice(0, 10);
  const rangeStart = new Date(bookedDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const preferredRange = `[${rangeStart},${rangeEnd})`;

  const supabase = createClient();
  const { error } = await supabase.rpc("join_waitlist", {
    p_doctor_id: doctorId,
    p_appointment_id: appointmentId,
    p_preferred_range: preferredRange,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Remove a waitlist entry (cancel it). */
export async function cancelWaitlistEntry(
  entryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_waitlist_entry", {
    p_entry_id: entryId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/patient/waitlist");
  return { ok: true };
}

/** Accept a waitlist offer — books the new slot and cancels the old appointment. */
export async function claimWaitlistSlot(
  entryId: string,
  newStartsAt: string,
): Promise<{ ok: boolean; appointmentId?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_waitlist_slot", {
    p_entry_id: entryId,
    p_new_starts_at: newStartsAt,
  });

  if (error) return { ok: false, error: error.message };

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ok) {
    return { ok: false, error: result?.error_code ?? "UNKNOWN" };
  }

  revalidatePath("/patient/appointments");
  revalidatePath("/patient/waitlist");
  return { ok: true, appointmentId: result.appointment_id ?? undefined };
}

/** Fetch all active/notified waitlist entries for the current patient, with doctor name. */
export async function getWaitlistEntries(): Promise<WaitlistEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createClient();

  // Lazily expire stale notified entries first
  await supabase
    .from("waitlist_entries")
    .update({ status: "expired" as WaitlistStatus })
    .eq("patient_id", user.id)
    .eq("status", "notified" as WaitlistStatus)
    .lt("claim_expires_at", new Date().toISOString());

  const { data } = await supabase
    .from("waitlist_entries")
    .select(
      `
      id, patient_id, doctor_id, preferred_range, status,
      notified_at, claim_expires_at, source_appointment_id, created_at,
      doctor:doctor_profiles!waitlist_entries_doctor_id_fkey(full_name)
    `,
    )
    .eq("patient_id", user.id)
    .in("status", ["active", "notified"] as WaitlistStatus[])
    .order("created_at", { ascending: false });

  if (!data) return [];

  return (data as unknown as Array<WaitlistEntryRow & { doctor: { full_name: string | null } | null }>).map((row) => ({
    ...row,
    doctorName: row.doctor?.full_name ?? "Unknown doctor",
  }));
}
