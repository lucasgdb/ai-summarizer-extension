import { browser, storage } from "#imports";
import { hasSidePanel, sidebarAction, targetWindowId } from "./browser-support";

/**
 * Where the extension opens when its icon is clicked:
 * - sidepanel: Chrome's side panel (the default). Stays open while the user
 *   clicks around the page, which picking content or a form needs
 * - popup: the usual extension popup under the toolbar icon. Chrome closes
 *   it on the first click outside, so a pick continues in the side panel
 */
export type UiMode = "sidepanel" | "popup";

export const popupPath = "/action-popup.html";

export const uiModeItem = storage.defineItem<UiMode>("local:ui-mode", {
  fallback: "sidepanel",
});

/**
 * Makes the toolbar icon open the chosen mode. Without a side panel there's
 * no choice: Firefox opens its sidebar (the background does, on click),
 * Opera and Arc the popup
 */
export async function applyUiMode(mode: UiMode) {
  if (!hasSidePanel) {
    await browser.action.setPopup({ popup: sidebarAction ? "" : popupPath });
    return;
  }
  await Promise.all([
    browser.sidePanel.setPanelBehavior({
      openPanelOnActionClick: mode === "sidepanel",
    }),
    browser.action.setPopup({ popup: mode === "popup" ? popupPath : "" }),
  ]);
}

/** What the popup hands to the side panel: a pick needs clicks on the page */
export type PanelIntent = "pick-content" | "pick-form";

type PendingIntent = { intent: PanelIntent; windowId: number; at: number };

/** storage.session: extension pages only, gone with the browser */
export const panelIntentItem = storage.defineItem<PendingIntent | null>(
  "session:panel-intent",
  { fallback: null },
);

/** Older than this, a hand-off that never landed is ignored */
const intentTtlMs = 15_000;

/** This window's id, known before any click (sidePanel.open needs the click) */
let windowId: number | undefined;
void targetWindowId().then((id) => {
  windowId = id;
});

export function currentWindowId() {
  return windowId;
}

/**
 * From the popup: opens the side panel in this window, inside the click
 * (Chrome only allows it from a user gesture), and tells it what to do. The
 * popup closes, as Chrome would close it on the first click on the page
 */
export async function continueInPanel(intent: PanelIntent) {
  if (windowId === undefined) return;
  if (!hasSidePanel) {
    await panelIntentItem.setValue({ intent, windowId, at: Date.now() });
    await openDetachedPanel(windowId);
    window.close();
    return;
  }
  const opening = browser.sidePanel.open({ windowId });
  await panelIntentItem.setValue({ intent, windowId, at: Date.now() });
  await opening.catch((error: unknown) => console.error("sidePanel:", error));
  window.close();
}

/**
 * In the side panel: calls `run` with each hand-off meant for this window,
 * the one waiting when it opens and any that comes while it's open
 */
export function watchPanelIntents(run: (intent: PanelIntent) => void) {
  const take = (pending: PendingIntent | null) => {
    if (!pending || pending.windowId !== windowId) return;
    void panelIntentItem.setValue(null);
    if (Date.now() - pending.at < intentTtlMs) run(pending.intent);
  };
  void targetWindowId().then((id) => {
    windowId = id;
    void panelIntentItem.getValue().then(take);
  });
  return panelIntentItem.watch(take);
}

/**
 * No side panel (Opera, Arc): the app in a narrow window of its own at the
 * browser's right edge, which stays open while the user clicks around the
 * page (the popup wouldn't). It works on `windowId`'s tabs; one per browser
 * window, focused again if it's already open
 */
async function openDetachedPanel(windowId: number) {
  const url = browser.runtime.getURL(`/sidepanel.html?window=${windowId}`);
  // Already open: its window comes to the front (getContexts sees our own
  // pages without the "tabs" permission)
  const [open] = await browser.runtime
    .getContexts({ contextTypes: ["TAB"], documentUrls: [url] })
    .catch(() => []);
  if (open?.windowId !== undefined && open.windowId >= 0) {
    await browser.windows.update(open.windowId, { focused: true });
    return;
  }
  const browserWindow = await browser.windows.get(windowId);
  const width = 420;
  const height = Math.min(browserWindow.height ?? 720, screen.availHeight, 760);
  // At the browser window's right edge, kept on the screen (Chrome refuses
  // a window mostly off it)
  const screenLeft = (screen as Screen & { availLeft?: number }).availLeft ?? 0;
  const screenTop = (screen as Screen & { availTop?: number }).availTop ?? 0;
  const left = Math.max(
    screenLeft,
    Math.min(
      (browserWindow.left ?? 0) + (browserWindow.width ?? width) - width,
      screenLeft + screen.availWidth - width,
    ),
  );
  const top = Math.max(screenTop, browserWindow.top ?? screenTop);
  await browser.windows
    .create({ url, type: "popup", width, height, left, top })
    // Still refused (an odd screen layout): wherever the browser puts it
    .catch(() => browser.windows.create({ url, type: "popup", width, height }));
}
