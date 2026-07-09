"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") throw new Error("FORBIDDEN");
}

/** Create a specialty (admin only; RLS also enforces this). */
export async function createSpecialty(input: {
  slug: string;
  nameEn: string;
  nameSq: string;
  iconSlug: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = createClient();
  const { error } = await supabase.from("specialties").insert({
    slug: input.slug,
    name_en: input.nameEn,
    name_sq: input.nameSq,
    icon_slug: input.iconSlug,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/specialties");
  return { ok: true };
}
