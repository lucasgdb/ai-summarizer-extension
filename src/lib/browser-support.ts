// What this browser offers for the extension's UI, detected at runtime: one
// Chromium build serves Chrome, Edge, Brave, Vivaldi, Opera and Arc, and
// they don't all have the same APIs. Firefox has its own build (wxt -b
// firefox), with a sidebar instead of the side panel
import { browser } from "#imports";

type SidebarAction = { toggle: () => Promise<void> };

/** Chrome's side panel (Chrome, Edge, Brave, Vivaldi): not Opera, not Arc */
export const hasSidePanel =
  typeof (browser as { sidePanel?: { open?: unknown } }).sidePanel?.open ===
  "function";

/** Firefox's sidebar (sidebar_action): opened by the toolbar icon */
export const sidebarAction = (browser as { sidebarAction?: SidebarAction })
  .sidebarAction;

/**
 * The panel ↔ popup switch: only with a side panel. Firefox stays in its
 * sidebar; Opera and Arc in the popup (picks continue in a window of their
 * own, see ui-mode.ts)
 */
export const canSwitchMode = hasSidePanel;

/**
 * The browser window whose tabs this page works on. The side panel, the
 * popup and Firefox's sidebar belong to it; a detached panel window (no side
 * panel) is told which one in its URL (?window=)
 */
const fromUrl = Number(
  new URLSearchParams(globalThis.location?.search ?? "").get("window"),
);
export const detachedFor =
  Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : undefined;

let target: Promise<number | undefined> | undefined;

export function targetWindowId() {
  target ??=
    detachedFor !== undefined
      ? Promise.resolve(detachedFor)
      : browser.windows.getCurrent().then((window) => window.id);
  return target;
}
