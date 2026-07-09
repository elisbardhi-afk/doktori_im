import { getLocale, setRequestLocale } from "next-intl/server";
import { getDoctorsForAdmin } from "@/lib/queries/admin";
import { DoctorStatusActions } from "@/components/doctor-status-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function AdminDoctorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const doctors = await getDoctorsForAdmin();
  const L = (en: string, sq: string) => (activeLocale === "en" ? en : sq);

  const badgeVariant = (s: string) =>
    s === "approved" ? "success" : s === "suspended" ? "destructive" : "warning";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{L("Doctors", "Mjekët")}</h1>
      <div className="flex flex-col gap-3">
        {doctors.map((d) => (
          <Card
            key={d.userId}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-foreground">{d.fullName}</p>
                <Badge variant={badgeVariant(d.status)}>{d.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {d.email} · {L("License", "Licenca")}: {d.licenseNumber}
                {d.city && ` · ${d.city}`}
              </p>
            </div>
            <DoctorStatusActions doctorId={d.userId} status={d.status} />
          </Card>
        ))}
      </div>
    </div>
  );
}
