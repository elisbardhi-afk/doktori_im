"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDoctorProfile } from "@/actions/doctor-profile";

interface Props {
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationFee: number | null;
}

export function DoctorProfileEditor(initial: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(initial);
  const L = (en: string, sq: string) => (locale === "en" ? en : sq);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await updateDoctorProfile({
      bio: form.bio,
      clinicName: form.clinicName,
      clinicAddress: form.clinicAddress,
      city: form.city,
      consultationFee: form.consultationFee,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">{L("Bio", "Përshkrimi")}</Label>
        <Textarea
          id="bio"
          rows={4}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clinic">{L("Clinic name", "Emri i klinikës")}</Label>
          <Input
            id="clinic"
            value={form.clinicName}
            onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">{L("City", "Qyteti")}</Label>
          <Input
            id="city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">{L("Clinic address", "Adresa e klinikës")}</Label>
        <Input
          id="address"
          value={form.clinicAddress}
          onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fee">{L("Consultation fee (L)", "Tarifa e konsultës (L)")}</Label>
        <Input
          id="fee"
          type="number"
          min={0}
          value={form.consultationFee ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              consultationFee: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
      </div>
      <Button type="submit" disabled={loading} className="self-start">
        {loading ? "..." : L("Save", "Ruaj")}
      </Button>
    </form>
  );
}
