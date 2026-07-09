import Link from "next/link";
import { cn } from "@/lib/utils";

export function SpecialtyChip({
  label,
  emoji,
  href,
  active = false,
  className,
}: {
  label: string;
  emoji?: string;
  href?: string;
  active?: boolean;
  className?: string;
}) {
  const classes = cn(
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-soft transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-primary hover:bg-primary-soft",
    className,
  );
  const content = (
    <>
      {emoji && <span aria-hidden>{emoji}</span>}
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
