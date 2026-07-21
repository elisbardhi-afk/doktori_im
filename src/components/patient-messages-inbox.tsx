"use client";

import React, { useState, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Stethoscope, Calendar, Briefcase } from "lucide-react";
import { enUS } from "date-fns/locale";
import { sq } from "date-fns/locale";
import { Card } from "@/components/ui/card";

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
  const locale = useLocale();
  const dateLocale = locale === "sq" ? sq : enUS;
  const [view, setView] = useState<"active" | "archived">("active");
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

  const loadThreadRef = useRef<(threadId: string) => Promise<void>>(async () => {});

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
      await markThreadRead(threadId);
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

  loadThreadRef.current = loadThread;

  // Auto-open thread from hash (e.g., from notification click) — runs once on mount
  React.useEffect(() => {
    const threadIdFromHash = window.location.hash.slice(1);
    if (threadIdFromHash && threads.some((thr) => thr.threadId === threadIdFromHash)) {
      setOpenThreadId(threadIdFromHash);
      loadThreadRef.current(threadIdFromHash);
      setTimeout(() => {
        const element = document.getElementById(`thread-${threadIdFromHash}`);
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const now = new Date();
  const activeThreads = threads.filter(
    (thread) => new Date(thread.appointmentStartsAt) > now
  );
  const archivedThreads = threads.filter(
    (thread) => new Date(thread.appointmentStartsAt) <= now
  );
  const displayedThreads = view === "active" ? activeThreads : archivedThreads;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setView("active")}
          className={`px-4 py-2 ${
            view === "active"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("messages.active")} ({activeThreads.length})
        </button>
        <button
          onClick={() => setView("archived")}
          className={`px-4 py-2 ${
            view === "archived"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("messages.archived")}
        </button>
      </div>

      {displayedThreads.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          {view === "active"
            ? t("messages.noActiveThreads")
            : t("messages.noArchivedThreads")}
        </div>
      ) : (
        <>
          {displayedThreads.map((thread) => {
        const isOpen = openThreadId === thread.threadId;
        const isLoading = loadingThreadId === thread.threadId;
        const messages = threadMessages[thread.threadId] ?? [];

        return (
          <Card key={thread.threadId} id={`thread-${thread.threadId}`} className="overflow-hidden p-0">
            <button
              onClick={() => handleToggle(thread.threadId)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 shrink-0 text-primary" />
                  <span className="font-bold text-foreground">{thread.doctorName}</span>
                  {(threadUnreadCounts[thread.threadId] ?? thread.unreadCount) > 0 && (
                    <span className="size-2 rounded-full bg-primary inline-block" aria-label="unread" />
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="size-3.5 shrink-0" />
                    <span>{thread.serviceName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 shrink-0" />
                    <span>
                      {formatInTirane(thread.appointmentStartsAt, "EEEE, d MMM yyyy — HH:mm", dateLocale)}
                    </span>
                  </div>
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
                {view === "active" ? (
                  <MessageInput
                    threadId={thread.threadId}
                    onSendSuccess={() => handleSendSuccess(thread.threadId)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2 border border-border rounded-lg bg-muted/30">
                    {t("messages.readOnly")}
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}
        </>
      )}
    </div>
  );
}
