import { redirect } from "next/navigation";
import { getLocale, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getMyAppointments } from "@/lib/queries/appointments";
import { getTranslations } from "next-intl/server";
import { BackButton } from "@/components/back-button";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/appointment-actions";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatInTirane, timeInTirane } from "@/lib/datetime";
import { Calendar, Clock, Phone, MapPin } from "lucide-react";

export default async function DoctorAppointmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [activeLocale, t, { user }] = await Promise.all([
    getLocale(),
    getTranslations(),
    requireDoctor(),
  ]);

  const appointments = await getMyAppointments("doctor", activeLocale, undefined, undefined, user.id);
  const appointment = appointments.find((a) => a.id === id);

  if (!appointment) {
    redirect("/doctor/appointments");
  }

  const patientInitials = appointment.patientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <BackButton label={t("common.back")} />
        <h1 className="text-2xl font-bold text-foreground">
          {t("appointments.viewDetails")}
        </h1>
      </div>

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-3">
            {/* Patient info */}
            <div className="flex items-center gap-3">
              <Avatar className="size-12 rounded-full">
                {appointment.patientAvatarUrl && (
                  <AvatarImage src={appointment.patientAvatarUrl} alt={appointment.patientName} />
                )}
                <AvatarFallback className="rounded-full">{patientInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-bold text-foreground">{appointment.patientName}</p>
                {appointment.patientPhone && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="size-3.5" />
                    <span>{appointment.patientPhone}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-4" />
              {formatInTirane(appointment.startsAt, "EEEE, d MMM yyyy", undefined)}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              {timeInTirane(appointment.startsAt)} – {timeInTirane(appointment.endsAt)}
            </div>
            {(appointment.patientAddress || appointment.patientCity) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                <span>
                  {[appointment.patientAddress, appointment.patientCity, appointment.patientPostalCode]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {appointment.reason && (
          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold text-muted-foreground">
              {t("appointments.reason")}
            </p>
            <p className="mt-1 text-sm text-foreground">{appointment.reason}</p>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <AppointmentActions appointmentId={appointment.id} status={appointment.status} />
        </div>
      </Card>
    </div>
  );
}
