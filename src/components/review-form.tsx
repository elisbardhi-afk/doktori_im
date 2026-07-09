"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitReview } from "@/actions/reviews";
import { cn } from "@/lib/utils";

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "size-7 transition-colors",
              n <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({
  appointmentId,
  doctorName,
}: {
  appointmentId: string;
  doctorName: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error(t("reviews.ratingRequired"));
      return;
    }
    setLoading(true);
    const res = await submitReview({
      appointmentId,
      rating,
      comment: comment.trim() || undefined,
    });
    setLoading(false);

    if (!res.ok) {
      if (res.error === "already_reviewed") {
        toast.info(t("reviews.alreadyReviewed"));
      } else {
        toast.error(t("reviews.error"));
      }
      setOpen(false);
      return;
    }

    toast.success(t("reviews.submitted"));
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("reviews.leaveReview")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reviews.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("reviews.subtitle", { doctor: doctorName })}
          </p>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">
              {t("reviews.ratingLabel")}
            </span>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">
              {t("reviews.commentLabel")}
            </span>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("reviews.commentPlaceholder")}
              rows={3}
            />
          </div>
          <Button type="submit" disabled={loading || rating === 0}>
            {loading ? t("common.loading") : t("reviews.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
