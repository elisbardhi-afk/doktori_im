// Hand-written to match supabase/migrations. Regenerate from the live DB with
// `npm run db:types` once the Supabase project is connected.

export type UserRole = "patient" | "doctor" | "admin";
export type DoctorStatus = "pending" | "approved" | "suspended";
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";
export type GenderType = "male" | "female" | "other" | "prefer_not_to_say";
export type WaitlistStatus =
  | "active"
  | "notified"
  | "claimed"
  | "expired"
  | "cancelled";
export type NotificationType =
  | "appointment_confirmed"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "waitlist_available"
  | "review_request"
  | "doctor_approved"
  | "doctor_rejected"
  | "doctor_suspended"
  | "new_booking"
  | "message_received";
export type ExceptionKind = "block" | "extra";

export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  preferred_locale: string;
  notify_email: boolean;
  notify_sms: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpecialtyRow {
  id: number;
  slug: string;
  name_en: string;
  name_sq: string;
  icon_slug: string;
  sort_order: number;
}

export interface DoctorProfileRow {
  user_id: string;
  slug: string;
  bio: string | null;
  license_number: string;
  clinic_name: string | null;
  clinic_address: string | null;
  city: string | null;
  photo_url: string | null;
  status: DoctorStatus;
  requires_approval: boolean;
  consultation_fee: number | null;
  languages: string[];
  avg_rating: number;
  review_count: number;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientProfileRow {
  user_id: string;
  date_of_birth: string | null;
  gender: GenderType | null;
  national_id: string | null;
  insurance_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityRuleRow {
  id: string;
  doctor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AvailabilityExceptionRow {
  id: string;
  doctor_id: string;
  exception_date: string;
  kind: ExceptionKind;
  start_time: string | null;
  end_time: string | null;
  slot_duration_minutes: number | null;
  reason: string | null;
  created_at: string;
}

export interface DoctorServiceRow {
  id: string;
  doctor_id: string;
  name: string;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface AppointmentRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  slot_duration_minutes: number;
  reason: string | null;
  reminder_sent_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  rescheduled_from: string | null;
  claim_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewRow {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface MessageThreadRow {
  id: string;
  type: "appointment" | "general";
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

export interface AvailableSlot {
  slot_start: string;
  slot_end: string;
  local_date: string;
  local_time: string;
  duration_minutes: number;
}

// Minimal shape used by the typed client. Regeneration will expand this.
// Each table entry carries a `Relationships` key to satisfy supabase-js's
// GenericTable constraint (we leave it empty — joins are still usable).
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      users: Table<UserRow>;
      specialties: Table<SpecialtyRow>;
      doctor_profiles: Table<DoctorProfileRow>;
      patient_profiles: Table<PatientProfileRow>;
      availability_rules: Table<AvailabilityRuleRow>;
      availability_exceptions: Table<AvailabilityExceptionRow>;
      doctor_services: Table<DoctorServiceRow>;
      appointments: Table<AppointmentRow>;
      reviews: Table<ReviewRow>;
      notifications: Table<NotificationRow>;
      message_threads: Table<MessageThreadRow>;
      messages: Table<MessageRow>;
    };
    Views: Record<string, never>;
    Enums: {
      user_role: UserRole;
      doctor_status: DoctorStatus;
      appointment_status: AppointmentStatus;
      gender_type: GenderType;
      waitlist_status: WaitlistStatus;
      notification_type: NotificationType;
      exception_kind: ExceptionKind;
    };
    CompositeTypes: Record<string, never>;
    Functions: {
      get_available_slots: {
        Args: {
          p_doctor_id: string;
          p_from: string;
          p_to: string;
          p_exclude_appointment_id?: string;
          p_duration_minutes?: number;
        };
        Returns: AvailableSlot[];
      };
      book_appointment: {
        Args: {
          p_doctor_id: string;
          p_starts_at: string;
          p_reason?: string;
          p_service_id?: string;
        };
        Returns: string;
      };
      cancel_appointment: {
        Args: { p_appointment_id: string; p_reason?: string };
        Returns: void;
      };
      confirm_appointment: { Args: { p_appointment_id: string }; Returns: void };
      complete_appointment: {
        Args: { p_appointment_id: string };
        Returns: void;
      };
      mark_no_show: { Args: { p_appointment_id: string }; Returns: void };
      submit_review: {
        Args: { p_appointment_id: string; p_rating: number; p_comment?: string };
        Returns: string;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
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
          p_type: string;
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
    };
  };
}
