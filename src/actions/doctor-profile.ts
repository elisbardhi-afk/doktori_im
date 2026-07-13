"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Update the signed-in doctor's own profile (RLS forbids changing status). */
export async function updateDoctorProfile(input: {
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("doctor_profiles")
    .update({
      bio: input.bio,
      clinic_name: input.clinicName,
      clinic_address: input.clinicAddress,
      city: input.city,
    })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/doctor/profile");
  return { ok: true };
}
