import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getDoctorServices } from "@/lib/queries/services";
import { ServicesManager } from "@/components/services-manager";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const { user, status } = await requireDoctor();

  if (status !== "approved") {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex items-center gap-3 p-4">
          <AlertCircle className="size-5 text-warning-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {t("availability.pendingMessage")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const services = await getDoctorServices(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("services.title")}</h1>
      <ServicesManager services={services} />
    </div>
  );
}
