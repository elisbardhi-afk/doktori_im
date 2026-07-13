"use client";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BackButton({ label }: { label: string }) {
  const router = useRouter();

  return (
    <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.back()}>
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
}
