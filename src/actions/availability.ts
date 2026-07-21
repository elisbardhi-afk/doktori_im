"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Add a recurring weekly availability rule for the signed-in doctor. */
export async function addAvailabilityRule(input: {
  weekday: number;
  startTime: string;
  endTime: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const { error } = await supabase.from("availability_rules").insert({
    doctor_id: user.id,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/availability");
  revalidatePath("/doctors", "layout");
  return { ok: true };
}

/** Delete one of the doctor's own availability rules (RLS enforces ownership). */
export async function deleteAvailabilityRule(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("availability_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/availability");
  revalidatePath("/doctors", "layout");
  return { ok: true };
}

/** Delete a block exception owned by the signed-in doctor. */
export async function deleteBlockException(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("availability_exceptions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/availability");
  revalidatePath("/doctors", "layout");
  return { ok: true };
}

/** Add one-off block exception(s). When endDate is provided, every calendar day
 *  from date to endDate inclusive is blocked with the same time window / reason. */
export async function addBlockException(input: {
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const dates: string[] = [];
  const cur = new Date(input.date + "T00:00:00");
  const end = input.endDate
    ? new Date(input.endDate + "T00:00:00")
    : new Date(input.date + "T00:00:00");
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const records = dates.map((date) => ({
    doctor_id: user.id,
    exception_date: date,
    kind: "block" as const,
    start_time: input.startTime ?? null,
    end_time: input.endTime ?? null,
    reason: input.reason ?? null,
  }));

  const { error } = await supabase.from("availability_exceptions").insert(records);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/availability");
  revalidatePath("/doctors", "layout");
  return { ok: true };
}
