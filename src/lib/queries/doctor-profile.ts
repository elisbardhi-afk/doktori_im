import { createClient } from "@/lib/supabase/server";
import type { AvailableSlot } from "@/lib/database.types";

export interface DoctorProfileDetail {
  userId: string;
  slug: string;
  fullName: string;
  bio: string | null;
  photoUrl: string | null;
  city: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  consultationFee: number | null;
  languages: string[];
  avgRating: number;
  reviewCount: number;
  specialties: string[];
}

export interface DoctorReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  patientName: string;
  serviceId: string | null;
  serviceName: string | null;
}

/** Full public profile for one doctor by slug (RLS: approved only). */
export async function getDoctorBySlug(
  slug: string,
  locale: string,
): Promise<DoctorProfileDetail | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("doctor_profiles")
    .select(
      `
      user_id, slug, full_name, bio, photo_url, city, clinic_name, clinic_address,
      consultation_fee, languages, avg_rating, review_count,
      doctor_specialties(specialties(name_sq, name_en))
    `,
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();

  if (!data) return null;

  const r = data as unknown as {
    user_id: string;
    slug: string;
    full_name: string | null;
    bio: string | null;
    photo_url: string | null;
    city: string | null;
    clinic_name: string | null;
    clinic_address: string | null;
    consultation_fee: number | null;
    languages: string[];
    avg_rating: number;
    review_count: number;
    doctor_specialties: Array<{
      specialties: { name_sq: string; name_en: string } | null;
    }>;
  };

  return {
    userId: r.user_id,
    slug: r.slug,
    fullName: r.full_name ?? "—",
    bio: r.bio,
    photoUrl: r.photo_url,
    city: r.city,
    clinicName: r.clinic_name,
    clinicAddress: r.clinic_address,
    consultationFee: r.consultation_fee != null ? Number(r.consultation_fee) : null,
    languages: r.languages ?? [],
    avgRating: Number(r.avg_rating),
    reviewCount: r.review_count,
    specialties: r.doctor_specialties
      .map((ds) =>
        ds.specialties ? (locale === "en" ? ds.specialties.name_en : ds.specialties.name_sq) : "",
      )
      .filter(Boolean),
  };
}

/** Reviews for a doctor (public read). */
export async function getDoctorReviews(doctorId: string): Promise<DoctorReview[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, patient_name, service_id, service:doctor_services(name)")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data) return [];
  return (data as unknown as Array<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    patient_name: string | null;
    service_id: string | null;
    service: { name: string } | { name: string }[] | null;
  }>).map((r) => {
    const serviceRaw = r.service;
    const serviceName = serviceRaw
      ? Array.isArray(serviceRaw)
        ? serviceRaw[0]?.name ?? null
        : (serviceRaw as { name: string }).name
      : null;
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      patientName: r.patient_name ?? "Anonim",
      serviceId: r.service_id,
      serviceName,
    };
  });
}

/** Available slots for a doctor over a date range. */
export async function getDoctorSlots(
  doctorId: string,
  fromDate: string,
  toDate: string,
): Promise<AvailableSlot[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_available_slots", {
    p_doctor_id: doctorId,
    p_from: fromDate,
    p_to: toDate,
  });
  const slots = (data ?? []) as AvailableSlot[];
  return slots.sort((a, b) => a.slot_start.localeCompare(b.slot_start));
}
