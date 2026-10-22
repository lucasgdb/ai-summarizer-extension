import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Notice({
  icon: Icon,
  title,
  children,
  actions,
  variant,
  role,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  variant?: "default" | "destructive";
  /**
   * How a screen reader hears it appear: an error interrupts (alert), the
   * rest waits its turn (status)
   */
  role?: "alert" | "status";
}) {
  return (
    <div className="space-y-4">
      <Alert
        variant={variant}
        role={role ?? (variant === "destructive" ? "alert" : "status")}
      >
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
