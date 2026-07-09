import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/database.types";

/**
 * The signed-in user's app profile (role, name, etc.), read from public.users.
 * Cached per-request. Returns null if not authenticated.
 */
export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as UserRow | null) ?? null;
});
