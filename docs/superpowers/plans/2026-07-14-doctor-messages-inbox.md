# Doctor Messages Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Messages" sidebar item to the doctor portal that shows all patient message threads grouped by appointment, each expandable inline to read and reply.

**Architecture:** A new Supabase query fetches all message threads for the doctor (with patient name, appointment time, last message, unread count). A server page renders a client accordion component that expands each thread using the existing `fetchMessageThread` + `MessageThread` + `MessageInput` components. The sidebar nav item and translation keys are added in the same pass.

**Tech Stack:** Next.js 14 App Router (server components + `"use client"`), Supabase JS client, next-intl, Tailwind CSS, Lucide React icons, sonner toasts.

## Global Constraints

- All new files follow existing patterns: server pages are async functions with `setRequestLocale`, client components start with `"use client"`.
- Use `requireDoctor()` from `@/lib/guards` (returns `{ user, status }`) for doctor auth — not `requireRole`.
- Formatting dates: use `formatInTirane(isoString, formatStr)` from `@/lib/datetime`.
- Card styling matches existing doctor portal: `rounded-xl border border-border bg-card p-4 shadow-soft`.
- No new dependencies — only packages already in the project.
- Branch: create `feat/doctor-messages-inbox` from `main` before starting.
- Commits: format `feat: ...` / `fix: ...`, no Co-Authored-By.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/queries/messages.ts` | Modify | Add `getDoctorMessageThreads` query + `DoctorThreadSummary` type |
| `src/actions/appointment-edit.ts` | Modify | Add `fetchDoctorMessageThreads` action; fix `sendMessage` revalidation |
| `src/components/doctor-messages-inbox.tsx` | Create | Client accordion component — thread list + inline expand |
| `src/app/[locale]/(doctor)/doctor/messages/page.tsx` | Create | Server page — fetch threads, render inbox or empty state |
| `src/app/[locale]/(doctor)/layout.tsx` | Modify | Add Messages nav item |
| `messages/en.json` | Modify | Add `nav.messages` key |
| `messages/sq.json` | Modify | Add `nav.messages` key |

---

## Task 1: Create feature branch

**Files:** none (git only)

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feat/doctor-messages-inbox
```

Expected output: `Switched to a new branch 'feat/doctor-messages-inbox'`

---

## Task 2: Add `getDoctorMessageThreads` query

**Files:**
- Modify: `src/lib/queries/messages.ts`

**Interfaces:**
- Produces: `DoctorThreadSummary` interface and `getDoctorMessageThreads(doctorId: string): Promise<DoctorThreadSummary[]>` — consumed by Task 3.

- [ ] **Step 1: Add the `DoctorThreadSummary` interface and query to `src/lib/queries/messages.ts`**

Append after the last export in the file (after line 187):

```typescript
export interface DoctorThreadSummary {
  threadId: string;
  appointmentId: string;
  appointmentStartsAt: string;
  patientName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

/**
 * Fetch all message threads for a doctor, with patient info, last message
 * preview, and unread count. Sorted by most-recent message descending.
 */
export async function getDoctorMessageThreads(
  doctorId: string,
): Promise<DoctorThreadSummary[]> {
  const supabase = createClient();

  // Fetch all threads for this doctor with their messages
  const { data: threadsData } = await supabase
    .from("message_threads")
    .select(
      `
      id, appointment_id,
      patient:users!message_threads_patient_id_fkey(full_name),
      appointment:appointments!message_threads_appointment_id_fkey(starts_at),
      messages(id, body, created_at, read_at, sender_id)
    `,
    )
    .eq("doctor_id", doctorId)
    .not("appointment_id", "is", null);

  if (!threadsData || threadsData.length === 0) return [];

  return (
    threadsData as unknown as Array<{
      id: string;
      appointment_id: string;
      patient: { full_name: string | null } | { full_name: string | null }[];
      appointment:
        | { starts_at: string }
        | { starts_at: string }[]
        | null;
      messages: Array<{
        id: string;
        body: string;
        created_at: string;
        read_at: string | null;
        sender_id: string;
      }>;
    }>
  )
    .map((t) => {
      const patientRaw = t.patient;
      const patientName = Array.isArray(patientRaw)
        ? (patientRaw[0]?.full_name ?? "Unknown")
        : ((patientRaw as { full_name: string | null })?.full_name ?? "Unknown");

      const apptRaw = t.appointment;
      const appointmentStartsAt = Array.isArray(apptRaw)
        ? (apptRaw[0]?.starts_at ?? "")
        : ((apptRaw as { starts_at: string } | null)?.starts_at ?? "");

      const msgs = t.messages ?? [];
      const sorted = [...msgs].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      const last = sorted[0] ?? null;
      const unreadCount = msgs.filter(
        (m) => m.read_at === null && m.sender_id !== doctorId,
      ).length;

      return {
        threadId: t.id,
        appointmentId: t.appointment_id,
        appointmentStartsAt,
        patientName,
        lastMessageBody: last?.body ?? null,
        lastMessageAt: last?.created_at ?? null,
        unreadCount,
      };
    })
    .filter((t) => t.appointmentStartsAt !== "")
    .sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:\Users\ebardhi\Downloads\claude demo projects\doktori_im"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors involving `messages.ts` or `getDoctorMessageThreads`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/messages.ts
git commit -m "feat: add getDoctorMessageThreads query with DoctorThreadSummary type"
```

---

## Task 3: Add `fetchDoctorMessageThreads` server action and fix `sendMessage` revalidation

**Files:**
- Modify: `src/actions/appointment-edit.ts`

**Interfaces:**
- Consumes: `getDoctorMessageThreads(doctorId)` from `src/lib/queries/messages.ts` (Task 2)
- Produces: `fetchDoctorMessageThreads(): Promise<DoctorThreadSummary[]>` — consumed by Task 5 (page)

- [ ] **Step 1: Add the import for `DoctorThreadSummary` and `getDoctorMessageThreads` at the top of `src/actions/appointment-edit.ts`**

Find the existing import on line 7:
```typescript
import type { MessageThread } from "@/lib/queries/messages";
```

Replace it with:
```typescript
import type { MessageThread, DoctorThreadSummary } from "@/lib/queries/messages";
import { getDoctorMessageThreads } from "@/lib/queries/messages";
```

- [ ] **Step 2: Fix `sendMessage` to also revalidate the doctor messages page**

Find in `sendMessage` (around line 159):
```typescript
  // Revalidate caches if needed (optional for messaging)
  revalidatePath("/patient");
```

Replace with:
```typescript
  revalidatePath("/patient");
  revalidatePath("/doctor/messages");
```

- [ ] **Step 3: Append `fetchDoctorMessageThreads` at the end of `src/actions/appointment-edit.ts`**

```typescript
/**
 * Fetch all message threads for the currently authenticated doctor.
 * Returns threads sorted by most-recent message descending.
 */
export async function fetchDoctorMessageThreads(): Promise<DoctorThreadSummary[]> {
  const { user } = await requireDoctor();
  return getDoctorMessageThreads(user.id);
}
```

Note: `requireDoctor` is already imported at the top — check the imports; if it isn't, add it:
```typescript
import { requireDoctor } from "@/lib/guards";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/appointment-edit.ts
git commit -m "feat: add fetchDoctorMessageThreads action and fix sendMessage revalidation"
```

---

## Task 4: Create `DoctorMessagesInbox` client component

**Files:**
- Create: `src/components/doctor-messages-inbox.tsx`

**Interfaces:**
- Consumes:
  - `DoctorThreadSummary` from `@/lib/queries/messages`
  - `fetchMessageThread` from `@/actions/appointment-edit` — signature: `(threadId: string) => Promise<MessageThread | null>`
  - `MessageThread` component from `@/components/message-thread` — props: `{ messages: Message[], isLoading: boolean, currentUserId: string }`
  - `MessageInput` component from `@/components/message-input` — props: `{ threadId: string, onSendSuccess?: () => void }`
- Produces: `<DoctorMessagesInbox threads={DoctorThreadSummary[]} currentUserId={string} />` — consumed by Task 5

- [ ] **Step 1: Create `src/components/doctor-messages-inbox.tsx`**

```typescript
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, User, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { fetchMessageThread } from "@/actions/appointment-edit";
import { formatInTirane } from "@/lib/datetime";
import type { DoctorThreadSummary } from "@/lib/queries/messages";
import type { Message } from "@/lib/queries/messages";

interface Props {
  threads: DoctorThreadSummary[];
  currentUserId: string;
}

export function DoctorMessagesInbox({ threads, currentUserId }: Props) {
  const t = useTranslations();
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, Message[]>>({});
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingThreadId(threadId);
    try {
      const result = await fetchMessageThread(threadId);
      setThreadMessages((prev) => ({
        ...prev,
        [threadId]: result?.messages ?? [],
      }));
    } catch {
      toast.error(t("messages.loadError"));
    } finally {
      setLoadingThreadId(null);
    }
  }, [t]);

  async function handleToggle(threadId: string) {
    if (openThreadId === threadId) {
      setOpenThreadId(null);
      return;
    }
    setOpenThreadId(threadId);
    if (!threadMessages[threadId]) {
      await loadThread(threadId);
    }
  }

  function handleSendSuccess(threadId: string) {
    loadThread(threadId);
  }

  return (
    <div className="flex flex-col gap-3">
      {threads.map((thread) => {
        const isOpen = openThreadId === thread.threadId;
        const isLoading = loadingThreadId === thread.threadId;
        const messages = threadMessages[thread.threadId] ?? [];

        return (
          <Card key={thread.threadId} className="overflow-hidden p-0">
            <button
              onClick={() => handleToggle(thread.threadId)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <User className="size-4 shrink-0 text-primary" />
                  <span className="font-bold text-foreground">{thread.patientName}</span>
                  {thread.unreadCount > 0 && (
                    <Badge variant="default" className="text-xs">
                      {thread.unreadCount}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="size-4 shrink-0" />
                  <span>
                    {formatInTirane(thread.appointmentStartsAt, "EEEE, d MMM yyyy — HH:mm")}
                  </span>
                </div>
                {thread.lastMessageBody && (
                  <p className="truncate text-sm text-muted-foreground">
                    {thread.lastMessageBody}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-muted-foreground">
                {isOpen ? (
                  <ChevronUp className="size-5" />
                ) : (
                  <ChevronDown className="size-5" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-border p-4">
                <MessageThread
                  messages={messages}
                  isLoading={isLoading}
                  currentUserId={currentUserId}
                />
                <MessageInput
                  threadId={thread.threadId}
                  onSendSuccess={() => handleSendSuccess(thread.threadId)}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors involving `doctor-messages-inbox.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/doctor-messages-inbox.tsx
git commit -m "feat: add DoctorMessagesInbox accordion component"
```

---

## Task 5: Create the Messages server page

**Files:**
- Create: `src/app/[locale]/(doctor)/doctor/messages/page.tsx`

**Interfaces:**
- Consumes:
  - `fetchDoctorMessageThreads(): Promise<DoctorThreadSummary[]>` from `@/actions/appointment-edit` (Task 3)
  - `DoctorMessagesInbox` component (Task 4)
  - `requireDoctor()` from `@/lib/guards` — returns `{ user: { id: string, ... }, status }`
  - `EmptyState` component from `@/components/empty-state` — props: `{ title: string, icon: string }`

- [ ] **Step 1: Create `src/app/[locale]/(doctor)/doctor/messages/page.tsx`**

```typescript
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { fetchDoctorMessageThreads } from "@/actions/appointment-edit";
import { DoctorMessagesInbox } from "@/components/doctor-messages-inbox";
import { EmptyState } from "@/components/empty-state";

export default async function DoctorMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const { user } = await requireDoctor();

  const threads = await fetchDoctorMessageThreads();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.messages")}</h1>

      {threads.length === 0 ? (
        <EmptyState title={t("messages.empty")} icon="MessageSquare" />
      ) : (
        <DoctorMessagesInbox threads={threads} currentUserId={user.id} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors involving `messages/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(doctor)/doctor/messages/page.tsx"
git commit -m "feat: add doctor messages page"
```

---

## Task 6: Add sidebar nav item and translation keys

**Files:**
- Modify: `src/app/[locale]/(doctor)/layout.tsx`
- Modify: `messages/en.json`
- Modify: `messages/sq.json`

**Interfaces:** none — pure config/translation changes.

- [ ] **Step 1: Add `nav.messages` to `messages/en.json`**

Find:
```json
    "findDoctor": "Find Doctor",
```

Add `"messages"` inside the `"nav"` block (after `"findDoctor"` or any adjacent key):
```json
    "findDoctor": "Find Doctor",
    "messages": "Messages",
```

- [ ] **Step 2: Add `nav.messages` to `messages/sq.json`**

Find:
```json
    "findDoctor": "Gjej mjek",
```

Add:
```json
    "findDoctor": "Gjej mjek",
    "messages": "Mesazhet",
```

- [ ] **Step 3: Add the sidebar nav item in `src/app/[locale]/(doctor)/layout.tsx`**

Find:
```typescript
    { href: "/doctor/appointments", label: t("nav.appointments"), icon: "Calendar" },
    { href: "/doctor/profile", label: t("nav.profile"), icon: "UserCog" },
```

Replace with:
```typescript
    { href: "/doctor/appointments", label: t("nav.appointments"), icon: "Calendar" },
    { href: "/doctor/messages", label: t("nav.messages"), icon: "MessageSquare" },
    { href: "/doctor/profile", label: t("nav.profile"), icon: "UserCog" },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/sq.json "src/app/[locale]/(doctor)/layout.tsx"
git commit -m "feat: add Messages nav item to doctor sidebar"
```

---

## Task 7: Smoke test and push

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Log in as a doctor. Verify:
1. "Messages" appears in the sidebar with a chat bubble icon.
2. Clicking "Messages" navigates to `/doctor/messages`.
3. If the doctor has appointment threads, they appear as cards with patient name, date, and last message preview.
4. Unread count badge appears when there are unread messages.
5. Clicking a card expands the thread inline — messages display correctly.
6. Typing a reply and clicking Send sends the message (toast "Message sent") and refreshes the thread.
7. Clicking the card again collapses it.
8. If no threads exist, the empty state shows ("No messages yet.").
9. Switch locale to SQ — sidebar shows "Mesazhet", empty state shows Albanian text.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/doctor-messages-inbox
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat: doctor messages inbox" --body "$(cat <<'EOF'
## Summary
- Adds Messages sidebar nav item to the doctor portal
- New `/doctor/messages` page lists all appointment message threads grouped by appointment
- Each thread card expands inline (accordion) to show the full message thread and a reply input
- Reuses existing MessageThread and MessageInput components

## Test plan
- [ ] Messages nav item visible in doctor sidebar
- [ ] Page renders thread list sorted by most-recent message
- [ ] Unread badge appears for messages not yet read by doctor
- [ ] Expanding a card loads and displays the full thread
- [ ] Sending a reply updates the thread inline
- [ ] Empty state shown when doctor has no message threads
- [ ] Both EN and SQ locales render correctly
EOF
)"
```
