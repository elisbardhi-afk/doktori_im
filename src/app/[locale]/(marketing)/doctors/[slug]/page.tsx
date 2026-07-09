import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  getDoctorBySlug,
  getDoctorReviews,
  getDoctorSlots,
} from "@/lib/queries/doctor-profile";
import { getDoctorServices } from "@/lib/queries/services";
import { getCurrentUser } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Rating } from "@/components/rating";
import { Badge } from "@/components/ui/badge";
import { BookingWizard } from "@/components/booking-wizard";
import { formatInTirane } from "@/lib/datetime";
import { MapPin, Languages as LangIcon } from "lucide-react";

function initials(name: string) {
  return name.replace(/^Dr\.?\s*/i, "").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();

  const doctor = await getDoctorBySlug(slug, activeLocale);
  if (!doctor) notFound();

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 21 * 86400000).toISOString().slice(0, 10);

  const [reviews, slots, user, services] = await Promise.all([
    getDoctorReviews(doctor.userId),
    getDoctorSlots(doctor.userId, from, to),
    getCurrentUser(),
    getDoctorServices(doctor.userId),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: profile + reviews */}
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
            <Avatar className="size-20">
              {doctor.photoUrl && <AvatarImage src={doctor.photoUrl} alt={doctor.fullName} />}
              <AvatarFallback>{initials(doctor.fullName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">{doctor.fullName}</h1>
              <p className="font-semibold text-primary">
                {doctor.specialties.join(" · ")}
              </p>
              <div className="mt-2">
                <Rating value={doctor.avgRating} count={doctor.reviewCount} size="md" />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
                {doctor.clinicName && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {doctor.clinicAddress
                      ? `${doctor.clinicName}, ${doctor.clinicAddress}, ${doctor.city}`
                      : `${doctor.clinicName}, ${doctor.city}`}
                  </span>
                )}
                {doctor.languages.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <LangIcon className="size-4" />
                    {doctor.languages.map((l) => l.toUpperCase()).join(", ")}
                  </span>
                )}
              </div>
              {doctor.consultationFee != null && (
                <Badge className="mt-3">
                  {t("doctor.consultationFee")}: {doctor.consultationFee.toLocaleString(activeLocale)} L
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {doctor.bio && (
          <Card>
            <CardHeader>
              <CardTitle>{t("doctor.about")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{doctor.bio}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {t("doctor.reviews")} ({doctor.reviewCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("doctor.noReviews")}</p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="border-b border-border/60 pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      {r.patientName}
                    </span>
                    <Rating value={r.rating} />
                  </div>
                  {r.comment && (
                    <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatInTirane(r.createdAt, "d MMM yyyy")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: booking */}
      <div className="lg:col-span-1">
        <Card className="lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>{t("doctor.bookAppointment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingWizard
              doctorId={doctor.userId}
              doctorName={doctor.fullName}
              slots={slots}
              isAuthed={!!user}
              services={services}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
