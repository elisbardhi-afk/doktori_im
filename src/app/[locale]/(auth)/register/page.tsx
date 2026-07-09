import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Stethoscope } from "lucide-react";

export default async function RegisterChoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <Card className="shadow-lift">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.registerTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Link
          href="/register/patient"
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <User className="size-6" />
          </span>
          <div>
            <p className="font-bold text-foreground">{t("auth.asPatient")}</p>
            <p className="text-sm text-muted-foreground">{t("nav.forPatients")}</p>
          </div>
        </Link>
        <Link
          href="/register/doctor"
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Stethoscope className="size-6" />
          </span>
          <div>
            <p className="font-bold text-foreground">{t("auth.asDoctor")}</p>
            <p className="text-sm text-muted-foreground">{t("nav.forDoctors")}</p>
          </div>
        </Link>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            {t("common.login")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
