alter table public.doctor_services
  add constraint uq_service_doctor_name unique (doctor_id, name);
