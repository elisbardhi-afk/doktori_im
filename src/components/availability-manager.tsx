"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAvailabilityRule, deleteAvailabilityRule, addBlockException, deleteBlockException } from "@/actions/availability";
import { Trash2, Plus, BanIcon } from "lucide-react";

interface Rule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

interface BlockException {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

const WEEKDAYS_SQ = ["", "E hënë", "E martë", "E mërkurë", "E enjte", "E premte", "E shtunë", "E diel"];
const WEEKDAYS_EN = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function AvailabilityManager({ rules, exceptions }: { rules: Rule[]; exceptions: BlockException[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockDate, setBlockDate] = useState("");
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("17:00");
  const [blockReason, setBlockReason] = useState("");

  const days = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_SQ;

  const rulesByDay = ALL_WEEKDAYS.reduce<Record<number, Rule[]>>((acc, d) => {
    acc[d] = rules.filter((r) => r.weekday === d);
    return acc;
  }, {} as Record<number, Rule[]>);

  function openAdd(weekday: number) {
    setAddingFor(weekday);
    setStartTime("09:00");
    setEndTime("13:00");
  }

  async function onAdd(weekday: number) {
    setSavingDay(weekday);
    const res = await addAvailabilityRule({ weekday, startTime, endTime });
    setSavingDay(null);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    toast.success(t("common.saved"));
    setAddingFor(null);
    router.refresh();
  }

  async function onDelete(id: string) {
    const res = await deleteAvailabilityRule(id);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    router.refresh();
  }

  async function onAddBlock(e: React.FormEvent) {
    e.preventDefault();
    setBlockLoading(true);
    const res = await addBlockException({
      date: blockDate,
      startTime: blockAllDay ? undefined : blockStart,
      endTime: blockAllDay ? undefined : blockEnd,
      reason: blockReason || undefined,
    });
    setBlockLoading(false);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    toast.success(t("common.saved"));
    setBlockDate("");
    setBlockReason("");
    router.refresh();
  }

  async function onDeleteBlock(id: string) {
    const res = await deleteBlockException(id);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Weekly schedule — all days visible */}
      <Card>
        <CardHeader>
          <CardTitle>{t("availability.weeklySchedule")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {ALL_WEEKDAYS.map((d) => {
            const dayRules = rulesByDay[d];
            const isAdding = addingFor === d;
            const isSaving = savingDay === d;
            return (
              <div key={d} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground w-28">{days[d]}</span>
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    {dayRules.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {locale === "en" ? "Closed" : "Mbyllur"}
                      </span>
                    ) : (
                      dayRules.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-sm"
                        >
                          <span>{r.startTime}–{r.endTime}</span>
                          <button
                            onClick={() => onDelete(r.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label={t("common.delete")}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {!isAdding && (
                    <button
                      onClick={() => openAdd(d)}
                      className="ml-2 shrink-0 text-primary hover:text-primary/80 transition-colors"
                      aria-label={locale === "en" ? "Add hours" : "Shto orare"}
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
                {isAdding && (
                  <div className="ml-28 flex flex-wrap items-end gap-2 rounded-xl border border-primary bg-muted/20 p-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("availability.from")}</Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="h-8 w-28 text-sm"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("availability.to")}</Label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="h-8 w-28 text-sm"
                        required
                      />
                    </div>
                    <Button size="sm" onClick={() => onAdd(d)} disabled={isSaving}>
                      {isSaving ? t("common.loading") : t("availability.add")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingFor(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Block exceptions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BanIcon className="size-4 text-destructive" />
              {locale === "en" ? "Blocked dates" : "Ditë të bllokuara"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {exceptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {locale === "en" ? "No blocked dates." : "Nuk ka ditë të bllokuara."}
              </p>
            ) : (
              exceptions.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
                >
                  <div>
                    <p className="font-semibold text-foreground">{ex.date}</p>
                    <p className="text-sm text-muted-foreground">
                      {ex.startTime && ex.endTime
                        ? `${ex.startTime}–${ex.endTime}`
                        : locale === "en" ? "All day" : "E gjithë dita"}
                      {ex.reason ? ` · ${ex.reason}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => onDeleteBlock(ex.id)} aria-label={t("common.delete")}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {locale === "en" ? "Block time off" : "Bloko kohë të lirë"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAddBlock} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-date">
                  {locale === "en" ? "Date" : "Data"}
                </Label>
                <Input
                  id="block-date"
                  type="date"
                  value={blockDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setBlockDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="block-allday"
                  checked={blockAllDay}
                  onChange={(e) => setBlockAllDay(e.target.checked)}
                  className="size-4 accent-primary"
                />
                <Label htmlFor="block-allday">
                  {locale === "en" ? "All day" : "E gjithë dita"}
                </Label>
              </div>
              {!blockAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="block-start">{t("availability.from")}</Label>
                    <Input id="block-start" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="block-end">{t("availability.to")}</Label>
                    <Input id="block-end" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} required />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-reason">
                  {locale === "en" ? "Reason (optional)" : "Arsyeja (opsionale)"}
                </Label>
                <Input
                  id="block-reason"
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder={locale === "en" ? "e.g. Vacation" : "p.sh. Pushime"}
                />
              </div>
              <Button type="submit" variant="destructive" disabled={blockLoading}>
                <BanIcon className="size-4" />
                {blockLoading ? t("common.loading") : (locale === "en" ? "Block date" : "Bloko datën")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
