"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { DoctorStatus } from "@/lib/database.types";

/**
 * Re-verify the SESSION user is an admin before any privileged (service-role)
 * action. Middleware/JWT are redirect-only — this is the real check (P0 #8).
 */
async function assertAdmin(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((data as { role?: string } | null)?.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user.id;
}

/** Approve, reject, or suspend a doctor. Writes status + notifies. */
export async function setDoctorStatus(
  doctorId: string,
  status: DoctorStatus,
): Promise<{ ok: boolean; error?: string }> {
  let adminId: string;
  try {
    adminId = await assertAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("doctor_profiles")
    .update({
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: status === "approved" ? adminId : null,
    })
    .eq("user_id", doctorId);

  if (error) return { ok: false, error: error.message };

  // Notify the doctor.
  const notifType =
    status === "approved"
      ? "doctor_approved"
      : status === "suspended"
        ? "doctor_suspended"
        : "doctor_rejected";
  const title =
    status === "approved"
      ? "Llogaria u miratua"
      : status === "suspended"
        ? "Llogaria u pezullua"
        : "Llogaria u refuzua";
  await svc.from("notifications").insert({
    user_id: doctorId,
    type: notifType,
    title,
    message: title,
    data: {},
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/doctors");
  return { ok: true };
}
