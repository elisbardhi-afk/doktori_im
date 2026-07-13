-- Add user address fields to support patient profile enhancements
-- Adds three nullable columns to the users table:
-- - address: street address
-- - city: city of residence (validates against ALBANIAN_CITIES in application layer)
-- - postal_code: postal/zip code
--
-- All columns are nullable for backward compatibility.

alter table public.users
add column address text,
add column city text,
add column postal_code text;

-- Document the columns
comment on column public.users.address is 'Street address of the user';
comment on column public.users.city is 'City of residence (validated against ALBANIAN_CITIES in application layer)';
comment on column public.users.postal_code is 'Postal/zip code';
