# Landing UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the landing page and header UX: city + specialty autocomplete in the hero search, remove the stray Albanian flag badge, show flag emojis in the language switcher, hide nav links for logged-in users, and expand demo seed data.

**Architecture:** Five focused changes across four files, plus a seed script expansion. Tasks 1–4 are pure UI/client-side touches. Task 5 is seed data only (no DB migrations needed — it uses existing tables). Each task is independently reviewable.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, next-intl, Supabase REST API (seed script uses plain fetch).

## Global Constraints

- All user-visible strings must use `t()` from next-intl — no hardcoded UI copy
- No new npm packages
- `npm run build` must pass after every task (zero TypeScript errors)
- Tailwind only — no inline styles
- Albanian (`sq`) is the default locale; English (`en`) is secondary
- No "Co-Authored-By" lines in git commit messages
- Seed script password stays `DoktoriIm123!`
- `seed_users.mjs` uses plain `fetch` (no supabase-js) — keep that pattern

---

### Task 1: City + Specialty Autocomplete in HeroSearch

**Files:**
- Modify: `src/components/hero-search.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: updated `HeroSearch` component with two `<datalist>` elements

**Context:** `hero-search.tsx` is a `"use client"` component with two plain `<Input>` components — specialty (`q`) and city. Both use the shadcn `<Input>` which renders a standard `<input>` element. HTML `<datalist>` + `list=` attribute works directly on native `<input>` elements. The shadcn `<Input>` component passes through all props including `list=`, so this is a pure HTML enhancement — no React state needed beyond what already exists.

- [ ] **Step 1: No test needed** — this is a pure HTML datalist addition. Verify visually after implementation.

- [ ] **Step 2: Replace `src/components/hero-search.tsx` with this complete file:**

```tsx
"use client";

import { useState } from "react";
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
```

- [ ] **Step 3: Verify build passes**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/components/hero-search.tsx
git commit -m "feat: add city and specialty autocomplete to hero search"
```

---

### Task 2: Remove Stray Albanian Flag Badge from Landing Page

**Files:**
- Modify: `src/app/[locale]/(marketing)/page.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: landing page without the `🇦🇱 Shqipëri` badge above the hero title

**Context:** Line 25 of `page.tsx` renders:
```tsx
<span className="rounded-full bg-primary-soft px-4 py-1.5 text-sm font-semibold text-primary">
  🇦🇱 Shqipëri
</span>
```
This is the element crossed out in the screenshot. Remove just this `<span>` element — nothing else.

- [ ] **Step 1: Remove the flag badge span from `src/app/[locale]/(marketing)/page.tsx`**

The hero section `<div className="container flex flex-col items-center gap-6 py-16 text-center sm:py-24">` currently starts with that span. Remove it so the section starts directly with `<h1>`.

The result should be:
```tsx
<div className="container flex flex-col items-center gap-6 py-16 text-center sm:py-24">
  <h1 className="max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
    {t("heroTitle")}
  </h1>
  ...
```

- [ ] **Step 2: Verify build passes**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(marketing)/page.tsx"
git commit -m "fix: remove stray Albanian flag badge from hero section"
```

---

### Task 3: Language Switcher Flags Already Present + Hide Nav When Logged In

**Files:**
- Modify: `src/components/site-header.tsx`

**Interfaces:**
- Consumes: `user` (already computed in `SiteHeader` via `getCurrentUser()`)
- Produces: nav links hidden when `user` is not null

**Context:** 
- `language-switcher.tsx` already shows `🇦🇱 SQ` and `🇬🇧 EN` — **no change needed** there.
- `site-header.tsx` lines 32–39 render the `<nav>` unconditionally. Wrap it with `{!user && ...}` so it only renders for logged-out visitors.

The current nav block:
```tsx
<nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
  <Link href="/doctors" className="transition-colors hover:text-foreground">
    {t("nav.forPatients")}
  </Link>
  <Link href="/register/doctor" className="transition-colors hover:text-foreground">
    {t("nav.forDoctors")}
  </Link>
</nav>
```

Should become:
```tsx
{!user && (
  <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
    <Link href="/doctors" className="transition-colors hover:text-foreground">
      {t("nav.forPatients")}
    </Link>
    <Link href="/register/doctor" className="transition-colors hover:text-foreground">
      {t("nav.forDoctors")}
    </Link>
  </nav>
)}
```

- [ ] **Step 1: Edit `src/components/site-header.tsx`** — wrap the `<nav>` block with `{!user && ( ... )}`

- [ ] **Step 2: Verify build passes**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/components/site-header.tsx
git commit -m "feat: hide For patients/For doctors nav links when user is logged in"
```

---

### Task 4: Expand Demo Seed Data (5 More Doctors + Services)

**Files:**
- Modify: `scripts/seed-users.mjs`

**Interfaces:**
- Consumes: existing `ensureUser`, `patch`, `upsert`, `select` helpers defined at top of file
- Produces: 5 new approved doctors with varied specialties/cities, plus `doctor_services` rows for all 7 approved doctors

**Context:**
- `doctor_services` table has columns: `doctor_id` (uuid), `name` (text), `duration_minutes` (int), `price` (numeric, nullable), `is_active` (bool, default true), `sort_order` (int, default 0)
- Services upsert on `doctor_id,name` conflict key
- Albanian private clinic service norms (researched):
  - General consultation: 15–20 min, 2500–3500 ALL
  - Specialist consultation: 20–30 min, 3000–5000 ALL
  - ECG: 15 min, 1500 ALL
  - Echocardiography: 30 min, 4000 ALL
  - Skin biopsy: 20 min, 3500 ALL
  - Pap smear: 15 min, 2000 ALL
  - Ultrasound (gynecology): 20 min, 3000 ALL
  - Physiotherapy session: 45–60 min, 2000–3000 ALL
  - Dental cleaning: 30 min, 3000 ALL
  - Tooth extraction: 30 min, 4000 ALL
  - Eye exam: 20 min, 2500 ALL
  - Intraocular pressure: 10 min, 1500 ALL
  - Spirometry: 20 min, 2000 ALL
  - Bone density scan: 30 min, 5000 ALL
- The `slot_duration_minutes` column was **removed** from `availability_rules` — do NOT include it in rule inserts

- [ ] **Step 1: Add the 5 new doctor entries and services helper to `scripts/seed-users.mjs`**

Add an `async function upsertServices(doctorId, services)` helper after the existing helpers:

```js
async function upsertServices(doctorId, services) {
  const rows = services.map((s, i) => ({
    doctor_id: doctorId,
    name: s.name,
    duration_minutes: s.duration,
    price: s.price,
    is_active: true,
    sort_order: i,
  }));
  await upsert("doctor_services", rows, "doctor_id,name");
}
```

- [ ] **Step 2: Add 5 new doctors to the `doctors` array** in `main()`:

```js
{
  email: "dr.brahimi@doktori-im.al",
  full_name: "Dr. Olta Brahimi",
  license: "AL-GYN-4004",
  slug: "dr-olta-brahimi",
  bio: "Gjinekologia dhe obstetrika me 12 vjet përvojë. Specializim në Gjermani (2015).",
  city: "Tiranë",
  clinic: "Qendra Gjinekologjike Brahimi",
  fee: 4000,
  specialties: ["gynecology"],
  status: "approved",
  services: [
    { name: "Vizitë gjinekologjike", duration: 30, price: 4000 },
    { name: "Ultratingull gjinekologjik", duration: 20, price: 3000 },
    { name: "Pap smear", duration: 15, price: 2000 },
    { name: "Kolposkopi", duration: 20, price: 3500 },
  ],
},
{
  email: "dr.koci@doktori-im.al",
  full_name: "Dr. Erjon Koçi",
  license: "AL-ORTH-5005",
  slug: "dr-erjon-koci",
  bio: "Ortoped me fokus tek kirurgjia e gjurit dhe kofshës. Anëtar i EFORT.",
  city: "Durrës",
  clinic: "Klinika Ortopedike Koçi",
  fee: 5000,
  specialties: ["orthopedics"],
  status: "approved",
  services: [
    { name: "Vizitë ortopedike", duration: 30, price: 5000 },
    { name: "Injeksion intra-artikular", duration: 20, price: 4000 },
    { name: "Fizioterapi ortopedike", duration: 45, price: 2500 },
    { name: "Raport mjekësor", duration: 15, price: 1500 },
  ],
},
{
  email: "dr.shehu@doktori-im.al",
  full_name: "Dr. Besmir Shehu",
  license: "AL-GP-6006",
  slug: "dr-besmir-shehu",
  bio: "Mjek i përgjithshëm me 20 vjet praktikë. Shërbej komunitetin e Vlorës.",
  city: "Vlorë",
  clinic: "Ambulanca Shehu",
  fee: 2500,
  specialties: ["general-practitioner"],
  status: "approved",
  services: [
    { name: "Vizitë e përgjithshme", duration: 20, price: 2500 },
    { name: "Kontroll rutinë", duration: 15, price: 2000 },
    { name: "Recetë mjekësore", duration: 10, price: 500 },
  ],
},
{
  email: "dr.malaj@doktori-im.al",
  full_name: "Dr. Anila Malaj",
  license: "AL-OPH-7007",
  slug: "dr-anila-malaj",
  bio: "Oftalmologe, specializim në sëmundjet e retinës dhe glaukomën.",
  city: "Shkodër",
  clinic: "Qendra Okuliste Malaj",
  fee: 3500,
  specialties: ["ophthalmology"],
  status: "approved",
  services: [
    { name: "Ekzaminim i syve", duration: 20, price: 3500 },
    { name: "Tonometri (presioni okulare)", duration: 10, price: 1500 },
    { name: "Fundoskopi", duration: 15, price: 2500 },
  ],
},
{
  email: "dr.zajmi@doktori-im.al",
  full_name: "Dr. Flamur Zajmi",
  license: "AL-PULM-8008",
  slug: "dr-flamur-zajmi",
  bio: "Pulmonolog dhe alergolog. Ekspert i sëmundjeve të mushkërive dhe astmës.",
  city: "Elbasan",
  clinic: "Klinika Pulmonologjike Zajmi",
  fee: 4500,
  specialties: ["pulmonology"],
  status: "approved",
  services: [
    { name: "Vizitë pulmonologjike", duration: 30, price: 4500 },
    { name: "Spirometri", duration: 20, price: 2000 },
    { name: "Test alergjie", duration: 30, price: 3500 },
    { name: "Oksigjeni pulsoksimetrik", duration: 10, price: 800 },
  ],
},
```

- [ ] **Step 3: Add services to the existing 2 approved doctors** (`dr.hoxha` and `dr.leka`) by adding a `services` field to their existing entries:

For `dr.hoxha` (cardiology), add:
```js
services: [
  { name: "Vizitë kardiologjike", duration: 30, price: 3000 },
  { name: "Elektrokardiogram (EKG)", duration: 15, price: 1500 },
  { name: "Ekokardiografi", duration: 30, price: 4000 },
  { name: "Monitorim Holter 24h", duration: 20, price: 5000 },
],
```

For `dr.leka` (pediatrics), add:
```js
services: [
  { name: "Vizitë pediatrike", duration: 20, price: 2500 },
  { name: "Vaksinim", duration: 15, price: 1000 },
  { name: "Kontroll zhvillimi", duration: 30, price: 3000 },
],
```

- [ ] **Step 4: Wire `upsertServices` into the doctor seeding loop**

In the `for (const d of doctors)` loop, after the existing `if (d.status === "approved") { ... }` block for availability rules, add:

```js
if (d.services && d.services.length > 0) {
  await upsertServices(id, d.services);
}
```

- [ ] **Step 5: Remove `slot_duration_minutes` from the availability rules insert** inside the seeding loop. The column was dropped in migration `0005_drop_slot_duration.sql`. The rules array currently has `slot_duration_minutes: 30` — remove that field:

```js
rules.push({
  doctor_id: id,
  weekday,
  start_time: "09:00",
  end_time: "13:00",
  // slot_duration_minutes removed — column dropped in migration 0005
});
```

- [ ] **Step 6: Run the seed to verify it works**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && node scripts/seed-users.mjs
```
Expected output includes lines for all 8 doctors ending with `(approved)`, no errors.

- [ ] **Step 7: Run tests to make sure nothing broke**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm test 2>&1 | tail -5
```
Expected: `15 passed` (6 pre-existing failures are unrelated to this task).

- [ ] **Step 8: Commit**

```bash
git add scripts/seed-users.mjs
git commit -m "feat: expand seed data with 5 more doctors and services for all approved doctors"
```
