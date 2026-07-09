"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";

export function HeroSearch() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    router.push(`/doctors?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full flex-col gap-2 rounded-2xl bg-card p-2 shadow-lift sm:flex-row"
    >
      <div className="flex flex-1 items-center gap-2 rounded-xl bg-primary-tint px-3">
        <Search className="size-5 shrink-0 text-primary" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchSpecialty")}
          className="border-0 bg-transparent shadow-none focus-visible:shadow-none"
        />
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-primary-tint px-3 sm:w-48">
        <MapPin className="size-5 shrink-0 text-primary" />
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t("searchCity")}
          className="border-0 bg-transparent shadow-none focus-visible:shadow-none"
        />
      </div>
      <Button type="submit" size="lg" className="shrink-0">
        {tc("search")}
      </Button>
    </form>
  );
}
