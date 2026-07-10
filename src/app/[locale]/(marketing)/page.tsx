import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HeroSearch } from "@/components/hero-search";
import { getSpecialties } from "@/lib/queries/doctors";
import { emojiFor } from "@/lib/specialty-emoji";
import { Search, CalendarCheck, BellRing } from "lucide-react";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const activeLocale = await getLocale();
  const specialties = await getSpecialties();

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-tint to-background">
        <div className="container flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <h1 className="max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="max-w-xl text-balance text-lg text-muted-foreground">
            {t("heroSubtitle")}
          </p>
          <div className="mt-2 w-full max-w-2xl">
            <HeroSearch />
          </div>
        </div>
      </section>

      {/* Specialty grid */}
      <section className="container py-14">
        <h2 className="mb-6 text-2xl font-bold text-foreground">
          {activeLocale === "en" ? "Browse by specialty" : "Kërko sipas specialitetit"}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {specialties.map((s) => (
            <Link
              key={s.id}
              href={`/doctors?specialty=${s.slug}`}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-soft transition-shadow hover:shadow-lift"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
                {emojiFor(s.slug)}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {activeLocale === "en" ? s.name_en : s.name_sq}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-primary-tint py-14">
        <div className="container">
          <h2 className="mb-8 text-center text-2xl font-bold text-foreground">
            {t("howItWorks")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Search, title: t("step1"), desc: t("step1Desc") },
              { icon: CalendarCheck, title: t("step2"), desc: t("step2Desc") },
              { icon: BellRing, title: t("step3"), desc: t("step3Desc") },
            ].map((step, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center shadow-card"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
                  <step.icon className="size-6" />
                </span>
                <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
