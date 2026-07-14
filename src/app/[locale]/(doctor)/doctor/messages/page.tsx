import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireDoctor } from "@/lib/guards";
import { getDoctorMessageThreads } from "@/lib/queries/messages";
import { DoctorMessagesInbox } from "@/components/doctor-messages-inbox";
import { EmptyState } from "@/components/empty-state";

export default async function DoctorMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const { user } = await requireDoctor();

  const threads = await getDoctorMessageThreads(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t("nav.messages")}</h1>

      {threads.length === 0 ? (
        <EmptyState title={t("messages.empty")} icon="MessageSquare" />
      ) : (
        <DoctorMessagesInbox threads={threads} currentUserId={user.id} />
      )}
    </div>
  );
}
