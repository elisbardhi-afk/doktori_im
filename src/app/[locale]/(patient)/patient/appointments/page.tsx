import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getMyAppointments } from "@/lib/queries/appointments";
import { PatientCalendar, type CalendarView } from "@/components/patient-calendar";
import { formatInTirane } from "@/lib/datetime";
import { getCurrentUser } from "@/lib/auth";

function getRange(view: string, date: Date): { from: string; to: string } {
  if (view === "day") {
    const d = formatInTirane(date.toISOString(), "yyyy-MM-dd");
    return { from: d, to: d };
  }
  if (view === "week") {
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(date);
    mon.setDate(date.getDate() + diff);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
      from: formatInTirane(mon.toISOString(), "yyyy-MM-dd"),
      to: formatInTirane(sun.toISOString(), "yyyy-MM-dd"),
    };
  }
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDay = first.getDay();
  const diff = firstDay === 0 ? -6 : 1 - firstDay;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() + diff);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 41);
  return {
    from: formatInTirane(gridStart.toISOString(), "yyyy-MM-dd"),
    to: formatInTirane(gridEnd.toISOString(), "yyyy-MM-dd"),
  };
}

export default async function PatientCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return <div>{t("common.unauthorized")}</div>;
  }

  const sp = await searchParams;
  const view = (sp.view ?? "month") as CalendarView;
  const today = new Date();
  const dateStr = sp.date ?? formatInTirane(today.toISOString(), "yyyy-MM-dd");
  const date = new Date(dateStr + "T12:00:00");

  const { from, to } = getRange(view, date);

  const allAppointments = await getMyAppointments("patient", activeLocale, from + "T00:00:00Z", to + "T23:59:59Z");
  const appointments = allAppointments.filter((a) => a.status !== "cancelled");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.calendar")}</h1>
      <PatientCalendar
        view={view}
        dateStr={dateStr}
        appointments={appointments}
        currentUserId={currentUser.id}
      />
    </div>
  );
}
