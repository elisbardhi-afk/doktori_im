import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegisterForm } from "@/components/register-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RegisterDoctorPage({
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
        <CardTitle className="text-2xl">{t("auth.asDoctor")}</CardTitle>
      </CardHeader>
      <CardContent>
        <RegisterForm role="doctor" />
      </CardContent>
    </Card>
  );
}
