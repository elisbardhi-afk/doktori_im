"use client";

import React, { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Stethoscope, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { fetchMessageThread, markThreadRead } from "@/actions/appointment-edit";
import { formatInTirane } from "@/lib/datetime";
import type { PatientThreadSummary } from "@/lib/queries/messages";
import type { Message } from "@/lib/queries/messages";

interface Props {
  threads: PatientThreadSummary[];
  currentUserId: string;
}

export function PatientMessagesInbox({ threads, currentUserId }: Props) {
  const t = useTranslations();
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, Message[]>>({});
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [threadUnreadCounts, setThreadUnreadCounts] = useState<Record<string, number>>({});

  React.useEffect(() => {
    const counts: Record<string, number> = {};
    threads.forEach((thread) => {
      counts[thread.threadId] = thread.unreadCount;
    });
    setThreadUnreadCounts(counts);
  }, [threads]);

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingThreadId(threadId);

    // Get the original unread count in case we need to restore it
    const originalUnreadCount = threadUnreadCounts[threadId] ?? 0;

    // Optimistic update: set unreadCount to 0 immediately
    setThreadUnreadCounts((prev) => ({
      ...prev,
      [threadId]: 0,
    }));

    try {
      const result = await fetchMessageThread(threadId);
      setThreadMessages((prev) => ({
        ...prev,
        [threadId]: result?.messages ?? [],
      }));
      markThreadRead(threadId);
    } catch {
      toast.error(t("messages.loadError"));
      // Restore the original unread count on error
      setThreadUnreadCounts((prev) => ({
        ...prev,
        [threadId]: originalUnreadCount,
      }));
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

        return (
          <Card key={thread.threadId} className="overflow-hidden p-0">
            <button
              onClick={() => handleToggle(thread.threadId)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 shrink-0 text-primary" />
                  <span className="font-bold text-foreground">{thread.doctorName}</span>
                  {(threadUnreadCounts[thread.threadId] ?? thread.unreadCount) > 0 && (
                    <Badge variant="default" className="text-xs">
                      {threadUnreadCounts[thread.threadId] ?? thread.unreadCount}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="size-4 shrink-0" />
                  <span>
                    {thread.serviceName} • {formatInTirane(thread.appointmentStartsAt, "EEEE, d MMM yyyy — HH:mm")}
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
                <MessageInput
                  threadId={thread.threadId}
                  onSendSuccess={() => handleSendSuccess(thread.threadId)}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
