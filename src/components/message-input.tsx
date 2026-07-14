"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "@/actions/appointment-edit";

export function MessageInput({
  threadId,
  onSendSuccess,
}: {
  threadId: string;
  onSendSuccess?: () => void;
}) {
  const t = useTranslations();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!body.trim()) {
      toast.error(t("messages.emptyError") || "Message cannot be empty");
      return;
    }

    setLoading(true);
    const result = await sendMessage(threadId, body);
    setLoading(false);

    if (!result.ok) {
      toast.error(
        result.error === "EMPTY_MESSAGE"
          ? t("messages.emptyError")
          : t("common.error"),
      );
      return;
    }

    toast.success(t("messages.sent") || "Message sent");
    setBody("");
    onSendSuccess?.();
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("messages.inputPlaceholder") || "Type a message..."}
        rows={3}
        disabled={loading}
      />
      <Button
        onClick={handleSend}
        disabled={loading || !body.trim()}
        className="w-full"
      >
        {loading ? t("common.loading") : t("messages.send") || "Send"}
      </Button>
    </div>
  );
}
