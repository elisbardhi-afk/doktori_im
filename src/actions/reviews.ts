"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ReviewResult {
  ok: boolean;
  error?: string;
}

export async function submitReview(input: {
  appointmentId: string;
  rating: number;
  comment?: string;
}): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("submit_review", {
    p_appointment_id: input.appointmentId,
    p_rating: input.rating,
    p_comment: input.comment ?? null,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes("ALREADY_REVIEWED")) return { ok: false, error: "already_reviewed" };
    if (msg.includes("NOT_COMPLETED")) return { ok: false, error: "not_completed" };
    if (msg.includes("FORBIDDEN")) return { ok: false, error: "forbidden" };
    return { ok: false, error: "unknown" };
  }

  revalidatePath("/patient/appointments");
  return { ok: true };
}
