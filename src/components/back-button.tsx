import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "← History", "← Back": top of a screen opened from another one */
export function BackButton({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground"
      onClick={onClick}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      {children}
    </Button>
  );
}
