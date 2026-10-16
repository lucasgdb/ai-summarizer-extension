import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Notice({
  icon: Icon,
  title,
  children,
  actions,
  variant,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <div className="space-y-4" aria-live="polite">
      <Alert variant={variant}>
        <Icon />
        <AlertTitle>{title}</AlertTitle>
        {children && <AlertDescription>{children}</AlertDescription>}
      </Alert>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
