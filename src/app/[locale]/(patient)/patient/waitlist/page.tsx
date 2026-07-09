import { getLocale, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";

export default async function WaitlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Waitlist</h1>
      <EmptyState
        title={activeLocale === "en" ? "No waitlist entries" : "Asnjë hyrje në listën e pritjes"}
        description={
          activeLocale === "en"
            ? "Join a doctor's waitlist to be notified when an earlier slot opens up."
            : "Bashkohuni me listën e pritjes për t'u njoftuar kur hapet një orar më i afërt."
        }
        icon="Clock"
      />
    </div>
  );
}
