import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { DoctorCard } from "@/components/doctor-card";
import { SpecialtyChip } from "@/components/specialty-chip";
import { searchDoctors, getSpecialties } from "@/lib/queries/doctors";
import { emojiFor } from "@/lib/specialty-emoji";
import { EmptyState } from "@/components/empty-state";

export default async function DoctorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; specialty?: string; city?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations();
  const activeLocale = await getLocale();

  const [doctors, specialties] = await Promise.all([
    searchDoctors({ q: sp.q, specialty: sp.specialty, city: sp.city }, activeLocale),
    getSpecialties(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("search.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("search.resultsCount", { count: doctors.length })}
        </p>
      </div>

      {/* Specialty filter chips */}
      <div className="flex flex-wrap gap-2">
        <SpecialtyChip
          label={activeLocale === "en" ? "All" : "Të gjitha"}
          href="/doctors"
          active={!sp.specialty}
        />
        {specialties.map((s) => (
          <SpecialtyChip
            key={s.id}
            label={activeLocale === "en" ? s.name_en : s.name_sq}
            emoji={emojiFor(s.slug)}
            href={`/doctors?specialty=${s.slug}`}
            active={sp.specialty === s.slug}
          />
        ))}
      </div>

      {doctors.length === 0 ? (
        <EmptyState title={t("search.noResults")} icon="SearchX" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => (
            <DoctorCard key={d.slug} doctor={d} />
          ))}
        </div>
      )}
    </div>
  );
}
