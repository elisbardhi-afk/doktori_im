import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getDoctorReviews } from "@/lib/queries/doctor-profile";
import { Rating } from "@/components/rating";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { formatInTirane } from "@/lib/datetime";

export default async function DoctorReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await getLocale();
  const t = await getTranslations();
  const { user } = await requireDoctor();
  const reviews = await getDoctorReviews(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("doctor.reviews")}</h1>
      {reviews.length === 0 ? (
        <EmptyState title={t("doctor.noReviews")} icon="Star" />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-1.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{r.patientName}</span>
                  <Rating value={r.rating} />
                </div>
                {r.comment && (
                  <p className="text-sm text-muted-foreground">{r.comment}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatInTirane(r.createdAt, "d MMM yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
