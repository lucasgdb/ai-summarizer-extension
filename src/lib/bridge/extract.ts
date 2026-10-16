import type { PickedContent } from "@/lib/messages";

// ~15k tokens: plenty for a summary, and keeps one bad pick from costing a fortune
export const maxChars = 60_000;

export function normalize(raw: string) {
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (clean || lines.at(-1)) {
      lines.push(clean);
    }
  }
  return lines.join("\n").trim();
}

export function describe(element: Element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = [...element.classList]
    .slice(0, 2)
    .map((name) => `.${name}`)
    .join("");
  return `${tag}${id}${classes}`;
}

export function extract(
  element: HTMLElement,
  source: PickedContent["source"],
): PickedContent {
  const text = normalize(element.innerText);
  return {
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    source,
    label: describe(element),
    title: document.title,
    url: location.href,
  };
}

/** Best guess at the main content when the user skips the picker */
export function mainContent() {
  return (
    document.querySelector<HTMLElement>("article, main, [role='main']") ??
    document.body
  );
}
