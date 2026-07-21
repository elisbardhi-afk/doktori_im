import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getWaitlistEntries } from "@/actions/waitlist";
import { WaitlistEntries } from "@/components/waitlist-entries";

export default async function WaitlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const entries = await getWaitlistEntries();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.waitlist")}</h1>
      <WaitlistEntries entries={entries} />
    </div>
  );
}
