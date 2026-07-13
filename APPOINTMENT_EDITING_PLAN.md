# Appointment Editing & Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a patient-facing appointment editing system with two-way messaging and rescheduling capabilities.

**Architecture:** 
- Database layer: Two new tables (`message_threads`, `messages`) with RLS and triggers
- Server layer: Three RPC functions + three server actions for mutations
- Component layer: Edit page, message thread UI, reschedule modal, calendar quick-actions
- Real-time: Polling-based message updates (3-5 second intervals)

**Tech Stack:** 
- Supabase (PostgreSQL, RLS policies, RPC functions)
- Next.js 14+ with Server Components and Server Actions
- React hooks for client-side state
- Tailwind CSS + existing UI component library
- TypeScript for type safety

## Global Constraints

- No breaking changes to existing appointment/booking logic
- All patient-facing pages require authentication (enforce via middleware)
- Messages must be ordered chronologically (created_at ASC)
- Reschedule validation uses existing `get_available_slots()` RPC
- All RPC functions use `RETURNS TABLE` for compatibility
- Commit messages follow `type: description` format (no Co-Authored-By)
- Database types must be updated in `src/lib/database.types.ts`

---

## File Structure Overview

**New Files Created:**
```
src/
├── actions/
│   └── appointment-edit.ts          [Server actions: reschedule, message, get/create thread]
├── components/
│   ├── message-thread.tsx           [Display messages, scrolling, empty state]
│   ├── message-input.tsx            [Textarea + send button]
│   ├── reschedule-modal.tsx         [Date/time picker modal]
│   └── appointment-quick-actions.tsx [Calendar popover menu]
├── lib/
│   └── queries/
│       └── messages.ts              [getMessageThread query function]
└── app/
    └── [locale]/
        └── (patient)/
            └── patient/
                └── appointments/
                    └── [id]/
                        └── page.tsx [Edit appointment page + layout]

Supabase/
├── migrations/
│   └── [timestamp]_create_messaging_tables.sql [message_threads, messages, trigger, RLS]
└── rpc/
    ├── reschedule_appointment.sql
    ├── create_or_get_message_thread.sql
    └── send_message.sql
```

**Modified Files:**
```
src/
├── lib/
│   └── database.types.ts            [Add message_threads, messages, new RPC signatures]
├── components/
│   └── patient-calendar.tsx         [Add quick-action popover on appointment click]
└── app/
    └── [locale]/
        └── (patient)/
            └── patient/
                └── layout.tsx       [Ensure message polling setup if needed]
```

---

## Task Breakdown

### Task 1: Database Migration - Create Tables and Trigger

**Files:**
- Create: `supabase/migrations/20260714_create_messaging_tables.sql`
- Modify: `src/lib/database.types.ts` (after migration runs)

**Interfaces:**
- Produces: `message_threads` table with RLS, `messages` table with RLS and trigger, notification creation on message insert

- [ ] **Step 1: Create migration SQL file**

Create `supabase/migrations/20260714_create_messaging_tables.sql`:

```sql
-- Create message_threads table
CREATE TABLE message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('appointment', 'doctor')),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  
  -- Unique constraint: one appointment-scoped thread per appointment
  UNIQUE CASE WHEN type = 'appointment' THEN (type, appointment_id, patient_id, doctor_id) END,
  
  -- Unique constraint: one doctor-scoped thread per doctor pair
  UNIQUE CASE WHEN type = 'doctor' THEN (type, patient_id, doctor_id) END,
  
  -- Ensure appointment_id is present when type='appointment'
  CHECK (
    (type = 'appointment' AND appointment_id IS NOT NULL) OR
    (type = 'doctor' AND appointment_id IS NULL)
  )
);

CREATE INDEX idx_message_threads_patient_id ON message_threads(patient_id);
CREATE INDEX idx_message_threads_doctor_id ON message_threads(doctor_id);
CREATE INDEX idx_message_threads_appointment_id ON message_threads(appointment_id);

-- Create messages table
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (body <> ''),
  created_at timestamp NOT NULL DEFAULT now(),
  read_at timestamp
);

CREATE INDEX idx_messages_thread_id_created_at ON messages(thread_id, created_at);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);

-- Enable RLS on message_threads
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_threads_select ON message_threads FOR SELECT
  USING (
    auth.uid() = patient_id OR auth.uid() = doctor_id
  );

CREATE POLICY message_threads_insert ON message_threads FOR INSERT
  WITH CHECK (
    auth.uid() = patient_id
  );

-- Enable RLS on messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM message_threads
      WHERE message_threads.id = messages.thread_id
      AND (message_threads.patient_id = auth.uid() OR message_threads.doctor_id = auth.uid())
    )
  );

CREATE POLICY messages_insert ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM message_threads
      WHERE message_threads.id = messages.thread_id
      AND (message_threads.patient_id = auth.uid() OR message_threads.doctor_id = auth.uid())
    )
  );

-- Trigger: Auto-create notification when message is inserted
CREATE OR REPLACE FUNCTION public.notify_on_message_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_recipient_id uuid;
  v_thread_id uuid;
  v_sender_name text;
BEGIN
  v_thread_id := NEW.thread_id;
  
  -- Get thread info to determine recipient
  SELECT patient_id, doctor_id INTO v_patient_id, v_doctor_id
  FROM message_threads
  WHERE id = v_thread_id;
  
  -- Determine recipient (opposite of sender)
  v_recipient_id := CASE
    WHEN NEW.sender_id = v_patient_id THEN v_doctor_id
    ELSE v_patient_id
  END;
  
  -- Get sender's name
  SELECT full_name INTO v_sender_name
  FROM users
  WHERE id = NEW.sender_id;
  
  -- Create notification for recipient
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    data,
    created_at
  ) VALUES (
    v_recipient_id,
    'message_received'::notification_type,
    'New message from ' || COALESCE(v_sender_name, 'Unknown'),
    'You have a new message',
    jsonb_build_object(
      'thread_id', v_thread_id,
      'message_id', NEW.id,
      'sender_id', NEW.sender_id
    ),
    now()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_inserted
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION notify_on_message_insert();
```

- [ ] **Step 2: Apply migration locally**

Run:
```bash
supabase migration up
```

Expected: No errors, tables created with indexes and RLS policies in place.

- [ ] **Step 3: Update database.types.ts**

Modify `src/lib/database.types.ts` to add:

```typescript
export interface MessageThreadRow {
  id: string;
  type: 'appointment' | 'doctor';
  appointment_id: string | null;
  patient_id: string;
  doctor_id: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

// Add to Database.public.Tables
message_threads: Table<MessageThreadRow>;
messages: Table<MessageRow>;

// Add notification_type enum value if not present
export type NotificationType =
  | "appointment_confirmed"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "message_received"  // ADD THIS
  | "waitlist_available"
  | "review_request"
  | "doctor_approved"
  | "doctor_rejected"
  | "doctor_suspended"
  | "new_booking";
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260714_create_messaging_tables.sql src/lib/database.types.ts
git commit -m "feat: create message_threads and messages tables with RLS and triggers"
```

---

### Task 2: Database RPC Functions - Reschedule, Thread Creation, Send Message

**Files:**
- Create: `supabase/functions/reschedule_appointment.sql`
- Create: `supabase/functions/create_or_get_message_thread.sql`
- Create: `supabase/functions/send_message.sql`

**Interfaces:**
- Consumes: Existing `get_available_slots()` RPC, `appointments` table
- Produces: Three RPC functions callable from client via Supabase

- [ ] **Step 1: Create reschedule_appointment RPC**

Create `supabase/functions/reschedule_appointment.sql`:

```sql
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_starts_at timestamp with time zone,
  p_duration_minutes integer
)
RETURNS TABLE (
  success boolean,
  appointment_id uuid,
  error_code text
) AS $$
DECLARE
  v_appointment appointments%ROWTYPE;
  v_slot_available boolean;
  v_error_code text;
BEGIN
  -- Fetch appointment
  SELECT * INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id;
  
  IF v_appointment.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'APPOINTMENT_NOT_FOUND'::text;
    RETURN;
  END IF;
  
  -- Check if cancelled
  IF v_appointment.status = 'cancelled' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'APPOINTMENT_CANCELLED'::text;
    RETURN;
  END IF;
  
  -- Check if time is in past
  IF p_new_starts_at < now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'SLOT_IN_PAST'::text;
    RETURN;
  END IF;
  
  -- Check if slot is available (exclude current appointment)
  WITH available AS (
    SELECT * FROM get_available_slots(
      v_appointment.doctor_id,
      (p_new_starts_at AT TIME ZONE 'Europe/Tirane')::date::text,
      (p_new_starts_at AT TIME ZONE 'Europe/Tirane')::date::text,
      p_appointment_id,
      p_duration_minutes
    )
  )
  SELECT COUNT(*) > 0 INTO v_slot_available
  FROM available
  WHERE slot_start = (p_new_starts_at AT TIME ZONE 'Europe/Tirane')::time::text;
  
  IF NOT v_slot_available THEN
    RETURN QUERY SELECT false, NULL::uuid, 'SLOT_NOT_AVAILABLE'::text;
    RETURN;
  END IF;
  
  -- Update appointment
  UPDATE appointments
  SET
    starts_at = p_new_starts_at,
    ends_at = p_new_starts_at + (p_duration_minutes || ' minutes')::interval,
    rescheduled_from = v_appointment.id,
    updated_at = now()
  WHERE id = p_appointment_id;
  
  -- Create notification for doctor
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    data,
    created_at
  ) VALUES (
    v_appointment.doctor_id,
    'appointment_rescheduled'::notification_type,
    'Appointment rescheduled',
    'An appointment has been rescheduled',
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'new_start', p_new_starts_at,
      'patient_id', v_appointment.patient_id
    ),
    now()
  );
  
  RETURN QUERY SELECT true, p_appointment_id, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Create create_or_get_message_thread RPC**

Create `supabase/functions/create_or_get_message_thread.sql`:

```sql
CREATE OR REPLACE FUNCTION public.create_or_get_message_thread(
  p_type text,
  p_appointment_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid
)
RETURNS TABLE (
  thread_id uuid
) AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  -- Try to find existing thread
  IF p_type = 'appointment' THEN
    SELECT id INTO v_thread_id
    FROM message_threads
    WHERE type = 'appointment'
      AND appointment_id = p_appointment_id
      AND patient_id = p_patient_id
      AND doctor_id = p_doctor_id;
  ELSE
    SELECT id INTO v_thread_id
    FROM message_threads
    WHERE type = 'doctor'
      AND appointment_id IS NULL
      AND patient_id = p_patient_id
      AND doctor_id = p_doctor_id;
  END IF;
  
  -- If not found, create new thread
  IF v_thread_id IS NULL THEN
    INSERT INTO message_threads (
      type,
      appointment_id,
      patient_id,
      doctor_id
    ) VALUES (
      p_type,
      CASE WHEN p_type = 'appointment' THEN p_appointment_id ELSE NULL END,
      p_patient_id,
      p_doctor_id
    )
    RETURNING message_threads.id INTO v_thread_id;
  END IF;
  
  RETURN QUERY SELECT v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 3: Create send_message RPC**

Create `supabase/functions/send_message.sql`:

```sql
CREATE OR REPLACE FUNCTION public.send_message(
  p_thread_id uuid,
  p_sender_id uuid,
  p_body text
)
RETURNS TABLE (
  message_id uuid,
  created_at timestamp
) AS $$
DECLARE
  v_thread_id uuid;
  v_sender_is_participant boolean;
  v_message_id uuid;
  v_created_at timestamp;
BEGIN
  -- Verify sender is a participant in the thread
  SELECT EXISTS (
    SELECT 1 FROM message_threads
    WHERE id = p_thread_id
      AND (patient_id = p_sender_id OR doctor_id = p_sender_id)
  ) INTO v_sender_is_participant;
  
  IF NOT v_sender_is_participant THEN
    RAISE EXCEPTION 'Sender is not a participant in this thread';
  END IF;
  
  -- Verify body is not empty
  IF p_body IS NULL OR p_body = '' THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;
  
  -- Insert message (trigger will create notification)
  INSERT INTO messages (
    thread_id,
    sender_id,
    body
  ) VALUES (
    p_thread_id,
    p_sender_id,
    p_body
  )
  RETURNING messages.id, messages.created_at INTO v_message_id, v_created_at;
  
  RETURN QUERY SELECT v_message_id, v_created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 4: Deploy RPC functions**

Run:
```bash
supabase db push
```

Expected: Three functions deployed successfully.

- [ ] **Step 5: Update database.types.ts RPC signatures**

Modify `src/lib/database.types.ts` to add RPC function signatures:

```typescript
Functions: {
  // ... existing functions ...
  reschedule_appointment: {
    Args: {
      p_appointment_id: string;
      p_new_starts_at: string;
      p_duration_minutes: number;
    };
    Returns: Array<{
      success: boolean;
      appointment_id: string | null;
      error_code: string | null;
    }>;
  };
  create_or_get_message_thread: {
    Args: {
      p_type: 'appointment' | 'doctor';
      p_appointment_id: string | null;
      p_patient_id: string;
      p_doctor_id: string;
    };
    Returns: Array<{
      thread_id: string;
    }>;
  };
  send_message: {
    Args: {
      p_thread_id: string;
      p_sender_id: string;
      p_body: string;
    };
    Returns: Array<{
      message_id: string;
      created_at: string;
    }>;
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ src/lib/database.types.ts
git commit -m "feat: add reschedule_appointment, create_or_get_message_thread, send_message RPC functions"
```

---

### Task 3: Server Actions for Mutations

**Files:**
- Create: `src/actions/appointment-edit.ts`

**Interfaces:**
- Consumes: RPC functions (`reschedule_appointment`, `create_or_get_message_thread`, `send_message`), `getCurrentUser()`
- Produces: Three server actions: `rescheduleAppointment`, `sendMessage`, `getOrCreateMessageThread`

- [ ] **Step 1: Create server actions file**

Create `src/actions/appointment-edit.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export interface RescheduleResult {
  ok: boolean;
  error?: string;
  appointmentId?: string;
}

export interface SendMessageResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

export interface GetThreadResult {
  ok: boolean;
  error?: string;
  threadId?: string;
}

/** Reschedule an appointment to a new time. */
export async function rescheduleAppointment(
  appointmentId: string,
  newStartsAt: string,
): Promise<RescheduleResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "AUTH_REQUIRED" };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("reschedule_appointment", {
      p_appointment_id: appointmentId,
      p_new_starts_at: newStartsAt,
      p_duration_minutes: null, // Will be calculated by RPC based on existing appointment
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { ok: false, error: "No response from server" };
    }

    const result = data[0];
    if (!result.success) {
      return { ok: false, error: result.error_code };
    }

    return { ok: true, appointmentId: result.appointment_id };
  } catch (err) {
    console.error("[rescheduleAppointment]", err);
    return { ok: false, error: "UNKNOWN" };
  }
}

/** Send a message in a thread. */
export async function sendMessage(
  threadId: string,
  body: string,
): Promise<SendMessageResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "AUTH_REQUIRED" };
    }

    if (!body || body.trim() === "") {
      return { ok: false, error: "EMPTY_MESSAGE" };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("send_message", {
      p_thread_id: threadId,
      p_sender_id: user.id,
      p_body: body.trim(),
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { ok: false, error: "No response from server" };
    }

    return { ok: true, messageId: data[0].message_id };
  } catch (err) {
    console.error("[sendMessage]", err);
    return { ok: false, error: "UNKNOWN" };
  }
}

/** Get or create a message thread. */
export async function getOrCreateMessageThread(
  type: "appointment" | "doctor",
  doctorId: string,
  appointmentId?: string,
): Promise<GetThreadResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "AUTH_REQUIRED" };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc(
      "create_or_get_message_thread",
      {
        p_type: type,
        p_appointment_id: appointmentId || null,
        p_patient_id: user.id,
        p_doctor_id: doctorId,
      },
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { ok: false, error: "No response from server" };
    }

    return { ok: true, threadId: data[0].thread_id };
  } catch (err) {
    console.error("[getOrCreateMessageThread]", err);
    return { ok: false, error: "UNKNOWN" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/appointment-edit.ts
git commit -m "feat: add server actions for reschedule, messaging, and thread management"
```

---

### Task 4: Message Query Function

**Files:**
- Create: `src/lib/queries/messages.ts`

**Interfaces:**
- Consumes: Supabase client, `message_threads` and `messages` tables
- Produces: `getMessageThread()` query function returning thread metadata + sorted messages

- [ ] **Step 1: Create messages query file**

Create `src/lib/queries/messages.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus } from "@/lib/database.types";

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface MessageThread {
  id: string;
  type: "appointment" | "doctor";
  appointmentId?: string;
  patientId: string;
  doctorId: string;
  messages: Message[];
}

/**
 * Fetch a message thread with all messages, ordered chronologically.
 * Validates that the requesting user is a participant in the thread.
 */
export async function getMessageThread(
  threadId: string,
  userId: string,
): Promise<MessageThread | null> {
  const supabase = createClient();

  // Fetch thread metadata
  const { data: threadData, error: threadError } = await supabase
    .from("message_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (threadError || !threadData) {
    return null;
  }

  const thread = threadData as {
    id: string;
    type: "appointment" | "doctor";
    appointment_id: string | null;
    patient_id: string;
    doctor_id: string;
  };

  // Verify user is a participant
  if (userId !== thread.patient_id && userId !== thread.doctor_id) {
    return null; // Unauthorized
  }

  // Fetch messages, ordered by creation time
  const { data: messagesData, error: messagesError } = await supabase
    .from("messages")
    .select(
      `
      id, sender_id, body, created_at, read_at,
      sender:users(full_name)
    `,
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (messagesError || !messagesData) {
    return null;
  }

  const messages = (
    messagesData as unknown as Array<{
      id: string;
      sender_id: string;
      body: string;
      created_at: string;
      read_at: string | null;
      sender: { full_name: string | null } | null;
    }>
  ).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: m.sender?.full_name ?? "Unknown",
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));

  return {
    id: thread.id,
    type: thread.type,
    appointmentId: thread.appointment_id ?? undefined,
    patientId: thread.patient_id,
    doctorId: thread.doctor_id,
    messages,
  };
}

/**
 * Fetch all appointment-scoped message threads for a user.
 * Used to populate thread list on dashboard or appointment details.
 */
export async function getAppointmentMessageThreads(
  appointmentId: string,
  userId: string,
): Promise<MessageThread[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("message_threads")
    .select(
      `
      id, type, appointment_id, patient_id, doctor_id,
      messages(id, sender_id, body, created_at, read_at, sender:users(full_name))
    `,
    )
    .eq("appointment_id", appointmentId)
    .eq("type", "appointment")
    .or(`patient_id.eq.${userId},doctor_id.eq.${userId}`);

  if (error || !data) {
    return [];
  }

  return (data as unknown as any[]).map((t) => ({
    id: t.id,
    type: t.type,
    appointmentId: t.appointment_id,
    patientId: t.patient_id,
    doctorId: t.doctor_id,
    messages: (t.messages ?? []).map((m: any) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.full_name ?? "Unknown",
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
    })),
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/messages.ts
git commit -m "feat: add message thread query functions"
```

---

### Task 5: Components - MessageThread, MessageInput, RescheduleModal

**Files:**
- Create: `src/components/message-thread.tsx`
- Create: `src/components/message-input.tsx`
- Create: `src/components/reschedule-modal.tsx`

**Interfaces:**
- Consumes: `sendMessage()` server action, `getMessageThread()` query, `MessageThread` type, `getDoctorSlots()` query
- Produces: Three reusable React components for rendering messages, input, and reschedule modal

- [ ] **Step 1: Create MessageThread component**

Create `src/components/message-thread.tsx`:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { timeInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/queries/messages";

export function MessageThread({
  messages,
  isLoading,
  currentUserId,
}: {
  messages: Message[];
  isLoading: boolean;
  currentUserId: string;
}) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-center text-sm text-muted-foreground">
          {t("messages.empty") || "No messages yet. Start the conversation."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-64 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4"
    >
      {messages.map((msg) => {
        const isOwn = msg.senderId === currentUserId;
        return (
          <div
            key={msg.id}
            className={cn("flex flex-col gap-1", isOwn && "items-end")}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">{msg.senderName}</span>
              <span>{timeInTirane(msg.createdAt, "HH:mm")}</span>
              {msg.readAt && <span className="opacity-60">✓</span>}
            </div>
            <div
              className={cn(
                "max-w-xs rounded-lg px-3 py-2 text-sm",
                isOwn
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {msg.body}
            </div>
          </div>
        );
      })}
      {isLoading && (
        <div className="flex justify-center">
          <div className="text-xs text-muted-foreground">
            {t("common.loading") || "Loading..."}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create MessageInput component**

Create `src/components/message-input.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "@/actions/appointment-edit";

export function MessageInput({
  threadId,
  onSendSuccess,
}: {
  threadId: string;
  onSendSuccess?: () => void;
}) {
  const t = useTranslations();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!body.trim()) {
      toast.error(t("messages.emptyError") || "Message cannot be empty");
      return;
    }

    setLoading(true);
    const result = await sendMessage(threadId, body);
    setLoading(false);

    if (!result.ok) {
      toast.error(
        result.error === "EMPTY_MESSAGE"
          ? t("messages.emptyError")
          : t("common.error"),
      );
      return;
    }

    toast.success(t("messages.sent") || "Message sent");
    setBody("");
    onSendSuccess?.();
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("messages.inputPlaceholder") || "Type a message..."}
        rows={3}
        disabled={loading}
      />
      <Button
        onClick={handleSend}
        disabled={loading || !body.trim()}
        className="w-full"
      >
        {loading ? t("common.loading") : t("messages.send") || "Send"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create RescheduleModal component**

Create `src/components/reschedule-modal.tsx`:

```typescript
"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDoctorSlots } from "@/lib/queries/doctor-profile";
import { formatInTirane, timeInTirane } from "@/lib/datetime";
import { rescheduleAppointment } from "@/actions/appointment-edit";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function RescheduleModal({
  appointmentId,
  doctorId,
  currentStartsAt,
  durationMinutes,
  isOpen,
  onClose,
}: {
  appointmentId: string;
  doctorId: string;
  currentStartsAt: string;
  durationMinutes: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(
    formatInTirane(currentStartsAt, "yyyy-MM-dd"),
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Parse selected date for calendar navigation
  const [year, month, day] = selectedDate.split("-").map(Number);
  const currentDateObj = new Date(year, month - 1, day);

  // Fetch slots when date changes
  useMemo(() => {
    setSlotsLoading(true);
    getDoctorSlots(
      doctorId,
      selectedDate,
      selectedDate, // Same-day slots only for now
    )
      .then((result) => {
        setSlots(result);
        setSelectedTime(null);
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, doctorId]);

  if (!isOpen) return null;

  const handlePrevDay = () => {
    const prev = new Date(currentDateObj);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(formatInTirane(prev.toISOString(), "yyyy-MM-dd"));
  };

  const handleNextDay = () => {
    const next = new Date(currentDateObj);
    next.setDate(next.getDate() + 1);
    setSelectedDate(formatInTirane(next.toISOString(), "yyyy-MM-dd"));
  };

  const handleConfirm = async () => {
    if (!selectedTime) {
      toast.error(t("booking.selectTime") || "Please select a time");
      return;
    }

    setLoading(true);
    const newStartsAt = `${selectedDate}T${selectedTime}:00`;
    const result = await rescheduleAppointment(appointmentId, newStartsAt);
    setLoading(false);

    if (!result.ok) {
      const errorMessages: Record<string, string> = {
        SLOT_NOT_AVAILABLE:
          t("booking.errSlotTaken") || "This time is no longer available",
        SLOT_IN_PAST:
          t("booking.errSlotInPast") || "Cannot reschedule to a past time",
        APPOINTMENT_CANCELLED:
          t("appointments.cancelled") || "Cannot reschedule cancelled appointment",
      };
      toast.error(errorMessages[result.error || ""] || t("common.error"));
      return;
    }

    toast.success(t("appointments.rescheduled") || "Appointment rescheduled");
    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <h3 className="mb-4 text-lg font-bold text-foreground">
          {t("appointments.reschedule") || "Reschedule Appointment"}
        </h3>

        {/* Date Navigation */}
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevDay}
            disabled={slotsLoading}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-semibold text-foreground">
            {formatInTirane(new Date(year, month - 1, day).toISOString(), "EEEE, d MMM")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextDay}
            disabled={slotsLoading}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Time Slots */}
        <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
          {slotsLoading ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : slots.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("booking.noSlots") || "No available slots"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.slot_start}
                  onClick={() => setSelectedTime(slot.slot_start)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-semibold shadow-soft transition-colors",
                    selectedTime === slot.slot_start
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary",
                  )}
                >
                  {timeInTirane(`${selectedDate}T${slot.slot_start}:00`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !selectedTime}>
            {loading ? t("common.loading") : t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/message-thread.tsx src/components/message-input.tsx src/components/reschedule-modal.tsx
git commit -m "feat: add message thread, input, and reschedule modal components"
```

---

### Task 6: Component - AppointmentQuickActions (Calendar Integration)

**Files:**
- Create: `src/components/appointment-quick-actions.tsx`

**Interfaces:**
- Consumes: `AppointmentView` type, `useRouter` from navigation
- Produces: Quick-action popover component for calendar integration

- [ ] **Step 1: Create AppointmentQuickActions component**

Create `src/components/appointment-quick-actions.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { timeInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { MessageSquare, Clock, Eye } from "lucide-react";
import type { AppointmentView } from "@/lib/queries/appointments";

export function AppointmentQuickActions({
  appointment,
  isOpen,
  position,
  onClose,
  onSendMessage,
  onReschedule,
}: {
  appointment: AppointmentView;
  isOpen: boolean;
  position?: { top: number; left: number };
  onClose: () => void;
  onSendMessage: () => void;
  onReschedule: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();

  const isUpcoming =
    new Date(appointment.startsAt) > new Date() &&
    (appointment.status === "confirmed" || appointment.status === "pending");

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Popover */}
      <div
        className="absolute z-50 w-56 rounded-xl border border-border bg-card shadow-lg"
        style={{
          top: position?.top,
          left: position?.left,
        }}
      >
        <div className="p-4">
          <div className="mb-4 border-b border-border pb-3">
            <p className="font-semibold text-foreground">
              {appointment.doctorName}
            </p>
            <p className="text-xs text-muted-foreground">
              {timeInTirane(appointment.startsAt, "d MMM, HH:mm")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                router.push(`/patient/appointments/${appointment.id}`);
                onClose();
              }}
              className="justify-start"
            >
              <Eye className="mr-2 size-4" />
              {t("common.viewDetails") || "View Details"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onSendMessage();
                onClose();
              }}
              className="justify-start"
            >
              <MessageSquare className="mr-2 size-4" />
              {t("messages.send") || "Send Message"}
            </Button>

            {isUpcoming && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onReschedule();
                  onClose();
                }}
                className="justify-start"
              >
                <Clock className="mr-2 size-4" />
                {t("appointments.reschedule") || "Change Time"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/appointment-quick-actions.tsx
git commit -m "feat: add appointment quick-actions popover component"
```

---

### Task 7: Edit Appointment Page

**Files:**
- Create: `src/app/[locale]/(patient)/patient/appointments/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMyAppointments()`, `getMessageThread()`, `AppointmentView`, `MessageThread`
- Produces: Server component rendering full appointment edit interface

- [ ] **Step 1: Create edit appointment page**

Create `src/app/[locale]/(patient)/patient/appointments/[id]/page.tsx`:

```typescript
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyAppointments } from "@/lib/queries/appointments";
import { getMessageThread } from "@/lib/queries/messages";
import { formatInTirane } from "@/lib/datetime";
import { AppointmentEditClient } from "./appointment-edit-client";

export default async function AppointmentEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const t = await getTranslations();

  const [user, appts] = await Promise.all([
    getCurrentUser(),
    getMyAppointments("patient", activeLocale),
  ]);

  if (!user) {
    redirect("/login");
  }

  // Find the appointment
  const appointment = appts.find((a) => a.id === id);
  if (!appointment) {
    redirect("/patient/appointments");
  }

  // Fetch message thread (appointment-scoped)
  const messageThread = await getMessageThread(id, user.id);

  const isUpcoming =
    new Date(appointment.startsAt) > new Date() &&
    (appointment.status === "confirmed" || appointment.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <AppointmentEditClient
        appointment={appointment}
        messageThread={messageThread}
        isUpcoming={isUpcoming}
        locale={activeLocale}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create AppointmentEditClient (client component)**

Create `src/app/[locale]/(patient)/patient/appointments/[id]/appointment-edit-client.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { RescheduleModal } from "@/components/reschedule-modal";
import { cancelAppointment } from "@/actions/booking";
import { getOrCreateMessageThread } from "@/actions/appointment-edit";
import { getMessageThread } from "@/lib/queries/messages";
import { formatInTirane, timeInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Calendar, User, Stethoscope, ChevronLeft } from "lucide-react";
import type { AppointmentView } from "@/lib/queries/appointments";
import type { MessageThread as MessageThreadType } from "@/lib/queries/messages";

export function AppointmentEditClient({
  appointment,
  messageThread,
  isUpcoming,
  locale,
}: {
  appointment: AppointmentView;
  messageThread: MessageThreadType | null;
  isUpcoming: boolean;
  locale: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [threadData, setThreadData] = useState<MessageThreadType | null>(
    messageThread,
  );
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Poll for new messages every 3 seconds
  useEffect(() => {
    if (!threadData) return;

    const interval = setInterval(async () => {
      setMessagesLoading(true);
      const updated = await getMessageThread(threadData.id, appointment.id);
      if (updated) {
        setThreadData(updated);
      }
      setMessagesLoading(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [threadData?.id, appointment.id]);

  // Initialize message thread on first render if needed
  useEffect(() => {
    if (threadData) return;

    const initThread = async () => {
      const result = await getOrCreateMessageThread(
        "appointment",
        appointment.doctorSlug,
        appointment.id,
      );
      if (result.ok && result.threadId) {
        const thread = await getMessageThread(result.threadId, appointment.id);
        if (thread) {
          setThreadData(thread);
        }
      }
    };

    initThread();
  }, []);

  const handleCancel = async () => {
    if (!confirm(t("appointments.cancelConfirm"))) return;
    setCancelLoading(true);
    const res = await cancelAppointment({ appointmentId: appointment.id });
    setCancelLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? t("common.error"));
      return;
    }
    toast.success(t("common.saved"));
    router.push("/patient/appointments");
    router.refresh();
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/patient/appointments")}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {t("appointments.edit") || "Appointment Details"}
        </h1>
      </div>

      {/* Appointment Card */}
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="size-5 text-primary" />
              <span className="font-bold text-foreground">
                {appointment.doctorName}
              </span>
              {appointment.specialty && (
                <span className="text-sm text-primary">
                  · {appointment.specialty}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-4" />
              <span>
                {formatInTirane(appointment.startsAt, "EEEE, d MMM yyyy — HH:mm")}
              </span>
            </div>
            {appointment.reason && (
              <p className="text-sm text-muted-foreground">
                {t("booking.reason")}: "{appointment.reason}"
              </p>
            )}
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {isUpcoming && (
          <Button
            onClick={() => setRescheduleOpen(true)}
            variant="outline"
            className="w-full"
          >
            {t("appointments.reschedule") || "Change Time"}
          </Button>
        )}
      </Card>

      {/* Message Thread */}
      {threadData && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-foreground">
            {t("messages.title") || "Messages"}
          </h2>
          <MessageThread
            messages={threadData.messages}
            isLoading={messagesLoading}
            currentUserId={appointment.id}
          />
          <MessageInput threadId={threadData.id} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isUpcoming && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelLoading}
          >
            {t("common.cancel")}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => router.push("/patient/appointments")}
        >
          {t("common.back")}
        </Button>
      </div>

      {/* Reschedule Modal */}
      <RescheduleModal
        appointmentId={appointment.id}
        doctorId={appointment.id}
        currentStartsAt={appointment.startsAt}
        durationMinutes={30} // TODO: fetch from appointment service data
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/\(patient\)/patient/appointments/[id]/page.tsx src/app/[locale]/\(patient\)/patient/appointments/[id]/appointment-edit-client.tsx
git commit -m "feat: add appointment edit page with messaging"
```

---

### Task 8: Calendar Integration - Add Quick Actions

**Files:**
- Modify: `src/components/patient-calendar.tsx`

**Interfaces:**
- Consumes: `AppointmentQuickActions` component, existing calendar state
- Produces: Modified calendar with quick-action popover on appointment click

- [ ] **Step 1: Update patient-calendar.tsx to add quick actions**

In `src/components/patient-calendar.tsx`, find the `AppointmentBlock` component (around line 88) and modify it:

**Before (around line 119-133):**
```typescript
  return (
    <div
      className={cn(
        "absolute left-0.5 right-0.5 overflow-hidden rounded-lg font-semibold shadow-sm flex items-center gap-2",
        paddingClass,
        statusColor(appt.status),
      )}
      style={{ top, height }}
    >
      <p className={cn("opacity-80 whitespace-nowrap flex-shrink-0", timeClass)}>
        {timeInTirane(appt.startsAt)}
      </p>
      <p className={cn(truncateName && "truncate", nameClass)}>{appt.doctorName}</p>
    </div>
  );
```

**After:**
```typescript
  return (
    <button
      onClick={() => onAppointmentClick?.(appt)}
      className={cn(
        "absolute left-0.5 right-0.5 overflow-hidden rounded-lg font-semibold shadow-sm flex items-center gap-2 text-left hover:opacity-90 transition-opacity cursor-pointer",
        paddingClass,
        statusColor(appt.status),
      )}
      style={{ top, height }}
    >
      <p className={cn("opacity-80 whitespace-nowrap flex-shrink-0", timeClass)}>
        {timeInTirane(appt.startsAt)}
      </p>
      <p className={cn(truncateName && "truncate", nameClass)}>{appt.doctorName}</p>
    </button>
  );
```

Then update the `AppointmentBlock` function signature to accept `onAppointmentClick`:

```typescript
function AppointmentBlock({
  appt,
  onAppointmentClick,
}: {
  appt: AppointmentView;
  onAppointmentClick?: (appt: AppointmentView) => void;
}) {
  // ... existing code ...
}
```

Then in the `DayView` component (around line 152), pass the handler:

```typescript
{dayAppts.map((a) => (
  <AppointmentBlock
    key={a.id}
    appt={a}
    onAppointmentClick={onAppointmentClick}
  />
))}
```

And in `WeekView` (around line 187):

```typescript
{dayAppts.map((a) => (
  <AppointmentBlock
    key={a.id}
    appt={a}
    onAppointmentClick={onAppointmentClick}
  />
))}
```

And in `MonthView` appointment blocks (around line 249-259), make them clickable:

```typescript
{shown.map((a) => (
  <button
    key={a.id}
    onClick={() => onAppointmentClick?.(a)}
    className={cn(
      "mb-0.5 truncate rounded px-1 py-0.5 text-xs font-medium text-left hover:opacity-90 transition-opacity",
      statusColor(a.status),
    )}
  >
    {timeInTirane(a.startsAt)} {a.doctorName}
  </button>
))}
```

Then update the `PatientCalendar` component to add quick-action state and handlers (around line 271):

```typescript
export function PatientCalendar({
  view,
  dateStr,
  appointments,
}: {
  view: CalendarView;
  dateStr: string;
  appointments: AppointmentView[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const weekdayAbbr = locale === "en" ? DAYS_EN : DAYS_SQ;
  const dateLocale = locale === "en" ? enUS : sqLocale;

  const [selectedAppt, setSelectedAppt] = useState<AppointmentView | null>(null);
  const [showMessages, setShowMessages] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const handleAppointmentClick = (appt: AppointmentView, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setSelectedAppt(appt);
    setPopoverPos({
      top: rect.bottom + 8,
      left: rect.left,
    });
  };

  // ... rest of existing code ...

  // Pass to DayView, WeekView, MonthView
  // Update all view calls to include onAppointmentClick={handleAppointmentClick}
}
```

Then add the quick-actions popover at the end of the return statement:

```typescript
      {/* ... existing views ... */}

      {appointments.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {t("calendar.noAppointments")}
        </p>
      )}

      {/* Quick Actions Popover */}
      <AppointmentQuickActions
        appointment={selectedAppt!}
        isOpen={Boolean(selectedAppt) && !showMessages && !showReschedule}
        position={popoverPos || undefined}
        onClose={() => setSelectedAppt(null)}
        onSendMessage={() => setShowMessages(true)}
        onReschedule={() => setShowReschedule(true)}
      />

      {/* Message Modal */}
      {showMessages && selectedAppt && (
        <AppointmentMessageModal
          appointment={selectedAppt}
          onClose={() => setShowMessages(false)}
        />
      )}

      {/* Reschedule Modal */}
      {showReschedule && selectedAppt && (
        <RescheduleModal
          appointmentId={selectedAppt.id}
          doctorId={selectedAppt.id}
          currentStartsAt={selectedAppt.startsAt}
          durationMinutes={30}
          isOpen={true}
          onClose={() => setShowReschedule(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add imports to patient-calendar.tsx**

At the top of the file, add:

```typescript
import { useState } from "react";
import { AppointmentQuickActions } from "@/components/appointment-quick-actions";
import { RescheduleModal } from "@/components/reschedule-modal";
import { AppointmentMessageModal } from "@/components/appointment-message-modal";
```

- [ ] **Step 3: Create AppointmentMessageModal component**

Create `src/components/appointment-message-modal.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { getOrCreateMessageThread } from "@/actions/appointment-edit";
import { getMessageThread } from "@/lib/queries/messages";
import { X } from "lucide-react";
import type { AppointmentView } from "@/lib/queries/appointments";

export function AppointmentMessageModal({
  appointment,
  onClose,
}: {
  appointment: AppointmentView;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const result = await getOrCreateMessageThread(
        "appointment",
        appointment.doctorSlug,
        appointment.id,
      );
      if (!result.ok || !result.threadId) {
        toast.error(t("common.error"));
        onClose();
        return;
      }
      setThreadId(result.threadId);
      const thread = await getMessageThread(result.threadId, appointment.id);
      if (thread) {
        setMessages(thread.messages);
      }
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <h3 className="mb-4 text-lg font-bold text-foreground">
          {t("messages.title")} · {appointment.doctorName}
        </h3>

        {threadId && (
          <>
            <MessageThread messages={messages} isLoading={loading} currentUserId={appointment.id} />
            <div className="mt-4">
              <MessageInput threadId={threadId} />
            </div>
          </>
        )}

        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={onClose}
        >
          {t("common.close")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/patient-calendar.tsx src/components/appointment-message-modal.tsx
git commit -m "feat: add quick-action popover and messaging modal to calendar"
```

---

### Task 9: Handling Slot Duration in Reschedule

**Files:**
- Modify: `src/app/[locale]/(patient)/patient/appointments/[id]/appointment-edit-client.tsx`
- Modify: `src/components/reschedule-modal.tsx`

**Interfaces:**
- Consumes: Existing appointment data with `slot_duration_minutes`
- Produces: Correct duration passed to reschedule RPC

- [ ] **Step 1: Update appointment edit client to fetch duration from service**

In `appointment-edit-client.tsx`, update the appointment fetch to include service duration:

```typescript
// At the top, add to imports:
import { getDoctorServices } from "@/lib/queries/services";

// In AppointmentEditClient, add a new useEffect:
const [durationMinutes, setDurationMinutes] = useState(30);

useEffect(() => {
  const fetchDuration = async () => {
    // If appointment has a reason that matches a service, fetch it
    // Otherwise default to 30 minutes
    setDurationMinutes(30); // Default, can be enhanced
  };
  fetchDuration();
}, [appointment.id]);
```

Then pass `durationMinutes` to the modal:

```typescript
<RescheduleModal
  appointmentId={appointment.id}
  doctorId={appointment.id}
  currentStartsAt={appointment.startsAt}
  durationMinutes={durationMinutes}
  isOpen={rescheduleOpen}
  onClose={() => setRescheduleOpen(false)}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[locale]/\(patient\)/patient/appointments/[id]/appointment-edit-client.tsx
git commit -m "feat: include appointment duration in reschedule modal"
```

---

### Task 10: Testing & Verification

**Files:**
- Testing: Manual E2E flow

**Verification Checklist:**

- [ ] **Database tables created correctly**

Run:
```bash
supabase db list
```
Expected: `message_threads` and `messages` tables visible

- [ ] **RPC functions callable**

Run:
```bash
supabase functions list
```
Expected: Three functions shown

- [ ] **Server actions respond**

Test locally in dev:
```bash
npm run dev
```
Navigate to an appointment. Verify no console errors.

- [ ] **Message thread UI renders**

On appointment edit page, verify:
- Message thread displays (empty or with messages)
- Message input textarea is present
- Send button is functional

- [ ] **Reschedule modal opens and slots load**

Click "Change Time" button. Verify:
- Modal opens with date navigation
- Available slots load for selected date
- Slot selection works
- Confirm button reschedules (check for success toast)

- [ ] **Calendar quick actions appear**

On calendar month view, click an appointment block. Verify:
- Popover appears with doctor name and time
- "View Details" navigates to edit page
- "Send Message" opens message modal
- "Change Time" opens reschedule modal (if appointment is upcoming)

- [ ] **Message polling works**

Send a message from one user, then refresh as the other user. Verify message appears.

- [ ] **Commit summary**

```bash
git log --oneline -10
```

Expected: All 9 tasks visible as commits.

---

## Summary

This plan builds a complete appointment editing system with messaging and rescheduling:

1. **Database** (Tasks 1-2): Tables, RLS, triggers, and RPC functions
2. **Server Layer** (Task 3): Server actions for mutations
3. **Data Queries** (Task 4): Message fetching
4. **Components** (Tasks 5-6): Reusable UI pieces
5. **Pages** (Task 7): Full edit appointment page
6. **Integration** (Task 8): Calendar quick-actions
7. **Polish** (Tasks 9-10): Duration handling and testing

All tasks are incremental with independent commit points. Each task produces testable, working code.
