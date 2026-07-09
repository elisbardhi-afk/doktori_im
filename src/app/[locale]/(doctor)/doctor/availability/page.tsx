import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityManager } from "@/components/availability-manager";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import type { AvailabilityRuleRow } from "@/lib/database.types";

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const { user, status } = await requireDoctor();

  const supabase = createClient();
  const { data } = await supabase
    .from("availability_rules")
    .select("*")
    .eq("doctor_id", user.id)
    .order("weekday");

  const rules = (data ?? []) as AvailabilityRuleRow[];

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("availability.title")}</h1>
      <AvailabilityManager
        rules={rules.map((r) => ({
          id: r.id,
          weekday: r.weekday,
          startTime: r.start_time.slice(0, 5),
          endTime: r.end_time.slice(0, 5),
          slotDurationMinutes: r.slot_duration_minutes,
        }))}
      />
    </div>
  );
}
