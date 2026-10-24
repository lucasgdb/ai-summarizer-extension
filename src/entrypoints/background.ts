import { browser, defineBackground } from "#imports";
import { AuthError, googleSignInFlow, signInStateItem } from "@/lib/auth";
import { sidebarAction } from "@/lib/browser-support";
import { localeItem } from "@/lib/i18n";
import type { BackgroundRequest } from "@/lib/messages";
import { applyUiMode, type UiMode, uiModeItem } from "@/lib/ui-mode";
import { applyUninstallUrl } from "@/lib/uninstall";

/**
 * Opens the popup once the side panel that asked for it is gone (checked
 * with runtime.getContexts, up to 2 s): opened earlier, the panel closing
 * would take its focus and Chrome would close it at once
 */
async function openPopupAfterPanel(windowId: number) {
  for (let i = 0; i < 20; i++) {
    const panels = await browser.runtime
      .getContexts({ contextTypes: ["SIDE_PANEL"], windowIds: [windowId] })
      .catch(() => []);
    if (!panels.length) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // A beat for the window to settle its focus on the page
  await new Promise((resolve) => setTimeout(resolve, 150));
  await browser.action
    .openPopup({ windowId })
    .catch((error: unknown) => console.error("openPopup:", error));
}

/**
 * Google sign-in for the popup (which Google's window closes). The outcome
 * goes to storage (signInStateItem), tagged with the attempt: the popup
 * reads it if it's still open, and the session is in storage either way.
 * Chrome may stop an idle worker after 30 s: an extension call every 20 s
 * keeps it alive while a window is open
 */
let openFlows = 0;
let keepAlive: ReturnType<typeof setInterval> | undefined;

async function runGoogleSignIn(attempt: string) {
  openFlows++;
  keepAlive ??= setInterval(
    () => void browser.runtime.getPlatformInfo(),
    20_000,
  );
  await signInStateItem.setValue({ status: "pending", attempt });
  try {
    const session = await googleSignInFlow();
    await signInStateItem.setValue({
      status: "done",
      attempt,
      signedIn: session !== null,
    });
  } catch (error) {
    console.error("Sign-in failed:", error);
    await signInStateItem.setValue({
      status: "error",
      attempt,
      reason: error instanceof AuthError ? error.reason : "failed",
    });
  } finally {
    if (--openFlows === 0) {
      clearInterval(keepAlive);
      keepAlive = undefined;
    }
  }
}

/** Only our own pages (the panel, the popup): never a tab's content */
function fromExtensionPage(sender: {
  id?: string;
  tab?: unknown;
  url?: string;
}) {
  return (
    sender.id === browser.runtime.id &&
    sender.tab === undefined &&
    sender.url?.startsWith(browser.runtime.getURL("/")) === true
  );
}

export default defineBackground(() => {
  // Firefox: the toolbar icon opens (and closes) the sidebar. Its click
  // counts as the user's gesture that sidebarAction needs
  const sidebar = sidebarAction;
  if (sidebar) {
    browser.action.onClicked.addListener(() => {
      void sidebar.toggle();
    });
  }

  browser.runtime.onMessage.addListener(
    (message: BackgroundRequest, sender, sendResponse) => {
      if (!fromExtensionPage(sender)) return;
      if (
        message?.type === "open-popup" &&
        Number.isInteger(message.windowId)
      ) {
        // Answered at once: the panel closes as soon as it hears back
        sendResponse(true);
        void openPopupAfterPanel(message.windowId);
      } else if (
        message?.type === "sign-in" &&
        typeof message.attempt === "string" &&
        message.attempt.length <= 64
      ) {
        // Answered at once; the outcome is written to storage
        sendResponse(true);
        void runGoogleSignIn(message.attempt);
      }
    },
  );

  // The icon opens the side panel (default) or a popup, as the user chose.
  // The panel stays open while the user clicks around the page; the popup
  // closes on the first click, so picks continue in the panel
  const apply = (mode: UiMode | null) =>
    applyUiMode(mode ?? "sidepanel").catch((error: unknown) =>
      console.error("UI mode:", error),
    );
  void uiModeItem.getValue().then(apply);
  uiModeItem.watch(apply);

  // The survey that opens after an uninstall, in the extension's language
  void applyUninstallUrl().catch((error: unknown) =>
    console.error("Uninstall URL:", error),
  );
  localeItem.watch((locale) => {
    void applyUninstallUrl(locale ?? undefined).catch(() => {});
  });
});
