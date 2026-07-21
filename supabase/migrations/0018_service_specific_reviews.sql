-- Add service_id to reviews table (nullable for backwards compat with existing reviews)
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.doctor_services(id) ON DELETE SET NULL;

-- Add per-service avg_rating and review_count to doctor_services
ALTER TABLE public.doctor_services
  ADD COLUMN IF NOT EXISTS avg_rating numeric(3,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

-- Create index for service reviews
CREATE INDEX IF NOT EXISTS idx_reviews_service ON public.reviews(service_id);

-- Updated submit_review: look up service_id from appointment and store it
CREATE OR REPLACE FUNCTION public.submit_review(
  p_appointment_id uuid,
  p_rating smallint,
  p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a record;
  v_id uuid;
  v_name text;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING errcode='P0001'; END IF;
  IF a.patient_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode='P0001'; END IF;
  IF a.status <> 'completed' THEN RAISE EXCEPTION 'NOT_COMPLETED' USING errcode='P0001'; END IF;
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'INVALID_RATING' USING errcode='P0001'; END IF;

  SELECT full_name INTO v_name FROM public.users WHERE id = v_uid;

  INSERT INTO public.reviews (appointment_id, patient_id, doctor_id, service_id, rating, comment, patient_name)
  VALUES (p_appointment_id, v_uid, a.doctor_id, a.service_id, p_rating, p_comment, v_name)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED' USING errcode='P0001';
END $$;

-- Updated sync_doctor_rating: also updates per-service stats
CREATE OR REPLACE FUNCTION public.sync_doctor_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
  v_service uuid;
BEGIN
  v_doctor := COALESCE(NEW.doctor_id, OLD.doctor_id);
  v_service := COALESCE(NEW.service_id, OLD.service_id);

  -- Update overall doctor rating
  UPDATE public.doctor_profiles d
  SET
    avg_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.reviews WHERE doctor_id = v_doctor), 0),
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE doctor_id = v_doctor)
  WHERE d.user_id = v_doctor;

  -- Update per-service rating if a service is attached
  IF v_service IS NOT NULL THEN
    UPDATE public.doctor_services s
    SET
      avg_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.reviews WHERE service_id = v_service), 0),
      review_count = (SELECT COUNT(*) FROM public.reviews WHERE service_id = v_service)
    WHERE s.id = v_service;
  END IF;

  RETURN NULL;
END $$;
