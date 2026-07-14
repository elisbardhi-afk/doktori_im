"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { getOrCreateMessageThread, fetchMessageThread } from "@/actions/appointment-edit";
import type { AppointmentView } from "@/lib/queries/appointments";
import type { Message } from "@/lib/queries/messages";

export function AppointmentMessageModal({
  appointment,
  currentUserId,
  onClose,
}: {
  appointment: AppointmentView;
  currentUserId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initThread() {
      setLoading(true);

      // Get or create the message thread
      const threadResult = await getOrCreateMessageThread(
        "appointment",
        appointment.doctorId,
        appointment.id,
      );

      if (!threadResult.ok || !threadResult.threadId) {
        toast.error(
          t("messages.loadError") || "Failed to load messages",
        );
        onClose();
        return;
      }

      const newThreadId = threadResult.threadId;
      setThreadId(newThreadId);

      // Fetch the thread with messages
      const thread = await fetchMessageThread(newThreadId);

      if (thread) {
        setMessages(thread.messages);
      }

      setLoading(false);
    }

    initThread();
  }, [appointment.id, appointment.doctorId, currentUserId, onClose, t]);

  const handleSendSuccess = async () => {
    // Refresh messages after sending
    if (threadId) {
      const thread = await fetchMessageThread(threadId);
      if (thread) {
        setMessages(thread.messages);
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-lg">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>

          {/* Header */}
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-lg font-semibold text-foreground">
              {t("messages.title") || "Messages"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {appointment.doctorName}
            </p>
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">
                  {t("common.loading") || "Loading..."}
                </p>
              </div>
            ) : (
              <MessageThread
                messages={messages}
                isLoading={false}
                currentUserId={currentUserId}
              />
            )}
          </div>

          {/* Footer with input */}
          {threadId && !loading && (
            <div className="border-t border-border px-6 py-4">
              <MessageInput
                threadId={threadId}
                onSendSuccess={handleSendSuccess}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
