"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cancelWaitlistEntry, claimWaitlistSlot } from "@/actions/waitlist";
import type { WaitlistEntry } from "@/actions/waitlist";
import { formatInTirane } from "@/lib/datetime";

function formatExpiry(claimExpiresAt: string): { hours: string; minutes: string } {
  const diff = new Date(claimExpiresAt).getTime() - Date.now();
  if (diff <= 0) return { hours: "0", minutes: "0" };
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours: String(hours), minutes: String(minutes) };
}


export function WaitlistEntries({ entries }: { entries: WaitlistEntry[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const visible = entries.filter((e) => !dismissedIds.has(e.id));
  const offers = visible.filter((e) => e.status === "notified");
  const watching = visible.filter((e) => e.status === "active");

  async function handleAccept(entry: WaitlistEntry) {
    // offered_starts_at is the exact freed slot time (set by the trigger since migration 0020).
    // Fall back to notified_at for entries notified before that migration.
    const newStartsAt = (entry.offered_starts_at ?? entry.notified_at)
      ? new Date((entry.offered_starts_at ?? entry.notified_at)!).toISOString()
      : new Date().toISOString();

    setLoadingId(entry.id);
    const res = await claimWaitlistSlot(entry.id, newStartsAt);
    setLoadingId(null);

    if (!res.ok) {
      const msgKey =
        res.error === "CLAIM_EXPIRED"
          ? "waitlist.errClaimExpired"
          : res.error === "SLOT_TAKEN"
          ? "waitlist.errSlotTaken"
          : "waitlist.errUnknown";
      toast.error(t(msgKey));
      return;
    }
    toast.success(t("waitlist.acceptSuccess"));
    setDismissedIds((prev) => new Set(Array.from(prev).concat(entry.id)));
    router.push("/patient/appointments");
  }

  async function handleDecline(entry: WaitlistEntry) {
    setLoadingId(entry.id);
    const res = await cancelWaitlistEntry(entry.id);
    setLoadingId(null);
    if (!res.ok) {
      toast.error(t("waitlist.errUnknown"));
      return;
    }
    setDismissedIds((prev) => new Set(Array.from(prev).concat(entry.id)));
  }

  async function handleRemove(entry: WaitlistEntry) {
    setLoadingId(entry.id);
    const res = await cancelWaitlistEntry(entry.id);
    setLoadingId(null);
    if (!res.ok) {
      toast.error(t("waitlist.errUnknown"));
      return;
    }
    setDismissedIds((prev) => new Set(Array.from(prev).concat(entry.id)));
  }

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("waitlist.empty")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {offers.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("waitlist.offers")}</h2>
          {offers.map((entry) => (
            <Card key={entry.id} className="border-primary/40 bg-primary-tint">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-foreground">{entry.doctorName}</p>
                    {entry.serviceName && (
                      <p className="text-sm text-muted-foreground">{entry.serviceName}</p>
                    )}
                    {entry.offered_starts_at ? (
                      <>
                        {entry.appointmentStartsAt && (
                          <p className="text-sm text-muted-foreground line-through">
                            {formatInTirane(entry.appointmentStartsAt)}
                            {entry.appointmentEndsAt && (
                              <> – {formatInTirane(entry.appointmentEndsAt, "HH:mm")}</>
                            )}
                          </p>
                        )}
                        <p className="text-sm font-semibold text-foreground">
                          {formatInTirane(entry.offered_starts_at)}
                          {entry.offered_ends_at && (
                            <> – {formatInTirane(entry.offered_ends_at, "HH:mm")}</>
                          )}
                        </p>
                      </>
                    ) : entry.appointmentStartsAt && (
                      <p className="text-sm text-muted-foreground">
                        {formatInTirane(entry.appointmentStartsAt)}
                        {entry.appointmentEndsAt && (
                          <> – {formatInTirane(entry.appointmentEndsAt, "HH:mm")}</>
                        )}
                      </p>
                    )}
                    {entry.appointmentReason && (
                      <p className="text-sm text-muted-foreground">{entry.appointmentReason}</p>
                    )}
                  </div>
                  {entry.claim_expires_at && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {t("waitlist.expiresIn", formatExpiry(entry.claim_expires_at))}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAccept(entry)}
                    disabled={loadingId === entry.id}
                  >
                    {t("waitlist.accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDecline(entry)}
                    disabled={loadingId === entry.id}
                  >
                    {t("waitlist.decline")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {watching.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("waitlist.watching")}</h2>
          {watching.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-foreground">{entry.doctorName}</p>
                  {entry.serviceName && (
                    <p className="text-sm text-muted-foreground">{entry.serviceName}</p>
                  )}
                  {entry.appointmentStartsAt && (
                    <p className="text-sm text-muted-foreground">
                      {formatInTirane(entry.appointmentStartsAt)}
                      {entry.appointmentEndsAt && (
                        <> – {formatInTirane(entry.appointmentEndsAt, "HH:mm")}</>
                      )}
                    </p>
                  )}
                  {entry.appointmentReason && (
                    <p className="text-sm text-muted-foreground">{entry.appointmentReason}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(entry)}
                  disabled={loadingId === entry.id}
                >
                  {t("waitlist.remove")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
