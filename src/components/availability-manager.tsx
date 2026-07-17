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

export function AvailabilityManager({ rules, exceptions }: { rules: Rule[]; exceptions: BlockException[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [blockDate, setBlockDate] = useState("");
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("17:00");
  const [blockReason, setBlockReason] = useState("");

  const days = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_SQ;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await addAvailabilityRule({ weekday, startTime, endTime });
    setLoading(false);
    if (!res.ok) { toast.error(res.error ?? "Error"); return; }
    toast.success(t("common.saved"));
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly schedule */}
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
                    <p className="text-sm text-muted-foreground">{r.startTime}–{r.endTime}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} aria-label={t("common.delete")}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Add hours */}
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
              <Button type="submit" disabled={loading}>
                <Plus className="size-4" />
                {loading ? t("common.loading") : t("availability.add")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

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
