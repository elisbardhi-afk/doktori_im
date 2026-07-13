"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function PastAppointmentsCollapsible({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {title}
        <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
      </button>
      <CollapsibleContent className="mt-3" isOpen={isOpen}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
