import { browser, storage } from "#imports";

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

/** Makes the toolbar icon open the chosen mode */
export async function applyUiMode(mode: UiMode) {
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
void browser.windows.getCurrent().then((window) => {
  windowId = window.id;
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
  void browser.windows.getCurrent().then((window) => {
    windowId = window.id;
    void panelIntentItem.getValue().then(take);
  });
  return panelIntentItem.watch(take);
}
