import { createClient } from "@/lib/supabase/server";
import type { DoctorServiceRow } from "@/lib/database.types";

/** Active services for a doctor (public read for approved doctors). */
export async function getDoctorServices(doctorId: string): Promise<DoctorServiceRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("doctor_services")
    .select("*")
    .eq("doctor_id", doctorId)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as DoctorServiceRow[];
}
