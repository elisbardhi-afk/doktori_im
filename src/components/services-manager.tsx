"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { addDoctorService, deleteDoctorService } from "@/actions/services";
import { Trash2, Plus } from "lucide-react";
import type { DoctorServiceRow } from "@/lib/database.types";

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120];

export function ServicesManager({ services }: { services: DoctorServiceRow[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState("");

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await addDoctorService({
      name,
      durationMinutes: duration,
      price: price !== "" ? Number(price) : undefined,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    setName("");
    setPrice("");
    setDuration(30);
    router.refresh();
  }

  async function onDelete(id: string) {
    const res = await deleteDoctorService(id);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Current services */}
      <Card>
        <CardHeader>
          <CardTitle>{t("services.myServices")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("services.noServices")}</p>
          ) : (
            services.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-foreground">{s.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {s.duration_minutes} {t("services.min")}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {s.price != null ? `${s.price} ALL` : t("services.free")}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(s.id)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add service */}
      <Card>
        <CardHeader>
          <CardTitle>{t("services.addService")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-name">{t("services.name")}</Label>
              <Input
                id="svc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-duration">{t("services.duration")}</Label>
              <select
                id="svc-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-11 rounded-xl border border-input bg-background px-4 text-sm shadow-soft focus-visible:border-primary focus-visible:outline-none"
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} {t("services.min")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-price">{t("services.price")}</Label>
              <Input
                id="svc-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t("services.free")}
              />
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="size-4" />
              {loading ? t("common.loading") : t("services.addService")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
