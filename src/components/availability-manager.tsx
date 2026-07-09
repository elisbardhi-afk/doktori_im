"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAvailabilityRule, deleteAvailabilityRule } from "@/actions/availability";
import { Trash2, Plus } from "lucide-react";

interface Rule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

const WEEKDAYS_SQ = ["", "E hënë", "E martë", "E mërkurë", "E enjte", "E premte", "E shtunë", "E diel"];
const WEEKDAYS_EN = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function AvailabilityManager({ rules }: { rules: Rule[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [duration, setDuration] = useState(30);

  const days = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_SQ;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await addAvailabilityRule({
      weekday,
      startTime,
      endTime,
      slotDurationMinutes: duration,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success("✓");
    router.refresh();
  }

  async function onDelete(id: string) {
    const res = await deleteAvailabilityRule(id);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("availability.weeklySchedule")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("availability.noRules")}</p>
          ) : (
            rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
              >
                <div>
                  <p className="font-semibold text-foreground">{days[r.weekday]}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.startTime}–{r.endTime} · {r.slotDurationMinutes} min
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} aria-label={t("common.delete")}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("availability.addHours")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t("availability.day")}</Label>
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                className="h-11 rounded-xl border border-input bg-background px-4 text-sm shadow-soft focus-visible:border-primary focus-visible:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>{days[d]}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start">{t("availability.from")}</Label>
                <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="end">{t("availability.to")}</Label>
                <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dur">{t("availability.slotLength")}</Label>
              <select
                id="dur"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-11 rounded-xl border border-input bg-background px-4 text-sm shadow-soft focus-visible:border-primary focus-visible:outline-none"
              >
                {[15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="size-4" />
              {loading ? t("common.loading") : t("availability.add")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
