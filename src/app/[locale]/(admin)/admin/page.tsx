import { getLocale, setRequestLocale } from "next-intl/server";
import { getAdminStats } from "@/lib/queries/admin";
import { StatCard } from "@/components/stat-card";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const stats = await getAdminStats();
  const L = (en: string, sq: string) => (activeLocale === "en" ? en : sq);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {L("Admin dashboard", "Paneli i administratorit")}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={L("Doctors", "Mjekë")} value={stats.doctors} icon="Stethoscope" />
        <StatCard
          label={L("Pending approval", "Në pritje")}
          value={stats.pendingDoctors}
          icon="BadgeAlert"
        />
        <StatCard label={L("Patients", "Pacientë")} value={stats.patients} icon="Users" />
        <StatCard
          label={L("Appointments", "Takime")}
          value={stats.appointments}
          icon="Calendar"
        />
      </div>
    </div>
  );
}
