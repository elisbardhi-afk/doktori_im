"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpecialtyChip } from "@/components/specialty-chip";
import { createSpecialty } from "@/actions/specialties";
import { emojiFor } from "@/lib/specialty-emoji";
import { Plus } from "lucide-react";

interface SpecialtyItem {
  slug: string;
  nameEn: string;
  nameSq: string;
}

export function SpecialtiesManager({ initial }: { initial: SpecialtyItem[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ slug: "", nameEn: "", nameSq: "", iconSlug: "stethoscope" });
  const L = (en: string, sq: string) => (locale === "en" ? en : sq);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await createSpecialty(form);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Error");
      return;
    }
    toast.success(t("common.saved"));
    setForm({ slug: "", nameEn: "", nameSq: "", iconSlug: "stethoscope" });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{L("All specialties", "Të gjitha specialitetet")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {initial.map((s) => (
              <SpecialtyChip
                key={s.slug}
                label={locale === "en" ? s.nameEn : s.nameSq}
                emoji={emojiFor(s.slug)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{L("Add specialty", "Shto specialitet")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="e.g. allergology"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nameEn">{L("Name (English)", "Emri (Anglisht)")}</Label>
              <Input
                id="nameEn"
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nameSq">{L("Name (Albanian)", "Emri (Shqip)")}</Label>
              <Input
                id="nameSq"
                value={form.nameSq}
                onChange={(e) => setForm({ ...form, nameSq: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="size-4" />
              {loading ? "..." : L("Add", "Shto")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
