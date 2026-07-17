import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityManager } from "@/components/availability-manager";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import type { AvailabilityRuleRow, AvailabilityExceptionRow } from "@/lib/database.types";

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
  const [{ data: rulesData }, { data: exceptionsData }] = await Promise.all([
    supabase.from("availability_rules").select("*").eq("doctor_id", user.id).order("weekday"),
    supabase
      .from("availability_exceptions")
      .select("*")
      .eq("doctor_id", user.id)
      .eq("kind", "block")
      .gte("exception_date", new Date().toISOString().slice(0, 10))
      .order("exception_date"),
  ]);

  const rules = (rulesData ?? []) as AvailabilityRuleRow[];
  const exceptions = (exceptionsData ?? []) as AvailabilityExceptionRow[];

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
        }))}
        exceptions={exceptions.map((e) => ({
          id: e.id,
          date: e.exception_date,
          startTime: e.start_time ?? undefined,
          endTime: e.end_time ?? undefined,
          reason: e.reason ?? undefined,
        }))}
      />
    </div>
  );
}
