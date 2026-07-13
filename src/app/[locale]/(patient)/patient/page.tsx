import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyAppointments } from "@/lib/queries/appointments";
import { getCurrentUser } from "@/lib/auth";
import { AppointmentCard } from "@/components/appointment-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default async function PatientDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();
  const [user, appts] = await Promise.all([
    getCurrentUser(),
    getMyAppointments("patient", activeLocale),
  ]);

  const now = new Date();
  const upcoming = appts.filter(
    (a) => new Date(a.startsAt) > now && ["confirmed", "pending"].includes(a.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {activeLocale === "en" ? "Welcome" : "Mirë se erdhët"}, {user?.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeLocale === "en" ? "Manage your appointments" : "Menaxhoni takimet tuaja"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/doctors">
              <Search className="size-4" />
              {t("search.title")}
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-foreground">
          {t("appointments.upcoming")} ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title={t("appointments.empty")} icon="CalendarX" />
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a.id} appt={a} perspective="patient" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
