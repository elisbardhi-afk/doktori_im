import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Rating } from "@/components/rating";
import { Button } from "@/components/ui/button";
import { MapPin, Clock } from "lucide-react";
import { timeInTirane } from "@/lib/datetime";

export interface DoctorCardData {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  city: string | null;
  clinicName: string | null;
  avgRating: number;
  reviewCount: number;
  consultationFee: number | null;
  specialties: string[]; // localized names
  nextSlot: string | null; // ISO instant
}

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function DoctorCard({ doctor }: { doctor: DoctorCardData }) {
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <Card className="flex flex-col gap-4 p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-start gap-4">
        <Avatar className="size-16">
          {doctor.photoUrl && <AvatarImage src={doctor.photoUrl} alt={doctor.fullName} />}
          <AvatarFallback>{initials(doctor.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-foreground">
            {doctor.fullName}
          </h3>
          <p className="truncate text-sm font-semibold text-primary">
            {doctor.specialties.join(" · ") || "—"}
          </p>
          <div className="mt-1">
            <Rating value={doctor.avgRating} count={doctor.reviewCount} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {doctor.city && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" />
            {doctor.clinicName ? `${doctor.clinicName}, ${doctor.city}` : doctor.city}
          </span>
        )}
        {doctor.nextSlot && (
          <span className="flex items-center gap-1.5 font-semibold text-success">
            <Clock className="size-4" />
            {t("search.nextAvailable")}: {timeInTirane(doctor.nextSlot)}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <Button asChild size="sm" className="ml-auto">
          <Link href={`/doctors/${doctor.slug}`}>{t("common.book")}</Link>
        </Button>
      </div>
    </Card>
  );
}
