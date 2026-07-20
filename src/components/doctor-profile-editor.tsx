"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUploader } from "@/components/avatar-uploader";
import { updateDoctorProfile } from "@/actions/doctor-profile";

// All supported language codes + their English label (used for the picker UI).
// Display names come from the translations namespace in the actual locale.
const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: "sq", label: "Albanian" },
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "el", label: "Greek" },
  { code: "sr", label: "Serbian" },
  { code: "hr", label: "Croatian" },
  { code: "mk", label: "Macedonian" },
];

interface Props {
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  languages: string[];
  photoUrl: string | null;
  fullName: string;
}

export function DoctorProfileEditor(initial: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(initial);
  const L = (en: string, sq: string) => (locale === "en" ? en : sq);

  const initials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "Dr";

  function toggleLanguage(code: string) {
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(code)
        ? f.languages.filter((l) => l !== code)
        : [...f.languages, code],
    }));
  }

  // Resolve display name for a language code using translations when available.
  function langLabel(code: string) {
    const key = `languages.${code}` as Parameters<typeof t>[0];
    try {
      const translated = t(key);
      return translated || SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code;
    } catch {
      return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await updateDoctorProfile({
      bio: form.bio,
      clinicName: form.clinicName,
      clinicAddress: form.clinicAddress,
      city: form.city,
      languages: form.languages,
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
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Photo upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{L("Profile photo", "Foto e profilit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarUploader
            currentUrl={form.photoUrl}
            fallbackText={initials(form.fullName)}
            role="doctor"
            onUploaded={(url) => setForm((f) => ({ ...f, photoUrl: url }))}
          />
        </CardContent>
      </Card>

      {/* Other fields */}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

        {/* Languages */}
        <div className="flex flex-col gap-2">
          <Label>{t("doctor.languages")}</Label>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map(({ code }) => {
              const selected = form.languages.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleLanguage(code)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}
                >
                  {langLabel(code)}
                </button>
              );
            })}
          </div>
          {form.languages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {L("Select the languages you speak", "Zgjidhni gjuhët që flisni")}
            </p>
          )}
        </div>

        <Button type="submit" disabled={loading} className="self-start">
          {loading ? "..." : L("Save", "Ruaj")}
        </Button>
      </form>
    </div>
  );
}
