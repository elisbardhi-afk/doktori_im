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

interface BlockGroup {
  ids: string[];
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

function isNextDay(date: string, next: string): boolean {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10) === next;
}

function groupExceptions(exceptions: BlockException[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const ex of exceptions) {
    const last = groups[groups.length - 1];
    const canMerge =
      last !== undefined &&
      isNextDay(last.endDate, ex.date) &&
      last.startTime === ex.startTime &&
      last.endTime === ex.endTime &&
      (last.reason ?? null) === (ex.reason ?? null);
    if (canMerge) {
      last.ids.push(ex.id);
      last.endDate = ex.date;
    } else {
      groups.push({
        ids: [ex.id],
        startDate: ex.date,
        endDate: ex.date,
        startTime: ex.startTime,
        endTime: ex.endTime,
        reason: ex.reason,
      });
    }
  }
  return groups;
}

function formatDateLabel(startDate: string, endDate: string, locale: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(
      locale === "sq" ? "sq-AL" : "en-US",
      { month: "short", day: "numeric" }
    );
  return startDate === endDate
    ? fmt(startDate)
    : `${fmt(startDate)} – ${fmt(endDate)}`;
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
  const [conflictInfo, setConflictInfo] = useState<{
    existingRule: Rule;
    mergedStart: string;
    mergedEnd: string;
  } | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockDate, setBlockDate] = useState("");
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("17:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockEndDate, setBlockEndDate] = useState("");
  const [blockDateError, setBlockDateError] = useState("");

  const days = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_SQ;

  const rulesByDay = ALL_WEEKDAYS.reduce<Record<number, Rule[]>>((acc, d) => {
    acc[d] = rules.filter((r) => r.weekday === d);
    return acc;
  }, {} as Record<number, Rule[]>);

  function openAdd(weekday: number) {
    setAddingFor(weekday);
    setStartTime("09:00");
    setEndTime("13:00");
    setConflictInfo(null);
  }

  async function onAdd(weekday: number) {
    // Client-side overlap check before hitting the server.
    const dayRules = rulesByDay[weekday];
    for (const rule of dayRules) {
      if (startTime < rule.endTime && endTime > rule.startTime) {
        const mergedStart = startTime < rule.startTime ? startTime : rule.startTime;
        const mergedEnd = endTime > rule.endTime ? endTime : rule.endTime;
        setConflictInfo({ existingRule: rule, mergedStart, mergedEnd });
        return;
      }
    }

    setSavingDay(weekday);
    const res = await addAvailabilityRule({ weekday, startTime, endTime });
    setSavingDay(null);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    toast.success(t("common.saved"));
    setAddingFor(null);
    setConflictInfo(null);
    router.refresh();
  }

  async function onAcceptMerge(weekday: number) {
    if (!conflictInfo) return;
    setSavingDay(weekday);
    // Insert the merged rule first (excluding the rule being replaced from the
    // overlap scan). If the merged range collides with a SECOND existing slot
    // the server returns an error here and the old rule is left intact.
    const addRes = await addAvailabilityRule({
      weekday,
      startTime: conflictInfo.mergedStart,
      endTime: conflictInfo.mergedEnd,
      excludeId: conflictInfo.existingRule.id,
    });
    if (!addRes.ok) {
      setSavingDay(null);
      toast.error(addRes.error ?? "Error");
      return;
    }
    // Insert succeeded — now safe to remove the superseded rule.
    const delRes = await deleteAvailabilityRule(conflictInfo.existingRule.id);
    setSavingDay(null);
    if (!delRes.ok) { toast.error(delRes.error ?? "Error"); return; }
    toast.success(t("common.saved"));
    setAddingFor(null);
    setConflictInfo(null);
    router.refresh();
  }

  async function onDelete(id: string) {
    const res = await deleteAvailabilityRule(id);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    router.refresh();
  }

  async function onAddBlock(e: React.FormEvent) {
    e.preventDefault();
    if (blockEndDate && blockEndDate < blockDate) {
      setBlockDateError(
        locale === "en"
          ? "End date must be on or after start date"
          : "Data e mbarimit duhet të jetë pas datës së fillimit"
      );
      return;
    }
    setBlockDateError("");
    setBlockLoading(true);
    const res = await addBlockException({
      date: blockDate,
      endDate: blockEndDate || undefined,
      startTime: blockAllDay ? undefined : blockStart,
      endTime: blockAllDay ? undefined : blockEnd,
      reason: blockReason || undefined,
    });
    setBlockLoading(false);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    toast.success(t("common.saved"));
    setBlockDate("");
    setBlockEndDate("");
    setBlockReason("");
    router.refresh();
  }

  async function onDeleteBlockGroup(ids: string[]) {
    const results = await Promise.all(ids.map((id) => deleteBlockException(id)));
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) { toast.error(failed[0].error ?? "Error"); }
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
                  <div className="ml-28 flex flex-col gap-2 rounded-xl border border-primary bg-muted/20 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">{t("availability.from")}</Label>
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => { setStartTime(e.target.value); setConflictInfo(null); }}
                          className="h-8 w-28 text-sm"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">{t("availability.to")}</Label>
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => { setEndTime(e.target.value); setConflictInfo(null); }}
                          className="h-8 w-28 text-sm"
                          required
                        />
                      </div>
                      <Button size="sm" onClick={() => onAdd(d)} disabled={isSaving}>
                        {isSaving ? t("common.loading") : t("availability.add")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAddingFor(null); setConflictInfo(null); }}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                    {conflictInfo && (
                      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <p>
                          {locale === "en"
                            ? `New slot ${startTime}–${endTime} overlaps with ${conflictInfo.existingRule.startTime}–${conflictInfo.existingRule.endTime}. Merge to ${conflictInfo.mergedStart}–${conflictInfo.mergedEnd}?`
                            : `Orari i ri ${startTime}–${endTime} mbivendoset me ${conflictInfo.existingRule.startTime}–${conflictInfo.existingRule.endTime}. Bashko në ${conflictInfo.mergedStart}–${conflictInfo.mergedEnd}?`}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive/50 text-destructive hover:bg-destructive/10"
                            onClick={() => onAcceptMerge(d)}
                            disabled={isSaving}
                          >
                            {locale === "en"
                              ? `Use ${conflictInfo.mergedStart}–${conflictInfo.mergedEnd}`
                              : `Përdor ${conflictInfo.mergedStart}–${conflictInfo.mergedEnd}`}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConflictInfo(null)}
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}
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
              groupExceptions(exceptions).map((group) => (
                <div
                  key={group.ids[0]}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatDateLabel(group.startDate, group.endDate, locale)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {group.startTime && group.endTime
                        ? `${group.startTime}–${group.endTime}`
                        : locale === "en" ? "All day" : "E gjithë dita"}
                      {group.reason ? ` · ${group.reason}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteBlockGroup(group.ids)}
                    aria-label={t("common.delete")}
                  >
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
                  {locale === "en" ? "Start date" : "Data e fillimit"}
                </Label>
                <Input
                  id="block-date"
                  type="date"
                  value={blockDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { setBlockDate(e.target.value); setBlockDateError(""); }}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-end-date">
                  {locale === "en" ? "End date (optional)" : "Data e mbarimit (opsionale)"}
                </Label>
                <Input
                  id="block-end-date"
                  type="date"
                  value={blockEndDate}
                  min={blockDate || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { setBlockEndDate(e.target.value); setBlockDateError(""); }}
                />
                {blockDateError && (
                  <p className="text-xs text-destructive">{blockDateError}</p>
                )}
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
