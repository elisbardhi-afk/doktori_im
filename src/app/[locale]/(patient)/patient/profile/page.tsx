import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { PatientProfileForm } from "@/components/patient-profile-form";

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");
  const activeLocale = await getLocale();
  const user = await getCurrentUser();

  if (!user) {
    redirect({ href: "/login", locale: activeLocale });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <PatientProfileForm initialData={user!} />
    </div>
  );
}
