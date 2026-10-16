import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

/** A toggle: filled when on, outlined (and hoverable) when off */
export function ToggleChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  const locale = useLocale();

  return (
    <Button
      variant={pressed ? "default" : "outline"}
      size="sm"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "gap-1 rounded-full",
        !pressed && "hover:border-foreground/30",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "text-xs tabular-nums",
            pressed ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatNumber(locale, count)}
        </span>
      )}
    </Button>
  );
}
