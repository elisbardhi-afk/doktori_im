"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { timeInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/queries/messages";

export function MessageThread({
  messages,
  isLoading,
  currentUserId,
}: {
  messages: Message[];
  isLoading: boolean;
  currentUserId: string;
}) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-center text-sm text-muted-foreground">
          {t("messages.empty") || "No messages yet. Start the conversation."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-64 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4"
    >
      {messages.map((msg) => {
        const isOwn = msg.senderId === currentUserId;
        return (
          <div
            key={msg.id}
            className={cn("flex flex-col gap-1", isOwn && "items-end")}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">{msg.senderName}</span>
              <span>{timeInTirane(msg.createdAt)}</span>
              {msg.readAt && <span className="opacity-60">✓</span>}
            </div>
            <div
              className={cn(
                "max-w-xs rounded-lg px-3 py-2 text-sm",
                isOwn
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {msg.body}
            </div>
          </div>
        );
      })}
      {isLoading && (
        <div className="flex justify-center">
          <div className="text-xs text-muted-foreground">
            {t("common.loading") || "Loading..."}
          </div>
        </div>
      )}
    </div>
  );
}
