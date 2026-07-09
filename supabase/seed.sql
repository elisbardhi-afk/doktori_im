-- Doktori Im — Seed data
-- Specialties are bilingual reference data. Users/doctors are created through
-- Supabase Auth (see scripts/seed-users.mjs), then linked here if needed.

insert into public.specialties (slug, name_en, name_sq, icon_slug, sort_order) values
  ('general-practitioner', 'General Practitioner', 'Mjek i Përgjithshëm', 'stethoscope', 1),
  ('pediatrics',           'Pediatrics',           'Pediatri',            'baby', 2),
  ('cardiology',           'Cardiology',           'Kardiologji',         'heart-pulse', 3),
  ('dermatology',          'Dermatology',          'Dermatologji',        'scan-face', 4),
  ('dentistry',            'Dentistry',            'Stomatologji',        'tooth', 5),
  ('gynecology',           'Gynecology',           'Gjinekologji',        'flower', 6),
  ('orthopedics',          'Orthopedics',          'Ortopedi',            'bone', 7),
  ('ophthalmology',        'Ophthalmology',        'Oftalmologji',        'eye', 8),
  ('ent',                  'ENT (Otolaryngology)', 'Otorinolaringologji', 'ear', 9),
  ('neurology',            'Neurology',            'Neurologji',          'brain', 10),
  ('psychiatry',           'Psychiatry',           'Psikiatri',           'brain-circuit', 11),
  ('psychology',           'Psychology',           'Psikologji',          'message-circle-heart', 12),
  ('endocrinology',        'Endocrinology',        'Endokrinologji',      'activity', 13),
  ('gastroenterology',     'Gastroenterology',     'Gastroenterologji',   'pill', 14),
  ('urology',              'Urology',              'Urologji',            'droplet', 15),
  ('pulmonology',          'Pulmonology',          'Pneumologji',         'wind', 16),
  ('rheumatology',         'Rheumatology',         'Reumatologji',        'hand', 17),
  ('physiotherapy',        'Physiotherapy',        'Fizioterapi',         'dumbbell', 18)
on conflict (slug) do nothing;
