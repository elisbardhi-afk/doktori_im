import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getMyAppointments } from "@/lib/queries/appointments";
import type { AppointmentView } from "@/lib/queries/appointments";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/appointment-actions";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PastAppointmentsCollapsible } from "@/components/past-appointments-collapsible";
import { Link } from "@/i18n/navigation";
import { formatInTirane, dateInTirane } from "@/lib/datetime";
import { Calendar, ChevronRight } from "lucide-react";

/**
 * Group an array of appointments by their Tirane-local date ("yyyy-MM-dd").
 * Returns an array of [dateKey, appointments[]] pairs in the original order
 * of first occurrence — i.e. the caller controls sort order by pre-sorting
 * the input array before calling this function.
 */
function groupByDay(appointments: AppointmentView[]): Array<[string, AppointmentView[]]> {
  const map = new Map<string, AppointmentView[]>();
  for (const a of appointments) {
    const key = dateInTirane(a.startsAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return Array.from(map.entries());
}

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

  // Active: pending/confirmed — sort ascending so soonest day comes first.
  const active = appts
    .filter((a) => ["pending", "confirmed"].includes(a.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Past: completed/no_show/cancelled — keep descending (most recent first).
  const past = appts.filter((a) => ["completed", "no_show", "cancelled"].includes(a.status));

  const activeGroups = groupByDay(active);
  const pastGroups = groupByDay(past);

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

  function AppointmentCard({
    a,
    showActions,
  }: {
    a: AppointmentView;
    showActions: boolean;
  }) {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
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
              {formatInTirane(a.startsAt, "HH:mm")}
              {a.endsAt && ` – ${formatInTirane(a.endsAt, "HH:mm")}`}
            </div>
            {a.reason && (
              <p className="text-sm text-muted-foreground">&quot;{a.reason}&quot;</p>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
        </Link>
        <div className="flex items-center gap-3 sm:ml-4">
          <StatusBadge status={a.status} />
          {showActions && (
            <AppointmentActions appointmentId={a.id} status={a.status} />
          )}
        </div>
      </Card>
    );
  }

  function DaySection({
    dateKey,
    appointments,
    showActions,
  }: {
    dateKey: string;
    appointments: AppointmentView[];
    showActions: boolean;
  }) {
    // Format the day header: "Monday, 3 Aug 2026"
    const heading = formatInTirane(new Date(dateKey + "T12:00:00Z"), "EEEE, d MMM yyyy");
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
          {heading}
        </h2>
        <div className="flex flex-col gap-3">
          {appointments.map((a) => (
            <AppointmentCard key={a.id} a={a} showActions={showActions} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.myAppointments")}</h1>

      {active.length === 0 && past.length === 0 ? (
        <EmptyState title={t("appointments.empty")} icon="CalendarX" />
      ) : (
        <>
          {activeGroups.length > 0 && (
            <div className="flex flex-col gap-6">
              {activeGroups.map(([dateKey, dayAppts]) => (
                <DaySection
                  key={dateKey}
                  dateKey={dateKey}
                  appointments={dayAppts}
                  showActions={true}
                />
              ))}
            </div>
          )}

          {pastGroups.length > 0 && (
            <PastAppointmentsCollapsible
              title={`${activeLocale === "en" ? "Past" : "Të kaluara"} (${past.length})`}
            >
              <div className="flex flex-col gap-6">
                {pastGroups.map(([dateKey, dayAppts]) => (
                  <DaySection
                    key={dateKey}
                    dateKey={dateKey}
                    appointments={dayAppts}
                    showActions={false}
                  />
                ))}
              </div>
            </PastAppointmentsCollapsible>
          )}
        </>
      )}
    </div>
  );
}
