# Doctor Messages Inbox — Design Spec

**Date:** 2026-07-14  
**Status:** Approved

---

## Overview

Add a "Messages" item to the doctor sidebar that opens a unified inbox at `/doctor/messages`. The inbox lists all appointment-linked message threads for the logged-in doctor, grouped one card per appointment. Each card expands in-place (accordion) to show the full message thread and a reply input.

The existing `MessageThread` and `MessageInput` components are reused directly. No new modal or routing layer is introduced.

---

## Data Layer

### New query: `getDoctorMessageThreads(doctorId)`

**File:** `src/lib/queries/messages.ts`

Fetches all `message_threads` where `doctor_id = doctorId`, joining:
- `messages` — for last message body (preview) and unread count (`read_at IS NULL AND sender_id != doctorId`)
- `appointments` — for `starts_at`
- `users` (via `patient_id`) — for patient `full_name`

Returns threads sorted by most-recent message descending. Shape:

```ts
interface DoctorThreadSummary {
  threadId: string;
  appointmentId: string;
  appointmentStartsAt: string;
  patientName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}
```

### New server action: `fetchDoctorMessageThreads()`

**File:** `src/actions/appointment-edit.ts`

Thin wrapper around `getDoctorMessageThreads`. Verifies auth (`requireRole(["doctor"])`), extracts `doctorId` from the session profile, calls the query, returns `DoctorThreadSummary[]`.

### Fix: `sendMessage` revalidation

Add `revalidatePath("/doctor")` (or `/doctor/messages`) to `sendMessage` in `src/actions/appointment-edit.ts` so the doctor inbox refreshes after a reply is sent.

---

## UI Components

### 1. `src/app/[locale]/(doctor)/doctor/messages/page.tsx`

Server component. Flow:
1. Call `fetchDoctorMessageThreads()`.
2. If result is empty, render the `messages.empty` translation key in a muted centered state.
3. Otherwise render `<DoctorMessagesInbox threads={threads} currentUserId={...} />`.

### 2. `src/components/doctor-messages-inbox.tsx`

Client component (`"use client"`).

**Props:**
```ts
interface Props {
  threads: DoctorThreadSummary[];
  currentUserId: string;
}
```

**Behavior:**
- Local state: `openThreadId: string | null` — only one thread expanded at a time.
- Each thread renders as a card (`rounded-xl border border-border bg-card px-4 py-3 shadow-soft`).
- Card header (always visible): patient name (bold), appointment date + time formatted via `formatInTirane`, last message preview (1 line, truncated), unread badge (`<Badge>` with count) if `unreadCount > 0`.
- Clicking the card header toggles `openThreadId`. If already open, collapses. If closed, expands and fetches the full thread via `fetchMessageThread(threadId)`.
- Expanded area: `<MessageThread messages={...} isLoading={...} currentUserId={currentUserId} />` + `<MessageInput threadId={threadId} onSendSuccess={refresh} />`.
- On send success: re-fetches the thread to update the displayed messages.

### 3. Sidebar nav item

**File:** `src/app/[locale]/(doctor)/layout.tsx`

Add to the `items` array (after `nav.appointments`, before `nav.profile`):

```ts
{ href: "/doctor/messages", label: "nav.messages", icon: "MessageSquare" }
```

Lucide `MessageSquare` is already available in the icon registry.

---

## Translations

### `messages/en.json` — add to `nav`:
```json
"messages": "Messages"
```

### `messages/sq.json` — add to `nav`:
```json
"messages": "Mesazhet"
```

---

## Error Handling

- If `fetchDoctorMessageThreads()` throws, the page renders an error boundary (Next.js default) — no custom error UI needed at this stage.
- If `fetchMessageThread` fails when expanding a card, show a toast using the existing `messages.loadError` translation key (already present in both locale files).
- Empty inbox state uses the existing `messages.empty` key.

---

## Out of Scope

- Real-time updates (polling or WebSockets) — threads refresh only on send.
- Unread count badge on the sidebar nav item itself.
- General (non-appointment) threads — the DB supports `type: "general"` but all current threads are appointment-linked; this page filters to those only.
- Patient-side changes — the existing `AppointmentMessageModal` on the patient side is untouched.
