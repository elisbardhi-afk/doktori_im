import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus } from "@/lib/database.types";

export interface AppointmentView {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string | null;
  doctorName: string;
  doctorSlug: string;
  patientName: string;
  specialty: string | null;
}

type Side = "patient" | "doctor";

/** Appointments for the current user, newest first. */
export async function getMyAppointments(
  side: Side,
  locale: string,
  from?: string,
  to?: string,
  userId?: string,
): Promise<AppointmentView[]> {
  const supabase = createClient();
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) return [];

  const column = side === "patient" ? "patient_id" : "doctor_id";

  let query = supabase
    .from("appointments")
    .select(
      `
      id, starts_at, ends_at, status, reason,
      patient:users!appointments_patient_id_fkey(full_name),
      doctor:doctor_profiles!appointments_doctor_id_fkey(
        slug, full_name,
        doctor_specialties(specialties(name_sq, name_en))
      )
    `,
    )
    .eq(column, id)
    .order("starts_at", { ascending: false });

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);

  const { data } = await query;

  if (!data) return [];

  return (data as unknown as Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: AppointmentStatus;
    reason: string | null;
    patient: { full_name: string | null } | { full_name: string | null }[];
    doctor: {
      slug: string;
      full_name: string | null;
      doctor_specialties: Array<{
        specialties: { name_sq: string; name_en: string } | null;
      }>;
    };
  }>).map((a) => {
    const p = Array.isArray(a.patient) ? a.patient[0] : a.patient;
    const spec = a.doctor?.doctor_specialties?.[0]?.specialties ?? null;
    return {
      id: a.id,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      status: a.status,
      reason: a.reason,
      doctorName: a.doctor?.full_name ?? "—",
      doctorSlug: a.doctor?.slug ?? "",
      patientName: p?.full_name ?? "—",
      specialty: spec ? (locale === "en" ? spec.name_en : spec.name_sq) : null,
    };
  });
}
