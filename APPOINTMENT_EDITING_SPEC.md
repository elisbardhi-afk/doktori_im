# Appointment Editing & Messaging System Design

**Date:** 2026-07-14  
**Scope:** Patient-facing appointment edit page, two-way messaging with doctors, and time/date rescheduling

---

## Overview

This design enables patients to:
1. View and edit their appointments on a dedicated page
2. Reschedule appointments to a new date/time (with instant availability validation)
3. Send and receive messages with appointed doctors in two contexts:
   - Appointment-specific threads (scoped to a particular appointment)
   - Doctor-level threads (ongoing conversation across all appointments with a doctor)
4. Access all edit/message features from both a dedicated page and inline from the calendar

---

## Database Schema

### New Tables

#### `message_threads`
Metadata container for message conversations. Supports two scopes: appointment-specific or doctor-level.

```
id (uuid, primary key)
type ('appointment' | 'doctor')
appointment_id (uuid, nullable, fk appointments)
  - Required if type='appointment'
  - NULL if type='doctor'
patient_id (uuid, not null, fk users)
doctor_id (uuid, not null, fk users)
created_at (timestamp)
updated_at (timestamp)

Constraints:
- Unique constraint: (type, appointment_id, patient_id, doctor_id) if type='appointment'
- Unique constraint: (type, patient_id, doctor_id) if type='doctor' (one general thread per doctor pair)
- Foreign keys: appointment_id → appointments, patient_id → users, doctor_id → users
- RLS: Patients/doctors can only see threads they're part of
```

#### `messages`
Individual messages within a thread. Tracks read status for notification purposes.

```
id (uuid, primary key)
thread_id (uuid, not null, fk message_threads)
sender_id (uuid, not null, fk users)
body (text, not null)
created_at (timestamp)
read_at (timestamp, nullable)

Constraints:
- Foreign keys: thread_id → message_threads, sender_id → users
- RLS: Users can only read messages in threads they're part of
- Index on (thread_id, created_at) for efficient sorting
- Trigger on INSERT: Auto-create notification for recipient if read_at is NULL
```

### Database Triggers

**Trigger: `on_message_inserted`**
- When a message is inserted with `read_at = NULL`
- Create a notification for the recipient (the other participant in the thread)
- Notification type: `message_received` or similar
- Recipient can dismiss/read notification to set `messages.read_at`

---

## Server Functions (RPC & Actions)

### RPC Functions (Supabase)

#### `reschedule_appointment(p_appointment_id uuid, p_new_starts_at timestamp, p_duration_minutes int)`

Atomically reschedules an appointment to a new slot after validating availability.

**Input:**
- `p_appointment_id`: Appointment to reschedule
- `p_new_starts_at`: New start time (ISO 8601)
- `p_duration_minutes`: Duration for the new slot (should match service or existing duration)

**Logic:**
1. Fetch current appointment (validate exists, not cancelled)
2. Call `get_available_slots()` to check if `p_new_starts_at` is free for `p_duration_minutes`
3. If not available, raise error (error code: `SLOT_NOT_AVAILABLE`)
4. If start time is in the past, raise error (error code: `SLOT_IN_PAST`)
5. Update appointment: set `starts_at = p_new_starts_at`, `ends_at = p_new_starts_at + p_duration_minutes`, `rescheduled_from = old_appointment_id`
6. Create notification for doctor: `appointment_rescheduled`
7. Return: `{ success: true, appointment_id: ... }` or error with code

**Error Codes:**
- `SLOT_NOT_AVAILABLE` — requested time already booked
- `SLOT_IN_PAST` — new time is before now
- `APPOINTMENT_NOT_FOUND` — appointment doesn't exist
- `APPOINTMENT_CANCELLED` — can't reschedule cancelled appointment
- `UNAUTHORIZED` — caller is not the patient or doctor

---

#### `create_or_get_message_thread(p_type text, p_appointment_id uuid, p_patient_id uuid, p_doctor_id uuid)`

Get or create a message thread. Idempotent — if thread already exists, return it.

**Input:**
- `p_type`: `'appointment'` or `'doctor'`
- `p_appointment_id`: Required if type='appointment', else NULL
- `p_patient_id`, `p_doctor_id`: Both required

**Logic:**
1. If type='appointment', query for existing thread with (type, appointment_id, patient_id, doctor_id)
2. If type='doctor', query for existing thread with (type, patient_id, doctor_id)
3. If found, return thread_id
4. If not found, insert new row and return thread_id

**Returns:** `{ thread_id: uuid }`

---

#### `send_message(p_thread_id uuid, p_sender_id uuid, p_body text)`

Insert a message into a thread. Validates sender is a participant.

**Input:**
- `p_thread_id`: Which thread
- `p_sender_id`: Who is sending (must be patient or doctor in the thread)
- `p_body`: Message text (non-empty)

**Logic:**
1. Validate sender is patient or doctor in thread (or raise `UNAUTHORIZED`)
2. Validate body is non-empty (raise error if blank)
3. Insert message row with `read_at = NULL`
4. Trigger auto-creates notification for recipient
5. Return message_id

**Returns:** `{ message_id: uuid, created_at: timestamp }`

---

### Server Actions (`src/actions/appointment-edit.ts`)

#### `rescheduleAppointment(appointmentId: string, newStartsAt: string)`

Wrapper around RPC for client-side mutation.

**Behavior:**
- Validates `getCurrentUser()` is the appointment patient
- Calls `reschedule_appointment()` RPC
- On success: return `{ ok: true }`
- On error: return `{ ok: false, error: error_code }`
- After success, caller triggers `router.refresh()` to refetch appointment data

---

#### `sendMessage(threadId: string, body: string)`

Wrapper around RPC for sending a message.

**Behavior:**
- Validates `getCurrentUser()` is a participant in the thread
- Validates body is non-empty
- Calls `send_message()` RPC
- On success: return `{ ok: true, messageId: string }`
- On error: return `{ ok: false, error: string }`

---

#### `getOrCreateMessageThread(type: 'appointment' | 'doctor', appointmentId?: string, doctorId: string)`

Wrapper around RPC to get or create a thread.

**Behavior:**
- Gets current user (must be a patient)
- Calls `create_or_get_message_thread()` RPC with type, appointmentId, patientId, doctorId
- Returns `{ threadId: string }`

---

## Component Architecture

### New Pages

#### `/patient/appointments/[id]` (Server Component)

Dedicated appointment edit page. Fetches appointment + message thread and renders a full edit interface.

**Data Fetching (Server):**
```typescript
const appointment = await getMyAppointments('patient', locale, userId)
  .then(appts => appts.find(a => a.id === id))

const messageThread = await getMessageThread(appointmentId, userId)
  // Returns { id, messages: [], type }
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ← Back | Appointment Details (read-only)    │
├─────────────────────────────────────────────┤
│ Doctor: [Name] · [Specialty]                │
│ Time: [Date/Time] [Status Badge]            │
│ Reason: [Text]                              │
├─────────────────────────────────────────────┤
│ Message Thread                              │
│ ┌─────────────────────────────────────────┐ │
│ │ [Message 1 - Doctor]                    │ │
│ │ [Message 2 - Patient]                   │ │
│ │ ...                                     │ │
│ │ [Message N - Doctor] (unread)           │ │
│ └─────────────────────────────────────────┘ │
│ [Text input: "Type a message..."] [Send]    │
├─────────────────────────────────────────────┤
│ Change Time [Button]                        │
├─────────────────────────────────────────────┤
│ [Cancel Appointment] [Back to Dashboard]    │
└─────────────────────────────────────────────┘
```

**Client Component: `AppointmentEditClient`**
- Hydrates with server data
- `useEffect` polls for new messages every 3-5 seconds (or Supabase realtime subscription)
- `sendMessage()` action on input submit
- Modal overlay for reschedule picker
- `rescheduleAppointment()` action on confirm

---

### Calendar Integration (modify `patient-calendar.tsx`)

When a user clicks an appointment block in the month/week/day view:

**Quick-Action Popover:**
```
┌────────────────────────┐
│ Dr. [Name] · [Time]    │
├────────────────────────┤
│ [View Full Details] ←─ navigate to edit page
│ [Send Message]      ←─ open message modal
│ [Change Time]       ←─ open reschedule modal
└────────────────────────┘
```

**Implementation:**
- Wrap month/week/day view appointment blocks with `onClick` handler
- Set state for which appointment is clicked
- Render popover conditionally using `useState(selectedApptId)`
- "View Full Details" calls `router.push(`/patient/appointments/${id}`)`

---

### New Components

#### `MessageThread.tsx`

Displays all messages in a conversation.

**Props:**
```typescript
{
  threadId: string
  messages: Message[]  // from server
  isLoading: boolean
  onMessageAdded?: () => void  // callback when new message arrives (from polling)
}
```

**Features:**
- Scrollable container, auto-scrolls to bottom on new message
- Each message shows: sender name, avatar (optional), timestamp, body
- Unread messages have a subtle highlight
- Empty state: "No messages yet. Start the conversation."

---

#### `MessageInput.tsx`

Text input for composing and sending messages.

**Props:**
```typescript
{
  threadId: string
  onSendSuccess?: () => void  // callback after successful send
  disabled?: boolean
}
```

**Features:**
- Textarea with placeholder "Type a message..."
- Send button (disabled if text empty or sending)
- Loading state on button
- On submit: calls `sendMessage()` action, clears input, optionally refocus

---

#### `RescheduleModal.tsx`

Modal for picking a new appointment time.

**Props:**
```typescript
{
  appointmentId: string
  doctorId: string
  currentStartsAt: string
  durationMinutes: number
  isOpen: boolean
  onClose: () => void
  onRescheduleSuccess?: () => void
}
```

**Features:**
- Fetches available slots using `getDoctorSlots()` (reuse existing logic)
- Shows date picker + time picker
- Lists available times, sorted by start time
- Confirm button calls `rescheduleAppointment()`
- On success: show toast, close modal, trigger refetch
- On error (slot taken, etc.): show error toast, stay in modal for retry

---

#### `AppointmentQuickActions.tsx`

Popover/menu for calendar-based actions.

**Props:**
```typescript
{
  appointment: AppointmentView
  isOpen: boolean
  anchorEl?: HTMLElement  // for positioning popover
  onClose: () => void
  onViewDetails: () => void
  onMessageClick: () => void
  onRescheduleClick: () => void
}
```

---

### Data Fetching

#### New Query Function: `getMessageThread(appointmentId: string, userId: string)`

```typescript
// src/lib/queries/messages.ts
export async function getMessageThread(
  threadId: string,
  userId: string,
): Promise<{
  id: string
  type: 'appointment' | 'doctor'
  appointmentId?: string
  messages: {
    id: string
    senderId: string
    senderName: string
    body: string
    createdAt: string
    readAt: string | null
  }[]
}> {
  const supabase = createClient()
  
  // Fetch thread metadata
  const { data: thread } = await supabase
    .from('message_threads')
    .select('*')
    .eq('id', threadId)
    .single()

  // Verify user is a participant
  if (thread.patient_id !== userId && thread.doctor_id !== userId) {
    throw new Error('UNAUTHORIZED')
  }

  // Fetch all messages in thread, ordered by time
  const { data: messages } = await supabase
    .from('messages')
    .select(`
      id, sender_id, body, created_at, read_at,
      sender:users(full_name)
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  return {
    id: thread.id,
    type: thread.type,
    appointmentId: thread.appointment_id,
    messages: messages.map(m => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.full_name ?? 'Unknown',
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
    })),
  }
}
```

---

## Error Handling & Edge Cases

### Reschedule Errors

| Scenario | Error Code | User Message |
|----------|-----------|--------------|
| Slot already booked | `SLOT_NOT_AVAILABLE` | "This time is no longer available. Choose another." |
| Time is in the past | `SLOT_IN_PAST` | "Cannot reschedule to a past time." |
| Appointment cancelled | `APPOINTMENT_CANCELLED` | "Cannot reschedule a cancelled appointment." |
| No available slots | (empty result) | "No available slots. Try a different date or contact the doctor." |
| Unauthorized (not patient) | `UNAUTHORIZED` | "You don't have permission to edit this appointment." |

### Messaging Errors

| Scenario | Behavior |
|----------|----------|
| Empty message | Send button disabled; no submission allowed |
| Thread doesn't exist | Auto-create on first message send |
| User not in thread | Server action rejects; show error toast |
| Network error sending | Show error toast; allow retry without losing text |
| Very long thread | (Future optimization: pagination/virtualization) |

### UI Edge Cases

| Scenario | Behavior |
|----------|----------|
| No messages in thread | Show "Start a conversation" empty state |
| Reschedule modal closed | No changes saved; return to appointment view |
| Doctor unavailable during reschedule | Show message "No available times. Contact doctor." |
| Appointment status changes (e.g., cancelled by doctor) | Refetch and show warning: "This appointment has been cancelled." |
| User logs out and back in | Thread data refetches; messages persist |

---

## Real-Time Updates (Optional Enhancement)

The initial implementation uses polling (3-5 second intervals) for new messages. Future optimization:
- Switch to Supabase realtime subscriptions on `messages` table
- Benefits: instant message delivery, reduced latency
- Trade-off: slightly more complex client setup

---

## Security & Permissions

**Row-Level Security (RLS):**
- `message_threads` table: Users can only see threads where they are patient_id or doctor_id
- `messages` table: Users can only read/insert messages in threads they participate in
- `appointments` table: Already has RLS; patients can only see their own

**Server-Side Validation:**
- All server actions call `getCurrentUser()` and validate ownership
- RPC functions check permissions before mutating data
- Patients can't reschedule other patients' appointments
- Only thread participants can send/read messages

---

## Testing Strategy

### Unit Tests
- `rescheduleAppointment()` logic: test slot validation, error cases
- `sendMessage()`: test empty body rejection, thread creation
- Message sorting: ensure messages display in chronological order

### Integration Tests
- Patient reschedules appointment → verifies new slot is taken, old one is free
- Patient sends message → verifies notification created for doctor
- Doctor replies → verifies patient can see reply in thread
- Concurrent reschedule attempts → GiST constraint prevents double-booking

### E2E Tests
- Full flow: patient opens edit page → sends message → reschedules → receives confirmation
- Calendar flow: click appointment → quick actions → reschedule from modal

---

## Migration Path

1. Create `message_threads` and `messages` tables
2. Create RPC functions: `reschedule_appointment`, `create_or_get_message_thread`, `send_message`
3. Add server actions in `src/actions/appointment-edit.ts`
4. Create `src/lib/queries/messages.ts` with data fetching
5. Build edit page: `/patient/appointments/[id]`
6. Build components: `MessageThread`, `MessageInput`, `RescheduleModal`
7. Integrate into calendar: add quick-action popover to `patient-calendar.tsx`
8. Test and iterate

---

## Success Criteria

- [x] Patient can navigate to edit page for their appointment
- [x] Patient can send message to doctor; doctor receives notification
- [x] Doctor can reply to patient messages
- [x] Patient can reschedule to any available time (validated against slots)
- [x] Reschedule creates notification for doctor
- [x] Calendar shows quick-action menu on appointment click
- [x] All edit features work from both page and calendar
- [x] No double-booking when rescheduling (GiST constraint enforced)
- [x] Messages persist and load on page refresh
- [x] Unauthorized access is blocked (patient can't edit other patients' appointments)
