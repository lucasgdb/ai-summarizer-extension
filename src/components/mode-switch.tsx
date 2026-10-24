import { AppWindowIcon, PanelRightIcon } from "lucide-react";
import { browser } from "#imports";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { canSwitchMode } from "@/lib/browser-support";
import type { BackgroundRequest } from "@/lib/messages";
import { applyUiMode, currentWindowId, uiModeItem } from "@/lib/ui-mode";
import { useUiMode } from "@/lib/ui-mode-context";
import { useDictionary } from "@/lib/use-locale";

/**
 * Switches between the side panel and the toolbar popup, remembers the
 * choice (the icon opens it from then on) and opens it right away
 */
export function ModeSwitch() {
  // Firefox (sidebar), Opera and Arc (popup) have one way to open
  if (!canSwitchMode) return null;
  return <Switch />;
}

function Switch() {
  const dict = useDictionary();
  const mode = useUiMode();
  const next = mode === "sidepanel" ? "popup" : "sidepanel";
  const label = dict.mode[next];

  async function switchMode() {
    const windowId = currentWindowId();
    if (next === "sidepanel") {
      // Called first, while the click still counts as a user gesture
      const opening =
        windowId === undefined
          ? Promise.resolve()
          : browser.sidePanel.open({ windowId });
      await uiModeItem.setValue("sidepanel");
      await applyUiMode("sidepanel");
      await opening.catch(() => {});
      window.close();
      return;
    }
    await uiModeItem.setValue("popup");
    await applyUiMode("popup");
    // The background opens the popup once this panel has closed: opened
    // from here, the panel closing would take its focus and Chrome would
    // close it right away. Closed only after the background heard it
    const handedOver =
      windowId !== undefined &&
      (await Promise.race([
        browser.runtime
          .sendMessage({
            type: "open-popup",
            windowId,
          } satisfies BackgroundRequest)
          .then((answer) => answer === true)
          .catch(() => false),
        // A worker that doesn't wake up in time: open it from here instead
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
      ]));
    if (!handedOver) await browser.action.openPopup().catch(() => {});
    window.close();
  }

  return (
    <Hint label={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-my-1 text-muted-foreground"
        onClick={switchMode}
        aria-label={label}
      >
        {next === "popup" ? <AppWindowIcon /> : <PanelRightIcon />}
      </Button>
    </Hint>
  );
}
