import { getLocale, setRequestLocale } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { DoctorProfileEditor } from "@/components/doctor-profile-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DoctorProfileRow } from "@/lib/database.types";

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const { user } = await requireDoctor();

  const supabase = createClient();
  const { data } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const p = data as DoctorProfileRow | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {activeLocale === "en" ? "My profile" : "Profili im"}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{activeLocale === "en" ? "Public details" : "Të dhënat publike"}</CardTitle>
        </CardHeader>
        <CardContent>
          <DoctorProfileEditor
            bio={p?.bio ?? ""}
            clinicName={p?.clinic_name ?? ""}
            clinicAddress={p?.clinic_address ?? ""}
            city={p?.city ?? ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
