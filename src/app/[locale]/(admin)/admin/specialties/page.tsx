import { getLocale, setRequestLocale } from "next-intl/server";
import { getSpecialties } from "@/lib/queries/doctors";
import { SpecialtiesManager } from "@/components/specialties-manager";

export default async function AdminSpecialtiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const specialties = await getSpecialties();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {activeLocale === "en" ? "Specialties" : "Specialitetet"}
      </h1>
      <SpecialtiesManager
        initial={specialties.map((s) => ({
          slug: s.slug,
          nameEn: s.name_en,
          nameSq: s.name_sq,
        }))}
      />
    </div>
  );
}
