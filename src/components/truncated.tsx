import { type ReactNode, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Text cut by `truncate` or `line-clamp-*` (in `className`), with the whole
 * text in a tooltip, only when it's actually cut: a short title shows none
 */
export function Truncated({
  as: Tag = "span",
  className,
  text,
  children,
}: {
  as?: "span" | "p";
  className?: string;
  /** The whole text, for the tooltip */
  text: string;
  /** What's shown, when it isn't just `text` */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  function onOpenChange(next: boolean) {
    const element = ref.current;
    const cut =
      !!element &&
      (element.scrollWidth > element.clientWidth ||
        element.scrollHeight > element.clientHeight);
    setOpen(next && cut);
  }

  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>
        <Tag
          // biome-ignore lint/suspicious/noExplicitAny: one ref for either tag
          ref={ref as any}
          className={className}
        >
          {children ?? text}
        </Tag>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 break-words">{text}</TooltipContent>
    </Tooltip>
  );
}
