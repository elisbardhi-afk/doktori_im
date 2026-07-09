// End-to-end booking verification against the LIVE Supabase project.
// Proves the "flawless booking" requirement:
//   1. get_available_slots returns DST-correct slots
//   2. a patient can book a slot (RLS + RPC)
//   3. concurrent bookings of the SAME slot → exactly one succeeds
//   4. booking an already-taken slot fails with SLOT_TAKEN
//
// Run: node scripts/verify-booking.mjs
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "DoktoriIm123!";

function svcHeaders() {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
}

async function signIn(email) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`signIn ${email}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.access_token;
}

function userHeaders(token) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function rpc(token, fn, args) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

async function getDoctorId(slug) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/doctor_profiles?select=user_id&slug=eq.${slug}`,
    { headers: svcHeaders() },
  );
  const [row] = await res.json();
  return row.user_id;
}

// Clean up any appointments created by this script (idempotent reruns).
async function cleanup(doctorId, startsAt) {
  await fetch(
    `${URL_BASE}/rest/v1/appointments?doctor_id=eq.${doctorId}&starts_at=eq.${encodeURIComponent(startsAt)}`,
    { method: "DELETE", headers: svcHeaders() },
  );
}

let failures = 0;
function check(name, cond, detail = "") {
  const mark = cond ? "✓" : "✗";
  if (!cond) failures++;
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("Verifying booking against live Supabase…\n");

  const doctorId = await getDoctorId("dr-arben-hoxha");
  const patientToken = await signIn("patient@doktori-im.al");
  const patient2Token = await signIn("patient2@doktori-im.al");

  // Pick a slot ~10 days out (a weekday the doctor works).
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 10);
  const fromDate = base.toISOString().slice(0, 10);
  const toDate = new Date(base.getTime() + 5 * 86400000).toISOString().slice(0, 10);

  console.log(`[1] get_available_slots (${fromDate}..${toDate})`);
  const slotsRes = await rpc(patientToken, "get_available_slots", {
    p_doctor_id: doctorId,
    p_from: fromDate,
    p_to: toDate,
  });
  const slots = JSON.parse(slotsRes.body);
  check("returns slots", slots.length > 0, `${slots.length} slots`);
  const target = slots[0];
  check(
    "slot is DST-correct (09:00 local first)",
    target.local_time === "09:00",
    `first=${target.local_time} @ ${target.slot_start}`,
  );

  await cleanup(doctorId, target.slot_start);

  console.log("\n[2] single booking");
  const book1 = await rpc(patientToken, "book_appointment", {
    p_doctor_id: doctorId,
    p_starts_at: target.slot_start,
    p_reason: "verify: single",
  });
  check("first booking succeeds", book1.ok, `status ${book1.status}`);

  console.log("\n[3] double-book same slot (different patient) must fail");
  const book2 = await rpc(patient2Token, "book_appointment", {
    p_doctor_id: doctorId,
    p_starts_at: target.slot_start,
    p_reason: "verify: dup",
  });
  check(
    "second booking rejected with SLOT_TAKEN/NOT_AVAILABLE",
    !book2.ok && /SLOT_TAKEN|SLOT_NOT_AVAILABLE/.test(book2.body),
    book2.body.slice(0, 80),
  );

  // Reset for the concurrency test.
  await cleanup(doctorId, target.slot_start);

  console.log("\n[4] CONCURRENCY: 20 simultaneous bookings of the same slot");
  const N = 20;
  // Alternate the two patients so patient-overlap constraint doesn't mask it;
  // use fresh tokens per call is unnecessary — same token is fine.
  const attempts = Array.from({ length: N }, (_, i) =>
    rpc(i % 2 === 0 ? patientToken : patient2Token, "book_appointment", {
      p_doctor_id: doctorId,
      p_starts_at: target.slot_start,
      p_reason: `verify: race ${i}`,
    }),
  );
  const results = await Promise.all(attempts);
  const succeeded = results.filter((r) => r.ok).length;
  const taken = results.filter(
    (r) => !r.ok && /SLOT_TAKEN|SLOT_NOT_AVAILABLE/.test(r.body),
  ).length;

  check("exactly ONE booking succeeded", succeeded === 1, `${succeeded} succeeded`);
  check("all others rejected as taken", taken === N - 1, `${taken}/${N - 1} rejected`);

  // Confirm exactly one active row in the DB.
  const activeRes = await fetch(
    `${URL_BASE}/rest/v1/appointments?select=id,status&doctor_id=eq.${doctorId}&starts_at=eq.${encodeURIComponent(target.slot_start)}&status=in.(pending,confirmed)`,
    { headers: svcHeaders() },
  );
  const active = await activeRes.json();
  check("exactly ONE active appointment row", active.length === 1, `${active.length} rows`);

  console.log("\n[5] booking a past slot must fail");
  const pastRes = await rpc(patientToken, "book_appointment", {
    p_doctor_id: doctorId,
    p_starts_at: "2020-01-01T09:00:00+00:00",
  });
  check("past slot rejected", !pastRes.ok, pastRes.body.slice(0, 60));

  // Final cleanup.
  await cleanup(doctorId, target.slot_start);

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message);
  process.exit(1);
});
