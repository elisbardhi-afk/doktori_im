import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getMyAppointments } from "@/lib/queries/appointments";
import { AppointmentCard } from "@/components/appointment-card";
import { EmptyState } from "@/components/empty-state";
import { PastAppointmentsCollapsible } from "@/components/past-appointments-collapsible";

export default async function PatientAppointmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();
  const appts = await getMyAppointments("patient", activeLocale);

  const now = new Date();
  const upcoming = appts.filter(
    (a) => new Date(a.startsAt) > now && ["confirmed", "pending"].includes(a.status),
  );
  const past = appts.filter((a) => !upcoming.includes(a));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.myAppointments")}</h1>

      <section>
        <h2 className="mb-3 text-lg font-bold text-foreground">
          {t("appointments.upcoming")}
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
      </section>

      {past.length > 0 && (
        <section>
          <PastAppointmentsCollapsible title={`${t("appointments.past")} (${past.length})`}>
            <div className="flex flex-col gap-3">
              {past.map((a) => (
                <AppointmentCard key={a.id} appt={a} perspective="patient" />
              ))}
            </div>
          </PastAppointmentsCollapsible>
        </section>
      )}
    </div>
  );
}
