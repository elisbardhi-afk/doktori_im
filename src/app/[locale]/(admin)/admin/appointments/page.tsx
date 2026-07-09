import { getLocale, setRequestLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { formatInTirane } from "@/lib/datetime";
import type { AppointmentStatus } from "@/lib/database.types";

export default async function AdminAppointmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();

  const svc = createServiceClient();
  const { data } = await svc
    .from("appointments")
    .select(
      `
      id, starts_at, status,
      patient:users!appointments_patient_id_fkey(full_name),
      doctor:doctor_profiles!appointments_doctor_id_fkey(full_name)
    `,
    )
    .order("starts_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    starts_at: string;
    status: AppointmentStatus;
    patient: { full_name: string | null } | { full_name: string | null }[];
    doctor: { full_name: string | null };
  }>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {activeLocale === "en" ? "All appointments" : "Të gjitha takimet"} ({rows.length})
      </h1>
      <div className="flex flex-col gap-2">
        {rows.map((a) => {
          const p = Array.isArray(a.patient) ? a.patient[0] : a.patient;
          return (
            <Card key={a.id} className="flex items-center justify-between p-3.5">
              <div>
                <p className="font-semibold text-foreground">
                  {p?.full_name ?? "—"} → {a.doctor?.full_name ?? "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatInTirane(a.starts_at, "d MMM yyyy — HH:mm")}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
