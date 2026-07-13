"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";

const ALBANIAN_CITIES = [
  "Tiranë", "Durrës", "Vlorë", "Shkodër", "Elbasan", "Fier", "Korçë",
  "Berat", "Lushnjë", "Kavajë", "Gjirokastër", "Sarandë", "Lezhë", "Kukës",
  "Peshkopi", "Pogradec", "Laç", "Krujë", "Rrogozhinë", "Patos", "Cërrik",
  "Burrel", "Gramsh", "Librazhd", "Përmet", "Tepelenë", "Ersekë",
  "Bajram Curri", "Has", "Bulqizë", "Dibër", "Mallakastër",
];

const SPECIALTY_SUGGESTIONS = [
  "Mjek i Përgjithshëm", "General Practitioner",
  "Pediatri", "Pediatrics",
  "Kardiologji", "Cardiology",
  "Dermatologji", "Dermatology",
  "Stomatologji", "Dentistry",
  "Gjinekologji", "Gynecology",
  "Ortopedi", "Orthopedics",
  "Oftalmologji", "Ophthalmology",
  "ORL", "ENT",
  "Neurologji", "Neurology",
  "Psikiatri", "Psychiatry",
  "Psikologji", "Psychology",
  "Endokrinologji", "Endocrinology",
  "Gastroenterologji", "Gastroenterology",
  "Urologji", "Urology",
  "Pulmonologji", "Pulmonology",
  "Reumatologji", "Rheumatology",
  "Fizioterapi", "Physiotherapy",
];

export function HeroSearch() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    // Check localStorage for preferred city first
    const preferredCity = localStorage.getItem("preferredCity");
    if (preferredCity) {
      setCity(preferredCity);
      return;
    }

    // Fetch city from user profile if not in localStorage
    const fetchUserCity = async () => {
      try {
        const response = await fetch("/api/user/profile", {
          method: "GET",
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          if (data.city) {
            setCity(data.city);
            localStorage.setItem("preferredCity", data.city);
          }
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      }
    };

    fetchUserCity();
  }, []);

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
      <datalist id="specialty-suggestions">
        {SPECIALTY_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="city-suggestions">
        {ALBANIAN_CITIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="flex flex-1 items-center gap-2 rounded-xl bg-primary-tint px-3">
        <Search className="size-5 shrink-0 text-primary" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchSpecialty")}
          list="specialty-suggestions"
          className="border-0 bg-transparent shadow-none focus-visible:shadow-none"
        />
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-primary-tint px-3 sm:w-48">
        <MapPin className="size-5 shrink-0 text-primary" />
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t("searchCity")}
          list="city-suggestions"
          className="border-0 bg-transparent shadow-none focus-visible:shadow-none"
        />
      </div>
      <Button type="submit" size="lg" className="shrink-0">
        {tc("search")}
      </Button>
    </form>
  );
}
