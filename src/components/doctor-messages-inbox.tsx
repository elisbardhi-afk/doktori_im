"use client";

import React, { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, User, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { fetchMessageThread, markThreadRead } from "@/actions/appointment-edit";
import { formatInTirane } from "@/lib/datetime";
import type { DoctorThreadSummary } from "@/lib/queries/messages";
import type { Message } from "@/lib/queries/messages";

interface Props {
  threads: DoctorThreadSummary[];
  currentUserId: string;
}

export function DoctorMessagesInbox({ threads, currentUserId }: Props) {
  const t = useTranslations();
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, Message[]>>({});
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [threadUnreadCounts, setThreadUnreadCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    threads.forEach((thread) => {
      counts[thread.threadId] = thread.unreadCount;
    });
    return counts;
  });

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingThreadId(threadId);

    const originalUnreadCount = threadUnreadCounts[threadId] ?? 0;

    // Optimistic update: clear unread indicator immediately
    setThreadUnreadCounts((prev) => ({ ...prev, [threadId]: 0 }));

    try {
      const result = await fetchMessageThread(threadId);
      setThreadMessages((prev) => ({
        ...prev,
        [threadId]: result?.messages ?? [],
      }));
      await markThreadRead(threadId);
    } catch {
      toast.error(t("messages.loadError"));
      // Restore original count on error
      setThreadUnreadCounts((prev) => ({ ...prev, [threadId]: originalUnreadCount }));
    } finally {
      setLoadingThreadId(null);
    }
  }, [t, threadUnreadCounts]);

  async function handleToggle(threadId: string) {
    if (openThreadId === threadId) {
      setOpenThreadId(null);
      return;
    }
    setOpenThreadId(threadId);
    if (!threadMessages[threadId]) {
      await loadThread(threadId);
    }
  }

  function handleSendSuccess(threadId: string) {
    loadThread(threadId);
  }

  return (
    <div className="flex flex-col gap-3">
      {threads.map((thread) => {
        const isOpen = openThreadId === thread.threadId;
        const isLoading = loadingThreadId === thread.threadId;
        const messages = threadMessages[thread.threadId] ?? [];
        const unread = threadUnreadCounts[thread.threadId] ?? thread.unreadCount;

        return (
          <Card key={thread.threadId} className="overflow-hidden p-0">
            <button
              onClick={() => handleToggle(thread.threadId)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <User className="size-4 shrink-0 text-primary" />
                  <span className="font-bold text-foreground">{thread.patientName}</span>
                  {unread > 0 && (
                    <span className="size-2 rounded-full bg-primary inline-block" aria-label="unread" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="size-4 shrink-0" />
                  <span>
                    {formatInTirane(thread.appointmentStartsAt, "EEEE, d MMM yyyy — HH:mm")}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-muted-foreground">
                {isOpen ? (
                  <ChevronUp className="size-5" />
                ) : (
                  <ChevronDown className="size-5" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-border p-4">
                <MessageThread
                  messages={messages}
                  isLoading={isLoading}
                  currentUserId={currentUserId}
                />
                {new Date(thread.appointmentStartsAt) > new Date() ? (
                  <MessageInput
                    threadId={thread.threadId}
                    onSendSuccess={() => handleSendSuccess(thread.threadId)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2 border border-border rounded-lg bg-muted/30">
                    Read-only — messages cannot be sent for past appointments.
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
