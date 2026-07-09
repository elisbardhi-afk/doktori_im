"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Transition = "confirm" | "complete" | "no_show";

const rpcName: Record<Transition, string> = {
  confirm: "confirm_appointment",
  complete: "complete_appointment",
  no_show: "mark_no_show",
};

/** Doctor/admin transition on an appointment. Authority enforced in the RPC. */
export async function transitionAppointment(
  appointmentId: string,
  transition: Transition,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc(rpcName[transition], {
    p_appointment_id: appointmentId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/appointments");
  return { ok: true };
}
