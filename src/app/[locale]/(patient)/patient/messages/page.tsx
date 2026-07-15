import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/guards";
import { getPatientMessageThreads } from "@/lib/queries/messages";
import { PatientMessagesInbox } from "@/components/patient-messages-inbox";
import { EmptyState } from "@/components/empty-state";

export default async function PatientMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const user = await requireRole(["patient"]);

  const threads = await getPatientMessageThreads(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.messages")}</h1>

      {threads.length === 0 ? (
        <EmptyState title={t("messages.empty")} icon="MessageSquare" />
      ) : (
        <PatientMessagesInbox threads={threads} currentUserId={user.id} />
      )}
    </div>
  );
}
