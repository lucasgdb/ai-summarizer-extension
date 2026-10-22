import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * When the focused control goes away with the screen it was on (the button
 * that started a pick, Back, Delete…), focus would fall to the page and a
 * keyboard or screen reader user would start over from the top. Instead it
 * lands on the new screen's heading (or this box, without one). Only when
 * focus was really lost: never taken from where the user put it
 */
export function KeepFocus({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let last: Element | null = null;
    const onFocusIn = (event: FocusEvent) => {
      last = event.target as Element;
    };
    const observer = new MutationObserver(() => {
      if (!last || last.isConnected) return;
      last = null;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      // The first heading on screen: hidden sections (kept mounted) don't count
      const heading = [...root.querySelectorAll<HTMLElement>("h1, h2")].find(
        (element) => element.checkVisibility(),
      );
      if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      (heading ?? root).focus({ preventScroll: true });
    });
    root.addEventListener("focusin", onFocusIn);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className={cn("outline-none", className)}>
      {children}
    </div>
  );
}
