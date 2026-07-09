import type { LucideIcon } from "lucide-react";
import * as Icons from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Icons;
}) {
  const Icon = Icons[icon] as LucideIcon;
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-6" />
      </span>
      <div>
        <p className="text-2xl font-extrabold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
