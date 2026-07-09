import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getMyAppointments } from "@/lib/queries/appointments";
import { AppointmentCard } from "@/components/appointment-card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { dateInTirane } from "@/lib/datetime";
import { Clock, AlertCircle } from "lucide-react";

export default async function DoctorDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();
  const { user, status } = await requireDoctor();
  const appts = await getMyAppointments("doctor", activeLocale);

  const todayStr = dateInTirane(new Date());
  const today = appts.filter((a) => dateInTirane(a.startsAt) === todayStr);
  const upcoming = appts.filter(
    (a) => new Date(a.startsAt) > new Date() && a.status === "confirmed",
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {activeLocale === "en" ? "Welcome" : "Mirë se erdhët"}, {user.full_name}
        </h1>
      </div>

      {/* Approval status banner */}
      {status !== "approved" && (
        <Card
          className={
            status === "suspended"
              ? "border-destructive/40 bg-destructive/5"
              : "border-warning/40 bg-warning/5"
          }
        >
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle
              className={status === "suspended" ? "size-5 text-destructive" : "size-5 text-warning-foreground"}
            />
            <p className="text-sm font-semibold text-foreground">
              {status === "suspended" ? t("roles.suspended") : t("roles.pendingApproval")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={activeLocale === "en" ? "Today" : "Sot"}
          value={today.length}
          icon="CalendarDays"
        />
        <StatCard
          label={t("appointments.upcoming")}
          value={upcoming.length}
          icon="CalendarClock"
        />
        <StatCard
          label={activeLocale === "en" ? "Total" : "Gjithsej"}
          value={appts.length}
          icon="Users"
        />
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
          <Clock className="size-5 text-primary" />
          {activeLocale === "en" ? "Today's schedule" : "Orari i sotëm"}
        </h2>
        {today.length === 0 ? (
          <EmptyState
            title={activeLocale === "en" ? "No appointments today" : "Asnjë takim sot"}
            icon="CalendarCheck"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {today.map((a) => (
              <AppointmentCard key={a.id} appt={a} perspective="doctor" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
