"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/back-button";
import { StatusBadge } from "@/components/status-badge";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { RescheduleModal } from "@/components/reschedule-modal";
import { cancelAppointment } from "@/actions/booking";
import { getMessageThread } from "@/lib/queries/messages";
import { getOrCreateMessageThread } from "@/actions/appointment-edit";
import { formatInTirane, timeInTirane } from "@/lib/datetime";
import { Calendar, Stethoscope, Clock } from "lucide-react";
import type { AppointmentView } from "@/lib/queries/appointments";
import type { MessageThread as MessageThreadType } from "@/lib/queries/messages";

export function AppointmentEditClient({
  appointment,
  messageThread: initialThread,
  isUpcoming,
  currentUserId,
}: {
  appointment: AppointmentView;
  messageThread: MessageThreadType | null;
  isUpcoming: boolean;
  currentUserId: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [threadData, setThreadData] = useState<MessageThreadType | null>(
    initialThread,
  );
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Initialize message thread if not present
  useEffect(() => {
    if (!threadData && appointment.status !== "cancelled") {
      (async () => {
        setMessagesLoading(true);
        const result = await getOrCreateMessageThread(
          "appointment",
          appointment.doctorId,
          appointment.id,
        );
        setMessagesLoading(false);

        if (result.ok && result.threadId) {
          const thread = await getMessageThread(result.threadId, currentUserId);
          if (thread) {
            setThreadData(thread);
          }
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.status, appointment.doctorId, appointment.id]);

  // Poll for new messages every 3 seconds if thread exists
  useEffect(() => {
    if (!threadData) return;

    const interval = setInterval(async () => {
      setMessagesLoading(true);
      const updatedThread = await getMessageThread(threadData.id, currentUserId);
      setMessagesLoading(false);

      if (updatedThread) {
        setThreadData(updatedThread);
      }
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadData?.id]);

  // Handle cancel appointment
  const handleCancel = async () => {
    if (!confirm(t("appointments.cancelConfirm"))) return;

    setCancelLoading(true);
    const res = await cancelAppointment({ appointmentId: appointment.id });
    setCancelLoading(false);

    if (!res.ok) {
      toast.error(res.error ?? t("common.error"));
      return;
    }

    toast.success(t("common.saved"));
    router.refresh();
  };

  // Calculate duration in minutes for reschedule modal
  const startTime = new Date(appointment.startsAt).getTime();
  const endTime = new Date(appointment.endsAt).getTime();
  const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton label={t("common.back")} />
        <h1 className="text-2xl font-bold text-foreground">
          {t("appointments.edit") || "Appointment Details"}
        </h1>
      </div>

      {/* Appointment Card */}
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="size-5 text-primary" />
              <span className="text-lg font-bold text-foreground">
                {appointment.doctorName}
              </span>
            </div>
            {appointment.specialty && (
              <span className="text-sm text-muted-foreground">
                {appointment.specialty}
              </span>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-4" />
              {formatInTirane(appointment.startsAt, "EEEE, d MMM yyyy")}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              {timeInTirane(appointment.startsAt)} – {timeInTirane(appointment.endsAt)}
            </div>
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {appointment.reason && (
          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold text-muted-foreground">
              {t("appointments.reason") || "Reason"}
            </p>
            <p className="mt-1 text-sm text-foreground">{appointment.reason}</p>
          </div>
        )}
      </Card>

      {/* Message Thread */}
      {threadData && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {t("messages.title") || "Messages"}
          </h2>
          <MessageThread
            messages={threadData.messages}
            isLoading={messagesLoading}
            currentUserId={currentUserId}
          />
          <MessageInput threadId={threadData.id} onSendSuccess={() => router.refresh()} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {isUpcoming && (
          <>
            <Button
              variant="outline"
              onClick={() => setRescheduleOpen(true)}
              className="flex-1"
            >
              {t("appointments.changeTime") || "Change Time"}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelLoading}
              className="flex-1"
            >
              {cancelLoading ? t("common.loading") : t("appointments.cancel")}
            </Button>
          </>
        )}
      </div>

      {/* Reschedule Modal */}
      <RescheduleModal
        appointmentId={appointment.id}
        doctorId={appointment.doctorId}
        currentStartsAt={appointment.startsAt}
        durationMinutes={durationMinutes}
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
      />
    </div>
  );
}
