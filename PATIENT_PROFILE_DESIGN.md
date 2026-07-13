# Patient User Information Page Design

**Date:** 2026-07-13  
**Feature:** Patient profile editing with search pre-fill  
**Status:** Design approved

---

## Overview

Create a new patient profile page (`/patient/profile`) where patients can view and edit their personal information including name, phone, address, city, and postal code. When patients navigate to the doctor search page, the city field auto-fills from their saved profile.

---

## Database Schema Changes

### New Fields on `users` Table

Extend the `UserRow` type with four new optional columns:

```typescript
// In database.types.ts
export interface UserRow {
  // ... existing fields ...
  address: string | null;        // Street address
  city: string | null;           // Albanian city (from predefined list)
  postal_code: string | null;    // Postal/zip code
  phone: string | null;          // Already exists; included for reference
}
```

**Migration details:**
- All four fields are nullable for backward compatibility
- `city` must be one of the predefined Albanian cities from `ALBANIAN_CITIES` list in `hero-search.tsx`
- No indexes required initially; add if search/filter performance becomes a concern

---

## UI & Page Structure

### Route

```
/[locale]/(patient)/patient/profile
```

Follows existing patient layout structure.

### Page Components

**Main form** with the following fields (all editable except email):

1. **First Name** (required)
   - Source: split from existing `full_name` or stored separately
   - Validation: non-empty, max 50 characters
   - Pre-filled on page load

2. **Last Name** (required)
   - Source: split from existing `full_name` or stored separately
   - Validation: non-empty, max 50 characters
   - Pre-filled on page load

3. **Email** (read-only)
   - Source: authenticated user email
   - Disabled input, shows current email
   - No edit capability

4. **Phone** (required)
   - Validation: non-empty, basic phone format check
   - Pre-filled from `users.phone` if exists
   - Allows editing

5. **Address** (optional)
   - Validation: max 150 characters
   - Free-text input
   - Pre-filled from `users.address` if exists

6. **City** (optional)
   - Validation: must match one of `ALBANIAN_CITIES` list (if provided)
   - Datalist/dropdown like HeroSearch component
   - Pre-filled from `users.city` if exists

7. **Postal Code** (optional)
   - Validation: max 20 characters
   - Free-text input
   - Pre-filled from `users.postal_code` if exists

**Controls:**
- "Save" button (primary, full width or standard size)
- Clear visual feedback on form state (disabled during submit)

**Layout:**
- Responsive: single column on mobile, two columns on desktop where appropriate
- Consistent with existing Doktori Im design system

---

## Navigation Integration

### Header User Menu

Add new "Profile" link in the user menu component next to existing dashboard link:

```
[User Name] [Profile] [Logout]
```

Link navigates to `/patient/profile`.

### Patient Dashboard

Add "Edit Profile" button or link in the dashboard header area, similar to the existing "Search" button. Places profile editing within the patient's workflow.

---

## Data Flow

### Saving Profile

1. User fills form fields on `/patient/profile`
2. **Client-side validation** runs on form submit:
   - Check required fields (first name, last name, phone) are non-empty
   - Validate email format (read-only, skip)
   - City must be from `ALBANIAN_CITIES` if provided
   - Address and postal code basic length checks
3. If validation fails, show **field-level error messages** under each invalid field
4. If validation passes, call **server action** `updateUserProfile()` with form data
5. Server re-validates (same checks) and updates `users` table
6. On success: show **toast notification** "Profile saved successfully" (duration: 3-4s)
7. On server error: show **toast notification** "Failed to save. Please try again."
8. Form stays on page; user can edit and retry

### Pre-filling Search

When user navigates to `/doctors` search page:

1. **HeroSearch component** checks if user is authenticated
2. **Fetch or use cached user data** (current user's city from `users.city`)
3. If city exists in profile, **pre-fill the city input** in HeroSearch with that value
4. User can override the pre-filled city or proceed with the saved default
5. City preference is also stored in **localStorage** for instant pre-fill on return visits (no network delay)

---

## Validation & Error Handling

### Client-Side Validation

```
Field           Required  Validation Rule
─────────────────────────────────────────────────
First Name      Yes       Non-empty, ≤ 50 chars
Last Name       Yes       Non-empty, ≤ 50 chars
Email           No        Read-only (no validation)
Phone           Yes       Non-empty, basic format
Address         No        ≤ 150 chars
City            No        Must be in ALBANIAN_CITIES list (if provided)
Postal Code     No        ≤ 20 chars
```

Error messages shown inline below each invalid field.

### Server-Side Validation

- Re-validate all required fields and constraints
- Confirm user is authenticated (check session)
- Reject if any required field is missing
- Return error message to client

### Error Scenarios

| Scenario | User Sees |
|----------|-----------|
| Client-side validation fails | Red field borders + error text below each field |
| Network error during save | Toast: "Failed to save. Please try again." |
| Server validation fails | Toast with specific error message |
| Successful save | Toast: "Profile saved successfully" (3-4s duration) |

---

## Implementation Notes

### Full Name Handling

Currently, `UserRow.full_name` is a single string. For this design, we have two options:

**Option A (Recommended):** Split on save
- Read `full_name` on page load: split by space into first/last name
- On save: combine first + last into `full_name` before storing
- Simpler, no schema change to `full_name`

**Option B:** Store separately
- Add `first_name` and `last_name` columns to `users`
- Update `full_name` to be computed (first_name + " " + last_name)
- More explicit, requires migration

Use **Option A** unless there's a reason to split the name at the database level.

### Component Reuse

Consider extracting common form elements (city dropdown, validation messages) to shared components if not already present.

---

## Testing Checklist

- [ ] Profile page loads with current user data pre-filled
- [ ] Required field validation blocks submission if empty
- [ ] City dropdown shows `ALBANIAN_CITIES` list
- [ ] Save succeeds and updates database
- [ ] Success toast appears after save
- [ ] Error toast appears on failure
- [ ] Email field is disabled (read-only)
- [ ] City pre-fills on search page after save
- [ ] City pre-fills from localStorage on return visits
- [ ] Form is responsive on mobile and desktop
- [ ] Page requires authentication (redirects if not logged in)

---

## Out of Scope

- Patient profile photos
- Gender/date of birth editing (exists in `PatientProfileRow`, can be added later)
- Address autocomplete/validation against official records
- Email change functionality (requires separate auth flow)
