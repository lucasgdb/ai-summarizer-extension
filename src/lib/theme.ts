export type Theme = "light" | "dark";

// Also read by public/theme.js, which applies it before the first paint
export const themeStorageKey = "theme";

export function storedTheme(): Theme | null {
  try {
    const theme = localStorage.getItem(themeStorageKey);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  const attribute = document.documentElement.getAttribute("data-theme");
  if (attribute === "light" || attribute === "dark") {
    return attribute;
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme | null) {
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

// Hover transitions would animate some colors while the rest of the page
// switches instantly.
export function withoutTransitions(change: () => void) {
  const style = document.createElement("style");
  style.textContent =
    "*,*::before,*::after{transition:none!important;animation-duration:0s!important}";
  document.head.append(style);
  change();
  void getComputedStyle(document.body).color;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => style.remove());
  });
}

/** Flips light/dark and remembers it */
export function toggleTheme() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(themeStorageKey, next);
  } catch {}
  withoutTransitions(() => applyTheme(next));
}

/** Keeps other open extension pages in step when one switches the theme */
export function syncThemeAcrossPages() {
  function onStorage(event: StorageEvent) {
    if (event.key === themeStorageKey) {
      withoutTransitions(() => applyTheme(storedTheme()));
    }
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
