import { createClient } from "@/lib/supabase/server";
import type { DoctorCardData } from "@/components/doctor-card";
import type { AvailableSlot, SpecialtyRow } from "@/lib/database.types";

interface DoctorSearchParams {
  specialty?: string; // specialty slug
  city?: string;
  q?: string; // name search
  limit?: number;
}

/** Localized specialty name by current locale. */
function specialtyName(
  s: { name_sq: string; name_en: string },
  locale: string,
): string {
  return locale === "en" ? s.name_en : s.name_sq;
}

/**
 * Fetch approved doctors with their specialties and next available slot.
 * RLS ensures only `approved` doctors are returned to anon/patients.
 */
export async function searchDoctors(
  params: DoctorSearchParams,
  locale: string,
): Promise<DoctorCardData[]> {
  const supabase = createClient();

  let query = supabase
    .from("doctor_profiles")
    .select(
      `
      user_id, slug, photo_url, city, clinic_name, avg_rating, review_count,
      consultation_fee,
      users:users!inner(full_name),
      doctor_specialties(specialty_id, specialties(slug, name_sq, name_en))
    `,
    )
    .eq("status", "approved")
    .limit(params.limit ?? 24);

  if (params.city) query = query.ilike("city", `%${params.city}%`);

  const { data, error } = await query;
  if (error || !data) return [];

  // Filter by specialty slug / name query in JS (join-filtering is awkward via PostgREST).
  let rows = data as unknown as Array<{
    user_id: string;
    slug: string;
    photo_url: string | null;
    city: string | null;
    clinic_name: string | null;
    avg_rating: number;
    review_count: number;
    consultation_fee: number | null;
    users: { full_name: string | null } | { full_name: string | null }[];
    doctor_specialties: Array<{
      specialties: { slug: string; name_sq: string; name_en: string };
    }>;
  }>;

  if (params.specialty) {
    rows = rows.filter((r) =>
      r.doctor_specialties.some((ds) => ds.specialties?.slug === params.specialty),
    );
  }
  if (params.q) {
    const needle = params.q.toLowerCase();
    rows = rows.filter((r) => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      return (u?.full_name ?? "").toLowerCase().includes(needle);
    });
  }

  // Fetch next available slot per doctor (cheap: 14-day window, first row).
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  const cards = await Promise.all(
    rows.map(async (r): Promise<DoctorCardData> => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      const { data: slotsData } = await supabase.rpc("get_available_slots", {
        p_doctor_id: r.user_id,
        p_from: from,
        p_to: to,
      });
      const slots = (slotsData ?? []) as AvailableSlot[];
      const nextSlot = slots.length > 0 ? slots[0].slot_start : null;

      return {
        slug: r.slug,
        fullName: u?.full_name ?? "—",
        photoUrl: r.photo_url,
        city: r.city,
        clinicName: r.clinic_name,
        avgRating: Number(r.avg_rating),
        reviewCount: r.review_count,
        consultationFee: r.consultation_fee != null ? Number(r.consultation_fee) : null,
        specialties: r.doctor_specialties
          .map((ds) => (ds.specialties ? specialtyName(ds.specialties, locale) : ""))
          .filter(Boolean),
        nextSlot,
      };
    }),
  );

  return cards;
}

/** Fetch all specialties (for the grid + filters), localized ordering by sort_order. */
export async function getSpecialties(): Promise<SpecialtyRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("specialties")
    .select("*")
    .order("sort_order");
  return (data ?? []) as SpecialtyRow[];
}
