# Mobile Responsiveness Design

**Goal:** Add mobile navigation and responsive layouts to the patient portal, doctor portal, and public-facing pages of Doktori Im.

**Architecture:** Targeted additions to two existing components (`PortalShell`, `SiteHeader`) and one existing page (`/doctors/[slug]`), plus two new client components (`BottomNav`, `MobileDrawer`). No structural rewrites. No new npm packages.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, shadcn/ui `Sheet` (already installed), `lucide-react` icons (already installed), `next-intl` `useTranslations`, Next.js `usePathname`.

---

## Global Constraints

- All user-visible strings must use `t()` from next-intl — no hardcoded strings
- No new npm packages — use existing shadcn/ui and lucide-react
- `npm run build` must pass after every task (zero TS errors)
- Tailwind only — no inline styles
- Mobile breakpoint boundary: `md` (768px) throughout, consistent with existing `portal-shell.tsx`
- Touch targets: `min-h-[48px]` on all tappable elements in new/modified components
- Font size on all `<input>` elements: `text-base` (16px minimum) to prevent iOS auto-zoom
- Albanian (`sq`) is the default locale; English (`en`) is secondary

---

## Scope

**In scope:**
- Patient portal: bottom tab bar (mobile only)
- Doctor portal: hamburger + Sheet drawer (mobile only)
- Public site header: hamburger + Sheet for nav links (mobile only)
- Doctor profile page: stacked single-column layout on mobile

**Out of scope:**
- Admin portal mobile nav (admin is primarily desktop use)
- Server actions, DB layer, booking logic — no changes
- PWA / app manifest / push notifications
- Tablet breakpoints (`lg:`) — mobile (`< md`) only

---

## Component Designs

### `BottomNav` (`src/components/bottom-nav.tsx`)

Patient portal only. Fixed to bottom of viewport, hidden on `md+`.

**Tab configuration (driven by array, not hardcoded JSX):**

| Tab | Icon | i18n key | Route |
|-----|------|----------|-------|
| Home | `LayoutDashboard` | `nav.dashboard` | `/patient` |
| Find Doctor | `Search` | `nav.findDoctor` | `/doctors` |
| Appointments | `CalendarDays` | `nav.myAppointments` | `/patient/appointments` |
| Waitlist | `Clock` | `nav.waitlist` | `/patient/waitlist` |

**Sizing and layout:**
- Container: `fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t`
- Height: `h-16` + `pb-[env(safe-area-inset-bottom)]` for iPhone notch
- Each tab: `min-h-[48px] flex-1 flex flex-col items-center justify-center gap-0.5`
- Icon: `w-6 h-6`
- Label: `text-[10px] font-medium`

**Active state:**
- Active tab: `text-primary` (teal `#0D6B8C`)
- Inactive tab: `text-muted-foreground`
- Active detection: `usePathname()` — exact match for `/patient`, `startsWith` for sub-routes

**Body padding:** `PortalShell` must add `pb-16` to `<main>` when `variant="patient"` on mobile so content is not obscured by the tab bar.

---

### `MobileDrawer` (`src/components/mobile-drawer.tsx`)

Doctor and admin portals. Hamburger button in topbar opens a shadcn `Sheet` from the left.

**Hamburger button:**
- Positioned left of the topbar logo, `md:hidden`
- `min-h-[44px] min-w-[44px]` tap target
- Uses `Menu` icon from lucide-react
- `aria-label={t("nav.menu")}`

**Sheet:**
- `side="left"`, `className="w-64 pt-6"`
- Header: app name/logo + close button (`X` icon, `aria-label={t("nav.close")}`)
- Body: renders the existing `PortalNav` items (zero duplication — same component used in desktop sidebar)
- Auto-closes when `usePathname()` changes (use `useEffect` watching pathname to call `setOpen(false)`)
- Overlay dismisses on outside tap (shadcn Sheet default behavior)

---

### `PortalShell` updates (`src/components/portal-shell.tsx`)

Add a `variant` prop: `"patient" | "doctor" | "admin"`.

**On mobile (`< md`):**
- `variant="patient"`: render `<BottomNav />` below `<main>`, add `pb-16` to `<main>`
- `variant="doctor"` or `"admin"`: render `<MobileDrawer navItems={...} />` in the topbar

**On desktop (`md+`):**
- Existing `<aside className="hidden md:block">` sidebar unchanged
- `BottomNav` and `MobileDrawer` both `md:hidden` — invisible

**`PortalNav` items in the drawer:** Pass the same nav items array that already drives the desktop sidebar. No new data needed.

---

### `SiteHeader` updates (`src/components/site-header.tsx`)

Add a hamburger button (right side of topbar) that opens a shadcn `Sheet` for the public nav links currently hidden on mobile.

**Sheet contents (top to bottom):**
- "For Patients" link (`nav.forPatients`)
- "For Doctors" link (`nav.forDoctors`)
- Divider
- Login button
- Register button
- `LanguageSwitcher`

**Hamburger button:**
- `md:hidden`, right-aligned
- `min-h-[44px] min-w-[44px]`
- `aria-label={t("nav.menu")}`
- Auto-closes on route change (same `usePathname()` pattern)

---

### Doctor Profile Page (`src/app/[locale]/(marketing)/doctors/[slug]/page.tsx`)

Wrap the two-column layout in `flex flex-col md:flex-row md:gap-8`:
- Bio/info column: `w-full md:w-2/3`
- Booking widget column: `w-full md:w-1/3 md:sticky md:top-4`

On mobile: bio appears first, booking widget below. On desktop: side-by-side as before.

---

## New i18n Keys

Add to both `messages/sq.json` and `messages/en.json`:

| Key | Albanian (`sq`) | English (`en`) |
|-----|----------------|----------------|
| `nav.findDoctor` | `"Gjej mjek"` | `"Find Doctor"` |
| `nav.menu` | `"Menyja"` | `"Menu"` |
| `nav.close` | `"Mbyll"` | `"Close"` |

All other required keys (`nav.dashboard`, `nav.myAppointments`, `nav.waitlist`, `nav.profile`, `nav.forPatients`, `nav.forDoctors`) already exist.

---

## Research Basis

Design decisions are grounded in verified 2024–2025 research:

- **Bottom tab bar over hamburger** — Spotify A/B test: 30% more menu clicks with bottom tabs; Nielsen Norman Group: hidden nav reduces task completion 21%
- **Touch target 48×48px** — Material Design 3 (48dp), Apple HIG (44pt), WCAG 2.5.5 AAA (44px); using 48px satisfies all three
- **16px minimum font on inputs** — iOS Safari auto-zooms inputs with `font-size < 16px`, breaking layout
- **Doctor portal uses drawer not tabs** — doctors/admins are power users with 6+ nav items; a drawer handles depth better than a cramped 5-tab bar
- **Bio before booking widget on mobile** — Baymard: users need to establish trust before booking intent; showing bio first on scroll matches that mental model
- **Sheet auto-close on navigation** — standard pattern to prevent stale-open drawers after route change
