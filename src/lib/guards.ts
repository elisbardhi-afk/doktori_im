import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, DoctorStatus } from "@/lib/database.types";

/**
 * Require a signed-in user with one of `roles`. Redirects to /login if
 * unauthenticated, or to the user's own home if the role doesn't match.
 * Returns the user row when allowed.
 */
export async function requireRole(roles: UserRole[]) {
  const user = await getCurrentUser();
  const locale = await getLocale();

  if (!user) redirect({ href: "/login", locale });
  if (!roles.includes(user!.role)) {
    const home =
      user!.role === "doctor" ? "/doctor" : user!.role === "admin" ? "/admin" : "/patient";
    redirect({ href: home, locale });
  }
  return user!;
}

/** For doctor pages: also fetch approval status so the UI can gate features. */
export async function requireDoctor(): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  status: DoctorStatus;
}> {
  const user = await requireRole(["doctor"]);
  const supabase = createClient();
  const { data } = await supabase
    .from("doctor_profiles")
    .select("status")
    .eq("user_id", user.id)
    .single();
  const status = ((data as { status?: DoctorStatus } | null)?.status ??
    "pending") as DoctorStatus;
  return { user, status };
}
