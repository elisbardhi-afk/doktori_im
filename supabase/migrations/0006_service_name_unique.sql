alter table public.doctor_services
  drop constraint if exists uq_service_doctor_name;

alter table public.doctor_services
  add constraint uq_service_doctor_name unique (doctor_id, name);
