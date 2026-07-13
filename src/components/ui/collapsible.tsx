"use client";

import * as React from "react";

interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  ({ open, onOpenChange, children }, ref) => {
    const [isOpen, setIsOpen] = React.useState(open ?? false);
    const actualOpen = open !== undefined ? open : isOpen;

    return (
      <div ref={ref} data-state={actualOpen ? "open" : "closed"}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onOpenChange: onOpenChange || setIsOpen,
              isOpen: actualOpen,
            });
          }
          return child;
        })}
      </div>
    );
  }
);
Collapsible.displayName = "Collapsible";

interface CollapsibleTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ onClick, onOpenChange, isOpen, children, ...props }, ref) => (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e);
        onOpenChange?.(!isOpen);
      }}
      {...props}
    >
      {children}
    </button>
  )
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen?: boolean;
}

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ isOpen, style, ...props }, ref) => (
    <div
      ref={ref}
      style={{
        display: isOpen ? "block" : "none",
        ...style,
      }}
      {...props}
    />
  )
);
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
