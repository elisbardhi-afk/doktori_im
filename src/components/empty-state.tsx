import type { LucideIcon } from "lucide-react";
import * as Icons from "lucide-react";

export function EmptyState({
  title,
  description,
  icon = "Inbox",
}: {
  title: string;
  description?: string;
  icon?: keyof typeof Icons;
}) {
  const Icon = Icons[icon] as LucideIcon;
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-6" />
      </span>
      <p className="font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
