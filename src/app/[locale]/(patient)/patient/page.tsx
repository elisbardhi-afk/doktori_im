import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getMyAppointments } from "@/lib/queries/appointments";
import { getCurrentUser } from "@/lib/auth";
import { AppointmentCard } from "@/components/appointment-card";
import { EmptyState } from "@/components/empty-state";
import { PastAppointmentsCollapsible } from "@/components/past-appointments-collapsible";

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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayAppts = appts.filter((a) => {
    const apptDate = new Date(new Date(a.startsAt).getFullYear(), new Date(a.startsAt).getMonth(), new Date(a.startsAt).getDate());
    return apptDate.getTime() === today.getTime() && ["confirmed", "pending"].includes(a.status);
  }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const upcoming = appts.filter(
    (a) => new Date(a.startsAt) >= tomorrow && ["confirmed", "pending"].includes(a.status),
  ).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const past = appts.filter(
    (a) => ["completed", "cancelled", "no_show"].includes(a.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {activeLocale === "en" ? "Welcome" : "Mirë se erdhët"}, {user?.full_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeLocale === "en" ? "Manage your appointments" : "Menaxhoni takimet tuaja"}
        </p>
      </div>

      {todayAppts.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">
            {activeLocale === "en" ? "Today" : "Sot"} ({todayAppts.length})
          </h2>
          <div className="flex flex-col gap-3">
            {todayAppts.map((a) => (
              <AppointmentCard key={a.id} appt={a} perspective="patient" />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <PastAppointmentsCollapsible title={`${t("appointments.upcoming")} (${upcoming.length})`}>
          <div className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a.id} appt={a} perspective="patient" />
            ))}
          </div>
        </PastAppointmentsCollapsible>
      )}

      {past.length > 0 && (
        <PastAppointmentsCollapsible
          title={`${activeLocale === "en" ? "Past appointments" : "Takime të kaluara"} (${past.length})`}
        >
          <div className="flex flex-col gap-3">
            {past.map((a) => (
              <AppointmentCard key={a.id} appt={a} perspective="patient" />
            ))}
          </div>
        </PastAppointmentsCollapsible>
      )}

      {todayAppts.length === 0 && upcoming.length === 0 && past.length === 0 && (
        <EmptyState title={t("appointments.empty")} icon="CalendarX" />
      )}
    </div>
  );
}
