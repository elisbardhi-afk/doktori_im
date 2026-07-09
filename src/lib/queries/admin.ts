import { createServiceClient } from "@/lib/supabase/service";
import type { DoctorStatus } from "@/lib/database.types";

export interface AdminDoctorRow {
  userId: string;
  fullName: string;
  email: string;
  slug: string;
  city: string | null;
  licenseNumber: string;
  status: DoctorStatus;
  createdAt: string;
}

/**
 * Admin listings use the service client (bypasses RLS) — every calling page is
 * behind requireRole(['admin']) in the (admin) layout, and mutations re-check
 * is_admin server-side.
 */
export async function getDoctorsForAdmin(
  status?: DoctorStatus,
): Promise<AdminDoctorRow[]> {
  const svc = createServiceClient();
  let q = svc
    .from("doctor_profiles")
    .select(
      "user_id, slug, city, license_number, status, created_at, users:users!inner(full_name, email)",
    )
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);

  const { data } = await q;
  if (!data) return [];

  return (data as unknown as Array<{
    user_id: string;
    slug: string;
    city: string | null;
    license_number: string;
    status: DoctorStatus;
    created_at: string;
    users: { full_name: string | null; email: string } | { full_name: string | null; email: string }[];
  }>).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      userId: r.user_id,
      fullName: u?.full_name ?? "—",
      email: u?.email ?? "",
      slug: r.slug,
      city: r.city,
      licenseNumber: r.license_number,
      status: r.status,
      createdAt: r.created_at,
    };
  });
}

export interface AdminStats {
  doctors: number;
  pendingDoctors: number;
  patients: number;
  appointments: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const svc = createServiceClient();
  const [doctors, pending, patients, appts] = await Promise.all([
    svc.from("doctor_profiles").select("user_id", { count: "exact", head: true }),
    svc
      .from("doctor_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "pending"),
    svc.from("users").select("id", { count: "exact", head: true }).eq("role", "patient"),
    svc.from("appointments").select("id", { count: "exact", head: true }),
  ]);
  return {
    doctors: doctors.count ?? 0,
    pendingDoctors: pending.count ?? 0,
    patients: patients.count ?? 0,
    appointments: appts.count ?? 0,
  };
}
