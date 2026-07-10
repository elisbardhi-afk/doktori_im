// Seed demo users via the Supabase Auth Admin + REST APIs using plain fetch
// (avoids supabase-js realtime WebSocket requirement on Node < 22).
//
// Run: node scripts/seed-users.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SERVICE) {
  console.error("Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

const authHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

const PASSWORD = "DoktoriIm123!";

async function listUsers() {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=1000`, {
    headers: authHeaders,
  });
  if (!res.ok) throw new Error(`listUsers: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.users ?? body;
}

async function ensureUser(email, meta) {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: meta,
    }),
  });
  if (res.ok) {
    const u = await res.json();
    return u.id;
  }
  const text = await res.text();
  if (!/already|registered|exists/i.test(text)) {
    throw new Error(`createUser ${email}: ${res.status} ${text}`);
  }
  const users = await listUsers();
  const found = users.find((u) => u.email === email);
  if (!found) throw new Error(`could not find existing user ${email}`);
  return found.id;
}

async function patch(table, match, values) {
  const qs = Object.entries(match)
    .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers: { ...authHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(`patch ${table}: ${res.status} ${await res.text()}`);
}

async function upsert(table, values, onConflict) {
  const url =
    `${URL_BASE}/rest/v1/${table}` +
    (onConflict ? `?on_conflict=${onConflict}` : "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(`upsert ${table}: ${res.status} ${await res.text()}`);
}

async function select(table, qs) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${qs}`, {
    headers: authHeaders,
  });
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function upsertServices(doctorId, services) {
  const rows = services.map((s, i) => ({
    doctor_id: doctorId,
    name: s.name,
    duration_minutes: s.duration,
    price: s.price,
    is_active: true,
    sort_order: i,
  }));
  await upsert("doctor_services", rows, "doctor_id,name");
}

async function main() {
  console.log("Seeding users…");

  const adminId = await ensureUser("admin@doktori-im.al", {
    full_name: "Platform Admin",
    role: "patient",
  });
  await patch("users", { id: adminId }, { role: "admin", full_name: "Platform Admin" });
  console.log("  admin@doktori-im.al  (promoted to admin)");

  await ensureUser("patient@doktori-im.al", {
    full_name: "Elira Dako",
    role: "patient",
    phone: "+355691234567",
  });
  await ensureUser("patient2@doktori-im.al", {
    full_name: "Bledar Meta",
    role: "patient",
    phone: "+355692222333",
  });
  console.log("  patient@doktori-im.al, patient2@doktori-im.al");

  const doctors = [
    {
      email: "dr.hoxha@doktori-im.al",
      full_name: "Dr. Arben Hoxha",
      license: "AL-CARD-1001",
      slug: "dr-arben-hoxha",
      bio: "Kardiolog me 15 vjet përvojë në Spitalin Universitar 'Nënë Tereza'.",
      city: "Tiranë",
      clinic: "Klinika Kardiologjike Hoxha",
      fee: 3000,
      specialties: ["cardiology", "general-practitioner"],
      status: "approved",
      services: [
        { name: "Vizitë kardiologjike", duration: 30, price: 3000 },
        { name: "Elektrokardiogram (EKG)", duration: 15, price: 1500 },
        { name: "Ekokardiografi", duration: 30, price: 4000 },
        { name: "Monitorim Holter 24h", duration: 20, price: 5000 },
      ],
    },
    {
      email: "dr.leka@doktori-im.al",
      full_name: "Dr. Mira Leka",
      license: "AL-PED-2002",
      slug: "dr-mira-leka",
      bio: "Pediatre e përkushtuar, specializuar në kujdesin për fëmijët 0-14 vjeç.",
      city: "Tiranë",
      clinic: "Qendra Pediatrike Leka",
      fee: 2500,
      specialties: ["pediatrics"],
      status: "approved",
      services: [
        { name: "Vizitë pediatrike", duration: 20, price: 2500 },
        { name: "Vaksinim", duration: 15, price: 1000 },
        { name: "Kontroll zhvillimi", duration: 30, price: 3000 },
      ],
    },
    {
      email: "dr.prifti@doktori-im.al",
      full_name: "Dr. Gentian Prifti",
      license: "AL-DERM-3003",
      slug: "dr-gentian-prifti",
      bio: "Dermatolog, ende në pritje të miratimit.",
      city: "Durrës",
      clinic: "Klinika Dermatologjike Prifti",
      fee: 2800,
      specialties: ["dermatology"],
      status: "pending",
    },
    {
      email: "dr.brahimi@doktori-im.al",
      full_name: "Dr. Olta Brahimi",
      license: "AL-GYN-4004",
      slug: "dr-olta-brahimi",
      bio: "Gjinekologia dhe obstetrika me 12 vjet përvojë. Specializim në Gjermani (2015).",
      city: "Tiranë",
      clinic: "Qendra Gjinekologjike Brahimi",
      fee: 4000,
      specialties: ["gynecology"],
      status: "approved",
      services: [
        { name: "Vizitë gjinekologjike", duration: 30, price: 4000 },
        { name: "Ultratingull gjinekologjik", duration: 20, price: 3000 },
        { name: "Pap smear", duration: 15, price: 2000 },
        { name: "Kolposkopi", duration: 20, price: 3500 },
      ],
    },
    {
      email: "dr.koci@doktori-im.al",
      full_name: "Dr. Erjon Koçi",
      license: "AL-ORTH-5005",
      slug: "dr-erjon-koci",
      bio: "Ortoped me fokus tek kirurgjia e gjurit dhe kofshës. Anëtar i EFORT.",
      city: "Durrës",
      clinic: "Klinika Ortopedike Koçi",
      fee: 5000,
      specialties: ["orthopedics"],
      status: "approved",
      services: [
        { name: "Vizitë ortopedike", duration: 30, price: 5000 },
        { name: "Injeksion intra-artikular", duration: 20, price: 4000 },
        { name: "Fizioterapi ortopedike", duration: 45, price: 2500 },
        { name: "Raport mjekësor", duration: 15, price: 1500 },
      ],
    },
    {
      email: "dr.shehu@doktori-im.al",
      full_name: "Dr. Besmir Shehu",
      license: "AL-GP-6006",
      slug: "dr-besmir-shehu",
      bio: "Mjek i përgjithshëm me 20 vjet praktikë. Shërbej komunitetin e Vlorës.",
      city: "Vlorë",
      clinic: "Ambulanca Shehu",
      fee: 2500,
      specialties: ["general-practitioner"],
      status: "approved",
      services: [
        { name: "Vizitë e përgjithshme", duration: 20, price: 2500 },
        { name: "Kontroll rutinë", duration: 15, price: 2000 },
        { name: "Recetë mjekësore", duration: 10, price: 500 },
      ],
    },
    {
      email: "dr.malaj@doktori-im.al",
      full_name: "Dr. Anila Malaj",
      license: "AL-OPH-7007",
      slug: "dr-anila-malaj",
      bio: "Oftalmologe, specializim në sëmundjet e retinës dhe glaukomën.",
      city: "Shkodër",
      clinic: "Qendra Okuliste Malaj",
      fee: 3500,
      specialties: ["ophthalmology"],
      status: "approved",
      services: [
        { name: "Ekzaminim i syve", duration: 20, price: 3500 },
        { name: "Tonometri (presioni okulare)", duration: 10, price: 1500 },
        { name: "Fundoskopi", duration: 15, price: 2500 },
      ],
    },
    {
      email: "dr.zajmi@doktori-im.al",
      full_name: "Dr. Flamur Zajmi",
      license: "AL-PULM-8008",
      slug: "dr-flamur-zajmi",
      bio: "Pulmonolog dhe alergolog. Ekspert i sëmundjeve të mushkërive dhe astmës.",
      city: "Elbasan",
      clinic: "Klinika Pulmonologjike Zajmi",
      fee: 4500,
      specialties: ["pulmonology"],
      status: "approved",
      services: [
        { name: "Vizitë pulmonologjike", duration: 30, price: 4500 },
        { name: "Spirometri", duration: 20, price: 2000 },
        { name: "Test alergjie", duration: 30, price: 3500 },
        { name: "Oksigjeni pulsoksimetrik", duration: 10, price: 800 },
      ],
    },
  ];

  const specs = await select("specialties", "select=id,slug");
  const specId = Object.fromEntries(specs.map((s) => [s.slug, s.id]));

  for (const d of doctors) {
    const id = await ensureUser(d.email, {
      full_name: d.full_name,
      role: "doctor",
      license_number: d.license,
    });
    await patch(
      "doctor_profiles",
      { user_id: id },
      {
        slug: d.slug,
        full_name: d.full_name,
        bio: d.bio,
        license_number: d.license,
        clinic_name: d.clinic,
        city: d.city,
        consultation_fee: d.fee,
        status: d.status,
        languages: ["sq", "en"],
        approved_at: d.status === "approved" ? new Date().toISOString() : null,
        approved_by: d.status === "approved" ? adminId : null,
      },
    );
    for (const slug of d.specialties) {
      await upsert(
        "doctor_specialties",
        { doctor_id: id, specialty_id: specId[slug] },
        "doctor_id,specialty_id",
      );
    }
    if (d.status === "approved") {
      // Clear any prior rules for a clean reseed, then add Mon–Fri 09:00–13:00.
      const rules = [];
      for (let weekday = 1; weekday <= 5; weekday++) {
        rules.push({
          doctor_id: id,
          weekday,
          start_time: "09:00",
          end_time: "13:00",
          // slot_duration_minutes removed — column dropped in migration 0005
        });
      }
      // Insert (skip if they already exist by checking count).
      const existing = await select(
        "availability_rules",
        `select=id&doctor_id=eq.${id}`,
      );
      if (existing.length === 0) {
        await upsert("availability_rules", rules);
      }
    }
    if (d.services && d.services.length > 0) {
      await upsertServices(id, d.services);
    }
    console.log(`  ${d.email}  (${d.status})`);
  }

  console.log("\nDone. All demo accounts use password:", PASSWORD);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
