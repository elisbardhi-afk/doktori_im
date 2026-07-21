import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getMyAppointments } from "@/lib/queries/appointments";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/appointment-actions";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PastAppointmentsCollapsible } from "@/components/past-appointments-collapsible";
import { Link } from "@/i18n/navigation";
import { formatInTirane } from "@/lib/datetime";
import { Calendar, ChevronRight } from "lucide-react";

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
  const appts = await getMyAppointments("doctor", activeLocale, undefined, undefined, user.id);

  const active = appts.filter((a) => ["pending", "confirmed"].includes(a.status));
  const past = appts.filter((a) => ["completed", "no_show", "cancelled"].includes(a.status));

  function PatientAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
    const initials = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    return (
      <Avatar className="size-10 rounded-full">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="rounded-full text-sm">{initials}</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.myAppointments")}</h1>

      {active.length === 0 && past.length === 0 ? (
        <EmptyState title={t("appointments.empty")} icon="CalendarX" />
      ) : (
        <>
          {active.length > 0 && (
            <div className="flex flex-col gap-3">
              {active.map((a) => (
                <Card
                  key={a.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`/doctor/appointments/${a.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1 group"
                  >
                    <PatientAvatar name={a.patientName} avatarUrl={a.patientAvatarUrl} />
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {a.patientName}
                      </span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="size-4" />
                        {formatInTirane(a.startsAt, "EEEE, d MMM yyyy - HH:mm")}
                      </div>
                      {a.reason && (
                        <p className="text-sm text-muted-foreground">&quot;{a.reason}&quot;</p>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                  </Link>
                  <div className="flex items-center gap-3 sm:ml-4">
                    <StatusBadge status={a.status} />
                    <AppointmentActions
                      appointmentId={a.id}
                      status={a.status}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <PastAppointmentsCollapsible
              title={`${activeLocale === "en" ? "Past" : "Të kaluara"} (${past.length})`}
            >
              <div className="flex flex-col gap-3">
                {past.map((a) => (
                  <Card
                    key={a.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <Link
                      href={`/doctor/appointments/${a.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1 group"
                    >
                      <PatientAvatar name={a.patientName} avatarUrl={a.patientAvatarUrl} />
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {a.patientName}
                        </span>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="size-4" />
                          {formatInTirane(a.startsAt, "EEEE, d MMM yyyy - HH:mm")}
                        </div>
                        {a.reason && (
                          <p className="text-sm text-muted-foreground">&quot;{a.reason}&quot;</p>
                        )}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                    </Link>
                    <div className="flex items-center gap-3 sm:ml-4">
                      <StatusBadge status={a.status} />
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
