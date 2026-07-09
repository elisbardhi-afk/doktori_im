"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/lib/database.types";

const variantByStatus: Record<
  AppointmentStatus,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "destructive",
  completed: "secondary",
  no_show: "destructive",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const t = useTranslations("appointments.status");
  return <Badge variant={variantByStatus[status]}>{t(status)}</Badge>;
}
