-- NOTE: Apply this manually in the Supabase SQL Editor.
-- The get_available_slots function (0004_services.sql) hardcodes a 15-minute
-- slot grid and no longer reads slot_duration_minutes from availability_rules.
-- This migration removes the now-vestigial column.

alter table availability_rules drop column if exists slot_duration_minutes;
