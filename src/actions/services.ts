"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addDoctorService(input: {
  name: string;
  durationMinutes: number;
  price?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const { error } = await supabase.from("doctor_services").insert({
    doctor_id: user.id,
    name: input.name,
    duration_minutes: input.durationMinutes,
    price: input.price ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/services");
  return { ok: true };
}

export async function deleteDoctorService(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("doctor_services")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/services");
  return { ok: true };
}
