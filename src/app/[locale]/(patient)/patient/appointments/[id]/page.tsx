import { redirect } from "next/navigation";
import { getLocale, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getMyAppointments } from "@/lib/queries/appointments";
import { AppointmentEditClient } from "./appointment-edit-client";

export default async function AppointmentEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [activeLocale, user] = await Promise.all([
    getLocale(),
    getCurrentUser(),
  ]);

  // Redirect to login if not authenticated
  if (!user) {
    redirect("/login");
  }

  // Fetch appointments for current user
  const appointments = await getMyAppointments("patient", activeLocale);

  // Find the appointment by id
  const appointment = appointments.find((a) => a.id === id);

  // Redirect to appointments list if not found
  if (!appointment) {
    redirect("/patient/appointments");
  }

  // Calculate isUpcoming: startsAt > now AND status in [confirmed, pending]
  const now = new Date();
  const startsAt = new Date(appointment.startsAt);
  const isUpcoming =
    startsAt > now &&
    (appointment.status === "confirmed" || appointment.status === "pending");

  return (
    <AppointmentEditClient
      appointment={appointment}
      isUpcoming={isUpcoming}
      currentUserId={user.id}
    />
  );
}
