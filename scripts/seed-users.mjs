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
          slot_duration_minutes: 30,
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
    console.log(`  ${d.email}  (${d.status})`);
  }

  console.log("\nDone. All demo accounts use password:", PASSWORD);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
