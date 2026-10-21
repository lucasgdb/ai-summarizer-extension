import { getDictionary, getLocale, localeItem } from "@/lib/i18n";
import type { PickerCommand } from "@/lib/messages";
import { describe } from "./extract";

type Handlers = {
  onPick: (element: HTMLElement) => void;
  onCancel: () => void;
  /**
   * What hovering an element really points at: for "fill", the whole form
   * around it rather than the label or button under the mouse
   */
  snap?: (element: HTMLElement) => HTMLElement;
};

const accent = "#2563eb";

const css = `
  :host { all: initial; }
  .box {
    position: fixed;
    pointer-events: none;
    box-sizing: border-box;
    border: 1.5px solid ${accent};
    background: rgb(37 99 235 / 0.12);
    border-radius: 2px;
    transition: all 60ms ease-out;
  }
  .label, .hint {
    position: fixed;
    pointer-events: none;
    font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #ededed;
    background: #0a0a0a;
    border-radius: 4px;
    white-space: nowrap;
  }
  .label { padding: 2px 6px; }
  .label span { color: #a3a3a3; margin-left: 6px; }
  .hint {
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    padding: 6px 10px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
  }
  [hidden] { display: none; }
`;

// Page handlers must not see the clicks that belong to the picker
const blockedEvents = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "auxclick",
  "dblclick",
  "contextmenu",
] as const;

export const keyCommands: Partial<Record<string, PickerCommand>> = {
  ArrowUp: "parent",
  ArrowDown: "child",
  Enter: "select",
  Escape: "cancel",
};

export function startPicker({ onPick, onCancel, snap }: Handlers) {
  const host = document.createElement("ai-summarizer-picker");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = css;
  const box = document.createElement("div");
  box.className = "box";
  const label = document.createElement("div");
  label.className = "label";
  const hint = document.createElement("div");
  hint.className = "hint";
  async function translate() {
    hint.textContent = getDictionary(await getLocale()).pickerHint;
  }
  void translate();
  // Follows the language switch in the panel while picking
  const unwatchLocale = localeItem.watch(translate);
  box.hidden = label.hidden = true;
  root.append(style, box, label, hint);

  const cursor = document.createElement("style");
  cursor.textContent = "*{cursor:crosshair!important}";

  let current: HTMLElement | null = null;
  // Elements left behind by ↑, so ↓ can walk back down
  let trail: HTMLElement[] = [];

  function draw() {
    if (!current) {
      box.hidden = label.hidden = true;
      return;
    }
    const rect = current.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    label.innerHTML = "";
    label.append(describe(current));
    const size = document.createElement("span");
    size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    label.append(size);
    // Above the box, or inside it when there's no room at the top
    const top = rect.top > 24 ? rect.top - 22 : Math.max(rect.top, 0) + 4;
    Object.assign(label.style, {
      top: `${top}px`,
      left: `${Math.max(rect.left, 4)}px`,
    });
    box.hidden = label.hidden = false;
  }

  function highlight(element: HTMLElement | null) {
    current = element;
    draw();
  }

  /** The element under the pointer, snapped (see Handlers.snap) */
  function pointedAt(x: number, y: number) {
    const target = document.elementFromPoint(x, y);
    if (!(target instanceof HTMLElement)) return null;
    return snap ? snap(target) : target;
  }

  function onPointerMove(event: PointerEvent) {
    const target = pointedAt(event.clientX, event.clientY);
    if (target && target !== current && !trail.includes(target)) {
      trail = [];
      highlight(target);
    }
  }

  function onClick(event: MouseEvent) {
    event.preventDefault();
    event.stopImmediatePropagation();
    // A click with no move before it (the panel had the focus) still picks
    // what's under the pointer
    const picked = current ?? pointedAt(event.clientX, event.clientY);
    if (picked) {
      stop();
      onPick(picked);
    }
  }

  function onBlocked(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function run(command: PickerCommand) {
    const parent = current?.parentElement;
    switch (command) {
      case "cancel":
        stop();
        onCancel();
        break;
      case "parent":
        if (current && parent && parent !== document.documentElement) {
          trail.push(current);
          highlight(parent);
        }
        break;
      case "child": {
        const child = trail.pop();
        if (child) highlight(child);
        break;
      }
      case "select":
        if (current) {
          const picked = current;
          stop();
          onPick(picked);
        }
        break;
    }
  }

  // Only reached when the page has focus; otherwise the panel forwards keys
  function onKeyDown(event: KeyboardEvent) {
    const command = keyCommands[event.key];
    if (!command) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run(command);
  }

  const options = { capture: true } as const;
  const passive = { capture: true, passive: true } as const;

  function stop() {
    window.removeEventListener("pointermove", onPointerMove, passive);
    window.removeEventListener("click", onClick, options);
    window.removeEventListener("keydown", onKeyDown, options);
    window.removeEventListener("scroll", draw, passive);
    window.removeEventListener("resize", draw, passive);
    for (const type of blockedEvents) {
      window.removeEventListener(type, onBlocked, options);
    }
    unwatchLocale();
    host.remove();
    cursor.remove();
  }

  window.addEventListener("pointermove", onPointerMove, passive);
  window.addEventListener("click", onClick, options);
  window.addEventListener("keydown", onKeyDown, options);
  window.addEventListener("scroll", draw, passive);
  window.addEventListener("resize", draw, passive);
  for (const type of blockedEvents) {
    window.addEventListener(type, onBlocked, options);
  }
  document.documentElement.append(host);
  document.head.append(cursor);

  return { stop, run };
}
