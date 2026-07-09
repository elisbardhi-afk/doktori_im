"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function RegisterForm({ role }: { role: "patient" | "doctor" }) {
  const t = useTranslations();
  const tc = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    if (!form.get("consent_health") || !form.get("consent_terms")) {
      toast.error(
        t("auth.consentHealth") + " / " + t("auth.consentTerms"),
      );
      return;
    }

    setLoading(true);
    const data: Record<string, string> = {
      full_name: String(form.get("full_name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      role,
    };
    if (role === "doctor") {
      data.license_number = String(form.get("license_number") ?? "");
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: { data },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success(tc("register") + " ✓");
    router.push(role === "doctor" ? "/doctor" : "/patient");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="full_name">{tc("fullName")}</Label>
        <Input id="full_name" name="full_name" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{tc("email")}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">{tc("phone")}</Label>
        <Input id="phone" name="phone" type="tel" placeholder="+355..." />
      </div>
      {role === "doctor" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license_number">{t("auth.licenseNumber")}</Label>
          <Input id="license_number" name="license_number" required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{tc("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="consent_health" className="mt-1 accent-primary" />
        <span>{t("auth.consentHealth")}</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="consent_terms" className="mt-1 accent-primary" />
        <span>{t("auth.consentTerms")}</span>
      </label>

      <Button type="submit" size="lg" disabled={loading}>
        {loading ? tc("loading") : tc("register")}
      </Button>
    </form>
  );
}
