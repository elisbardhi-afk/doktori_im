import { getLocale, setRequestLocale } from "next-intl/server";
import { getDoctorsForAdmin } from "@/lib/queries/admin";
import { DoctorStatusActions } from "@/components/doctor-status-actions";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Stethoscope } from "lucide-react";

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();
  const pending = await getDoctorsForAdmin("pending");
  const L = (en: string, sq: string) => (activeLocale === "en" ? en : sq);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {L("Doctor approvals", "Miratimet e mjekëve")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {L("Review and approve new doctor registrations", "Shqyrtoni dhe miratoni regjistrimet e reja")}
        </p>
      </div>

      {pending.length === 0 ? (
        <EmptyState
          title={L("No pending approvals", "Asnjë miratim në pritje")}
          icon="BadgeCheck"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((d) => (
            <Card
              key={d.userId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Stethoscope className="size-5" />
                </span>
                <div>
                  <p className="font-bold text-foreground">{d.fullName}</p>
                  <p className="text-sm text-muted-foreground">{d.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {L("License", "Licenca")}: {d.licenseNumber}
                    {d.city && ` · ${d.city}`}
                  </p>
                </div>
              </div>
              <DoctorStatusActions doctorId={d.userId} status={d.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
