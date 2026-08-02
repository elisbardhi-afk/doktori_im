import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus } from "@/lib/database.types";

export interface AppointmentView {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string | null;
  doctorId: string;
  doctorName: string;
  doctorSlug: string;
  patientName: string;
  patientAvatarUrl: string | null;
  patientPhone: string | null;
  patientAddress: string | null;
  patientCity: string | null;
  patientPostalCode: string | null;
  specialty: string | null;
  serviceName: string | null;
  hasReview: boolean;
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
      id, starts_at, ends_at, status, reason, doctor_id,
      patient:users!appointments_patient_id_fkey(full_name, avatar_url, phone, address, city, postal_code),
      doctor:doctor_profiles!appointments_doctor_id_fkey(
        slug, full_name,
        doctor_specialties(specialties(name_sq, name_en))
      ),
      service:doctor_services(name)
    `,
    )
    .eq(column, id)
    .order("starts_at", { ascending: false });

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);

  const { data } = await query;

  if (!data) return [];

  // Fetch the set of appointment IDs that already have a review from this user.
  // Only relevant for the patient side; doctors never see the review button.
  let reviewedAppointmentIds = new Set<string>();
  if (side === "patient") {
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("appointment_id")
      .eq("patient_id", id);
    if (reviewRows) {
      reviewedAppointmentIds = new Set(
        (reviewRows as Array<{ appointment_id: string }>).map((r) => r.appointment_id),
      );
    }
  }

  return (data as unknown as Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: AppointmentStatus;
    reason: string | null;
    doctor_id: string;
    patient: { full_name: string | null; avatar_url: string | null; phone: string | null; address: string | null; city: string | null; postal_code: string | null } | { full_name: string | null; avatar_url: string | null; phone: string | null; address: string | null; city: string | null; postal_code: string | null }[];
    doctor: {
      slug: string;
      full_name: string | null;
      doctor_specialties: Array<{
        specialties: { name_sq: string; name_en: string } | null;
      }>;
    };
    service: { name: string } | null;
  }>).map((a) => {
    const p = Array.isArray(a.patient) ? a.patient[0] : a.patient;
    const spec = a.doctor?.doctor_specialties?.[0]?.specialties ?? null;
    const svc = Array.isArray(a.service) ? (a.service[0] ?? null) : a.service;
    return {
      id: a.id,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      status: a.status,
      reason: a.reason,
      doctorId: a.doctor_id,
      doctorName: a.doctor?.full_name ?? "—",
      doctorSlug: a.doctor?.slug ?? "",
      patientName: p?.full_name ?? "—",
      patientAvatarUrl: p?.avatar_url ?? null,
      patientPhone: p?.phone ?? null,
      patientAddress: p?.address ?? null,
      patientCity: p?.city ?? null,
      patientPostalCode: p?.postal_code ?? null,
      specialty: spec ? (locale === "en" ? spec.name_en : spec.name_sq) : null,
      serviceName: svc?.name ?? null,
      hasReview: reviewedAppointmentIds.has(a.id),
    };
  });
}
