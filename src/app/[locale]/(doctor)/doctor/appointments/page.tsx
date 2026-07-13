import { getLocale, getTranslations, setRequestLocale } from “next-intl/server”;
import { requireDoctor } from “@/lib/guards”;
import { getMyAppointments } from “@/lib/queries/appointments”;
import { StatusBadge } from “@/components/status-badge”;
import { AppointmentActions } from “@/components/appointment-actions”;
import { EmptyState } from “@/components/empty-state”;
import { Card } from “@/components/ui/card”;
import { PastAppointmentsCollapsible } from “@/components/past-appointments-collapsible”;
import { formatInTirane } from “@/lib/datetime”;
import { User, Calendar } from “lucide-react”;

export default async function DoctorAppointmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();
  const { user } = await requireDoctor();
  const appts = await getMyAppointments(“doctor”, activeLocale, undefined, undefined, user.id);

  const active = appts.filter((a) => a.status !== “cancelled”);
  const cancelled = appts.filter((a) => a.status === “cancelled”);

  return (
    <div className=”flex flex-col gap-6”>
      <h1 className=”text-2xl font-bold text-foreground”>{t(“nav.myAppointments”)}</h1>

      {active.length === 0 && cancelled.length === 0 ? (
        <EmptyState title={t(“appointments.empty”)} icon=”CalendarX” />
      ) : (
        <>
          {active.length > 0 && (
            <div className=”flex flex-col gap-3”>
              {active.map((a) => (
                <Card
                  key={a.id}
                  className=”flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between”
                >
                  <div className=”flex flex-col gap-1.5”>
                    <div className=”flex items-center gap-2”>
                      <User className=”size-4 text-primary” />
                      <span className=”font-bold text-foreground”>{a.patientName}</span>
                    </div>
                    <div className=”flex items-center gap-2 text-sm text-muted-foreground”>
                      <Calendar className=”size-4” />
                      {formatInTirane(a.startsAt, “EEEE, d MMM yyyy – HH:mm”)}
                    </div>
                    {a.reason && (
                      <p className=”text-sm text-muted-foreground”>”{a.reason}”</p>
                    )}
                  </div>
                  <div className=”flex items-center gap-3”>
                    <StatusBadge status={a.status} />
                    <AppointmentActions
                      appointmentId={a.id}
                      status={a.status}
                      startsAt={a.startsAt}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {cancelled.length > 0 && (
            <PastAppointmentsCollapsible
              title={`${activeLocale === “en” ? “Cancelled” : “Anuluar”} (${cancelled.length})`}
            >
              <div className=”flex flex-col gap-3”>
                {cancelled.map((a) => (
                  <Card
                    key={a.id}
                    className=”flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between”
                  >
                    <div className=”flex flex-col gap-1.5”>
                      <div className=”flex items-center gap-2”>
                        <User className=”size-4 text-primary” />
                        <span className=”font-bold text-foreground”>{a.patientName}</span>
                      </div>
                      <div className=”flex items-center gap-2 text-sm text-muted-foreground”>
                        <Calendar className=”size-4” />
                        {formatInTirane(a.startsAt, “EEEE, d MMM yyyy – HH:mm”)}
                      </div>
                      {a.reason && (
                        <p className=”text-sm text-muted-foreground”>”{a.reason}”</p>
                      )}
                    </div>
                    <div className=”flex items-center gap-3”>
                      <StatusBadge status={a.status} />
                      <AppointmentActions
                        appointmentId={a.id}
                        status={a.status}
                        startsAt={a.startsAt}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </PastAppointmentsCollapsible>
          )}
        </>
      )}
    </div>
  );
}
