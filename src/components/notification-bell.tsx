"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatInTirane } from "@/lib/datetime";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

export function NotificationBell({ userId }: { userId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, read_at, created_at, data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();

    const supabase = createClient();
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          setNotifications((prev) => [n, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const unread = notifications.filter((n) => !n.read_at).length;

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    setNotifications((prev) =>
      prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)),
    );
  }

  function toggle() {
    if (!open && unread > 0) markAllRead();
    setOpen((v) => !v);
  }

  function handleNotificationClick(notification: Notification) {
    const threadId = notification.data?.thread_id as string | undefined;
    if (threadId) {
      setOpen(false);
      router.push(`/patient/messages#${threadId}`);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={t("notifications.label")}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Panel */}
          <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-border bg-card shadow-lift">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-bold text-foreground">{t("notifications.title")}</span>
              {notifications.some((n) => !n.read_at) && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline"
                >
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {t("notifications.empty")}
                </p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "w-full border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/50",
                      !n.read_at && "bg-primary-tint",
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {formatInTirane(n.created_at, "d MMM HH:mm")}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
