# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile navigation (patient bottom tab bar, doctor/admin hamburger drawer) and responsive layouts to the patient portal, doctor portal, and public-facing pages of Doktori Im.

**Architecture:** Two new client components (`BottomNav`, `MobileDrawer`) plug into the existing `PortalShell` via a new `variant` prop. `SiteHeader` gets a hamburger Sheet for its hidden mobile nav links. The doctor profile page gets a stacked single-column layout on mobile. `shadcn/ui Sheet` is scaffolded from the already-installed `@radix-ui/react-dialog` package — no new npm packages.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui (Sheet to be scaffolded), `lucide-react`, `next-intl` (`useTranslations`, `getTranslations`), `@/i18n/navigation` (`usePathname`, `Link`).

## Global Constraints

- All user-visible strings must use `t()` from next-intl — no hardcoded strings
- No new npm packages — `@radix-ui/react-dialog` is already installed; Sheet scaffolded from it
- `npm run build` must pass after every task (zero TS errors)
- Tailwind only — no inline styles
- Mobile breakpoint boundary: `md` (768px) — consistent with existing `portal-shell.tsx`
- Touch targets: `min-h-[48px]` on all tappable elements in new/modified components
- Git: branch `feature/mobile-responsiveness` — commit after each task

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ui/sheet.tsx` | **Create** | shadcn Sheet primitive (wraps Radix Dialog) |
| `src/components/bottom-nav.tsx` | **Create** | Patient portal bottom tab bar (mobile only) |
| `src/components/mobile-drawer.tsx` | **Create** | Doctor/admin hamburger + Sheet drawer (mobile only) |
| `src/components/portal-shell.tsx` | **Modify** | Add `variant` prop; render `BottomNav` or `MobileDrawer` on mobile |
| `src/components/site-header.tsx` | **Modify** | Add hamburger Sheet for public nav links on mobile |
| `src/app/[locale]/(patient)/layout.tsx` | **Modify** | Pass `variant="patient"` to `PortalShell` |
| `src/app/[locale]/(doctor)/layout.tsx` | **Modify** | Pass `variant="doctor"` to `PortalShell` |
| `src/app/[locale]/(admin)/layout.tsx` | **Modify** | Pass `variant="admin"` to `PortalShell` |
| `src/app/[locale]/(marketing)/doctors/[slug]/page.tsx` | **Modify** | Stack bio + booking widget vertically on mobile |
| `messages/sq.json` | **Modify** | Add `nav.findDoctor`, `nav.menu`, `nav.close` |
| `messages/en.json` | **Modify** | Add `nav.findDoctor`, `nav.menu`, `nav.close` |

---

## Task 1: Scaffold Sheet component + add i18n keys

**Files:**
- Create: `src/components/ui/sheet.tsx`
- Modify: `messages/sq.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetClose` exports used by Tasks 2, 3, and 4

- [ ] **Step 1: Create `src/components/ui/sheet.tsx`**

```tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "top" | "right" | "bottom" | "left";
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
        side === "left" &&
          "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        side === "right" &&
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
        side === "top" &&
          "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        side === "bottom" &&
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
};
```

- [ ] **Step 2: Add new i18n keys to `messages/sq.json`**

Read the file first. Merge these three keys into the existing `"nav"` object (do NOT remove existing keys):

```json
"findDoctor": "Gjej mjek",
"menu": "Menyja",
"close": "Mbyll"
```

- [ ] **Step 3: Add new i18n keys to `messages/en.json`**

Read the file first. Merge these three keys into the existing `"nav"` object:

```json
"findDoctor": "Find Doctor",
"menu": "Menu",
"close": "Close"
```

- [ ] **Step 4: Verify build**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/sheet.tsx messages/sq.json messages/en.json
git commit -m "feat: scaffold Sheet component and add mobile i18n keys"
```

---

## Task 2: BottomNav component (patient portal)

**Files:**
- Create: `src/components/bottom-nav.tsx`

**Interfaces:**
- Consumes: `NavItem` from `@/components/portal-nav`, `usePathname` from `@/i18n/navigation`, `Link` from `@/i18n/navigation`
- Produces: `BottomNav({ items: NavItem[] })` — used by Task 3 (PortalShell)

- [ ] **Step 1: Create `src/components/bottom-nav.tsx`**

```tsx
"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as Icons from "lucide-react";
import type { NavItem } from "@/components/portal-nav";

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t border-border/60 bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const Icon = Icons[item.icon] as LucideIcon;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-6" />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/components/bottom-nav.tsx
git commit -m "feat: add BottomNav component for patient portal mobile"
```

---

## Task 3: MobileDrawer component (doctor/admin portal)

**Files:**
- Create: `src/components/mobile-drawer.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet` (Task 1), `NavItem` from `@/components/portal-nav`, `PortalNav` from `@/components/portal-nav`, `usePathname` from `@/i18n/navigation`
- Produces: `MobileDrawer({ items: NavItem[], portalLabel: string })` — used by Task 4 (PortalShell)

- [ ] **Step 1: Create `src/components/mobile-drawer.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PortalNav, type NavItem } from "@/components/portal-nav";
import { Stethoscope } from "lucide-react";

export function MobileDrawer({
  items,
  portalLabel,
}: {
  items: NavItem[];
  portalLabel: string;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        aria-label={t("menu")}
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 pt-0">
          <SheetHeader className="border-b border-border/60 px-4 py-4">
            <SheetTitle className="flex items-center gap-2 text-primary">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="size-4" />
              </span>
              {portalLabel}
            </SheetTitle>
          </SheetHeader>
          <div className="p-3">
            <PortalNav items={items} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/components/mobile-drawer.tsx
git commit -m "feat: add MobileDrawer component for doctor/admin portal mobile"
```

---

## Task 4: Update PortalShell with variant prop

**Files:**
- Modify: `src/components/portal-shell.tsx`
- Modify: `src/app/[locale]/(patient)/layout.tsx`
- Modify: `src/app/[locale]/(doctor)/layout.tsx`
- Modify: `src/app/[locale]/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `BottomNav` (Task 2), `MobileDrawer` (Task 3)
- Produces: `PortalShell` with updated signature including `variant: "patient" | "doctor" | "admin"`

**Important notes:**
- `PortalShell` is a **server component** (`async function`). `BottomNav` and `MobileDrawer` are client components — they can be imported and rendered from server components without issue.
- The hamburger button in `MobileDrawer` must appear **inside the topbar** on mobile. Insert it as the first child of the `container flex h-16` div, before the logo link, with `md:hidden`.
- Add `pb-16 md:pb-0` to `<main>` when `variant === "patient"` so content is not obscured by the fixed bottom tab bar.
- Pass `items` to `MobileDrawer` so it renders the same nav items as the desktop sidebar.
- `portalLabel` for `MobileDrawer` comes from `getTranslations()` — pass `t("common.appName")` (already exists as `"Doktori Im"`).

- [ ] **Step 1: Replace `src/components/portal-shell.tsx` entirely**

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { PortalNav, type NavItem } from "@/components/portal-nav";
import { BottomNav } from "@/components/bottom-nav";
import { MobileDrawer } from "@/components/mobile-drawer";
import { Stethoscope } from "lucide-react";

export async function PortalShell({
  items,
  userName,
  dashboardHref,
  userId,
  variant,
  children,
}: {
  items: NavItem[];
  userName: string;
  dashboardHref: string;
  userId: string;
  variant: "patient" | "doctor" | "admin";
  children: React.ReactNode;
}) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-primary-tint/40">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          {/* Mobile drawer trigger — doctor and admin only */}
          {(variant === "doctor" || variant === "admin") && (
            <MobileDrawer items={items} portalLabel={t("common.appName")} />
          )}

          <Link href="/" className="flex items-center gap-2 font-extrabold text-primary">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
              <Stethoscope className="size-5" />
            </span>
            <span className="text-lg">Doktori Im</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell userId={userId} />
            <UserMenu name={userName} dashboardHref={dashboardHref} />
          </div>
        </div>
      </header>

      <div className="container flex flex-1 gap-6 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <PortalNav items={items} />
        </aside>
        <main className={`min-w-0 flex-1 ${variant === "patient" ? "pb-16 md:pb-0" : ""}`}>
          {children}
        </main>
      </div>

      {/* Patient bottom tab bar */}
      {variant === "patient" && <BottomNav items={items} />}
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/[locale]/(patient)/layout.tsx`**

Add `variant="patient"` to the `<PortalShell>` call. The items array already maps the 4 patient tabs correctly — keep it as-is. Only add the `variant` prop:

```tsx
  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/patient"
      userId={user.id}
      variant="patient"
    >
      {children}
    </PortalShell>
  );
```

- [ ] **Step 3: Update `src/app/[locale]/(doctor)/layout.tsx`**

Add `variant="doctor"` to the `<PortalShell>` call:

```tsx
  return (
    <PortalShell
      items={items}
      userName={user.full_name ?? user.email}
      dashboardHref="/doctor"
      userId={user.id}
      variant="doctor"
    >
      {children}
    </PortalShell>
  );
```

- [ ] **Step 4: Update `src/app/[locale]/(admin)/layout.tsx`**

Read `src/app/[locale]/(admin)/layout.tsx` first to see current structure, then add `variant="admin"` to the `<PortalShell>` call:

```tsx
      variant="admin"
```

- [ ] **Step 5: Verify build**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully` with zero TS errors. If you see a type error on `variant`, ensure the prop type in `portal-shell.tsx` matches `"patient" | "doctor" | "admin"` exactly.

- [ ] **Step 6: Commit**

```bash
git add src/components/portal-shell.tsx src/app/\[locale\]/\(patient\)/layout.tsx src/app/\[locale\]/\(doctor\)/layout.tsx src/app/\[locale\]/\(admin\)/layout.tsx
git commit -m "feat: add mobile nav to PortalShell via variant prop"
```

---

## Task 5: Update SiteHeader with mobile hamburger menu

**Files:**
- Modify: `src/components/site-header.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet` (Task 1)
- Note: `SiteHeader` is a **server component**. The hamburger open/close state needs a client island. Create a small inline client component `MobileMenu` **inside** `site-header.tsx` (not a separate file — it's only used here).

- [ ] **Step 1: Replace `src/components/site-header.tsx` entirely**

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { Stethoscope } from "lucide-react";
import { SiteHeaderMobileMenu } from "@/components/site-header-mobile-menu";

export async function SiteHeader() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  const dashboardHref =
    user?.role === "doctor"
      ? "/doctor"
      : user?.role === "admin"
        ? "/admin"
        : "/patient";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-primary">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Stethoscope className="size-5" />
          </span>
          <span className="text-lg">Doktori Im</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
          <Link href="/doctors" className="transition-colors hover:text-foreground">
            {t("nav.forPatients")}
          </Link>
          <Link href="/register/doctor" className="transition-colors hover:text-foreground">
            {t("nav.forDoctors")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user && <NotificationBell userId={user.id} />}
          {user ? (
            <UserMenu name={user.full_name ?? user.email} dashboardHref={dashboardHref} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t("common.login")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/register">{t("common.register")}</Link>
              </Button>
            </>
          )}
          {/* Mobile hamburger — only shown when user is not logged in (nav links are hidden) */}
          {!user && (
            <SiteHeaderMobileMenu
              menuLabel={t("nav.menu")}
              closeLabel={t("nav.close")}
              forPatientsLabel={t("nav.forPatients")}
              forDoctorsLabel={t("nav.forDoctors")}
              loginLabel={t("common.login")}
              registerLabel={t("common.register")}
            />
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `src/components/site-header-mobile-menu.tsx`**

This is the client island that owns the Sheet open state:

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, Link } from "@/i18n/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Stethoscope } from "lucide-react";

export function SiteHeaderMobileMenu({
  menuLabel,
  closeLabel,
  forPatientsLabel,
  forDoctorsLabel,
  loginLabel,
  registerLabel,
}: {
  menuLabel: string;
  closeLabel: string;
  forPatientsLabel: string;
  forDoctorsLabel: string;
  loginLabel: string;
  registerLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        aria-label={menuLabel}
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2 text-primary">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="size-4" />
              </span>
              Doktori Im
            </SheetTitle>
          </SheetHeader>

          <nav className="flex flex-col gap-2">
            <Link
              href="/doctors"
              className="flex min-h-[48px] items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {forPatientsLabel}
            </Link>
            <Link
              href="/register/doctor"
              className="flex min-h-[48px] items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {forDoctorsLabel}
            </Link>
          </nav>

          <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-6">
            <Button asChild variant="ghost" className="min-h-[48px] w-full justify-start">
              <Link href="/login">{loginLabel}</Link>
            </Button>
            <Button asChild className="min-h-[48px] w-full">
              <Link href="/register">{registerLabel}</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/components/site-header.tsx src/components/site-header-mobile-menu.tsx
git commit -m "feat: add mobile hamburger menu to SiteHeader"
```

---

## Task 6: Doctor profile page — stacked mobile layout

**Files:**
- Modify: `src/app/[locale]/(marketing)/doctors/[slug]/page.tsx`

**Context:** The current layout uses `grid gap-6 lg:grid-cols-3` with the booking widget in `lg:col-span-1`. On screens below `lg` (1024px), the two "columns" already stack — but the booking widget always renders after the bio, which is the correct mobile order. The change needed is: replace `lg:` breakpoints with `md:` so the side-by-side layout kicks in at 768px (tablet), not 1024px (desktop). Also ensure the booking widget column gets a `md:sticky md:top-4` for the side-by-side view.

- [ ] **Step 1: Update the outer grid and column classes in `src/app/[locale]/(marketing)/doctors/[slug]/page.tsx`**

Change line 47:
```tsx
// Before:
<div className="grid gap-6 lg:grid-cols-3">

// After:
<div className="flex flex-col gap-6 md:grid md:grid-cols-3">
```

Change line 49:
```tsx
// Before:
<div className="flex flex-col gap-6 lg:col-span-2">

// After:
<div className="flex flex-col gap-6 md:col-span-2">
```

Change line 132:
```tsx
// Before:
<div className="lg:col-span-1">
  <Card className="lg:sticky lg:top-24">

// After:
<div className="md:col-span-1">
  <Card className="md:sticky md:top-24">
```

- [ ] **Step 2: Verify build**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Run tests**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im" && npm test 2>&1 | tail -10
```

Expected: `21 passed`

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(marketing)/doctors/[slug]/page.tsx"
git commit -m "fix: stack doctor profile bio and booking widget on mobile"
```

---

## Report

After all 6 tasks, write a brief summary to:
`c:\Users\ebardhi\Downloads\claude demo projects\doktori_im\.superpowers\sdd\mobile-report.md`

Include: tasks completed, commit hashes, any deviations from the plan, and final build/test status.
