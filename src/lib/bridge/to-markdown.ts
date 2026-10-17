// What gets summarized: the text a reader sees, as light Markdown. Headings,
// lists, quotes, tables and code keep their shape (the model reads the
// hierarchy, and code shown on the page, HTML included, arrives fenced as
// code), while what isn't content for anyone (hidden or screen-reader-only
// text, controls, media) stays out. Links keep only their text.
//
// Runs on the live page, not a copy: visibility and code blocks need the
// computed styles.

const htmlNamespace = "http://www.w3.org/1999/xhtml";
const mathNamespace = "http://www.w3.org/1998/Math/MathML";

/** Never content: controls, media and embedded documents */
const skipped =
  "script,style,noscript,template,svg,canvas,iframe,frame,object,embed,video,audio,img,picture,map,button,select,input,textarea,option,datalist,meter,progress,[role='button'],[role='toolbar'],[role='menu'],[role='menubar']";

/** Hidden from everyone, including assistive technology */
const hidden = "[hidden],[aria-hidden='true'],[inert]";

/** Tailwind's and Bootstrap's sr-only, and the usual 1×1 clipped variants */
function isScreenReaderOnly(element: HTMLElement, style: CSSStyleDeclaration) {
  if (style.position !== "absolute" && style.position !== "fixed") return false;
  return (
    style.clip === "rect(0px, 0px, 0px, 0px)" ||
    style.clip === "rect(1px, 1px, 1px, 1px)" ||
    style.clipPath === "inset(50%)" ||
    style.clipPath === "inset(100%)" ||
    (element.offsetWidth <= 1 &&
      element.offsetHeight <= 1 &&
      style.overflow === "hidden")
  );
}

/** "language-ts", "lang-js", "highlight-source-go": the fence's language */
function codeLanguage(element: Element) {
  const classes = [
    element.className,
    element.querySelector("code")?.className ?? "",
    element.parentElement?.className ?? "",
  ].join(" ");
  const match = classes.match(
    /(?:^|\s)(?:language|lang|highlight-source)-([\w+#.-]+)/,
  );
  return match?.[1]?.toLowerCase() ?? "";
}

/** A fence longer than any backtick run in the code, so it can't close early */
function fence(code: string, language: string) {
  const longest = Math.max(
    2,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  const marks = "`".repeat(longest + 1);
  return `${marks}${language}\n${code.replace(/\n+$/, "")}\n${marks}`;
}

/** Cells with short text and no tables inside: data, not page layout */
function isDataTable(table: HTMLTableElement) {
  if (table.querySelector("table")) return false;
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.innerText.length > 300) return false;
    }
  }
  return true;
}

function cellText(cell: HTMLTableCellElement) {
  return cell.innerText.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}

/**
 * Collects blocks (paragraphs, headings, items…) and the inline text of the
 * one being written. `gap` marks where a blank line goes (around headings,
 * code and tables), so the output reads like hand-written Markdown
 */
class Writer {
  readonly blocks: string[] = [];
  private line = "";

  text(value: string) {
    this.line += value;
  }

  /** Ends the current block, if it has any text */
  flush() {
    const clean = this.line.replace(/\s+/g, " ").trim();
    if (clean) this.blocks.push(clean);
    this.line = "";
  }

  block(value: string, { gap = false } = {}) {
    this.flush();
    if (gap) this.blocks.push("");
    this.blocks.push(value);
    if (gap) this.blocks.push("");
  }

  /**
   * The blocks `write` produces, as items of this one: `first` before the
   * first, `rest` before the others and before every further line (a list
   * item's paragraphs and code, a quote's lines). Each stays one block, so
   * repeated lines inside code are never mistaken for repeated blocks
   */
  nest(write: (writer: Writer) => void, first: string, rest: string) {
    this.flush();
    const inner = new Writer();
    write(inner);
    inner.flush();
    const blocks = inner.blocks.filter(Boolean);
    blocks.forEach((block, index) => {
      const head = index === 0 ? first : rest;
      this.blocks.push(`${head}${block.split("\n").join(`\n${rest}`)}`);
    });
  }
}

/**
 * What's rendered inside `node`: an open shadow root's content (MDN's code
 * examples are web components, which innerText never reaches), with each
 * <slot> replaced by the light children assigned to it
 */
function walkChildren(node: Node, writer: Writer) {
  const shadow =
    node.nodeType === Node.ELEMENT_NODE && (node as Element).shadowRoot;
  for (const child of (shadow || node).childNodes) walk(child, writer);
}

function walkSlot(slot: HTMLSlotElement, writer: Writer) {
  const assigned = slot.assignedNodes({ flatten: true });
  if (assigned.length === 0) {
    // Nothing slotted: its fallback content shows
    for (const child of slot.childNodes) walk(child, writer);
    return;
  }
  for (const child of assigned) walk(child, writer);
}

/** `root` is read whatever it is: the user picked it */
function walk(node: Node, writer: Writer, root = false) {
  if (node.nodeType === Node.TEXT_NODE) {
    writer.text((node as Text).data);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  // By namespace, not instanceof: a page can replace its HTMLElement global
  const namespace = (node as Element).namespaceURI;
  // MathML: its text, as innerText would give it
  if (namespace === mathNamespace) {
    const math = node as Element;
    if (math.checkVisibility()) writer.text(` ${math.textContent ?? ""} `);
    return;
  }
  if (namespace !== htmlNamespace) return;
  const element = node as HTMLElement;
  const style = getComputedStyle(element);
  if (!root) {
    if (element.matches(skipped) || element.matches(hidden)) return;
    if (
      // Not opacity: sections fading in as they scroll into view sit at 0
      // until then, and innerText keeps them too. display: contents has no
      // box, so checkVisibility says no, but its children are shown
      (style.display !== "contents" &&
        !element.checkVisibility({ checkVisibilityCSS: true })) ||
      isScreenReaderOnly(element, style)
    ) {
      return;
    }
  }
  const tag = element.tagName.toLowerCase();

  if (tag === "slot") {
    walkSlot(element as HTMLSlotElement, writer);
    return;
  }
  if (tag === "br") {
    writer.flush();
    return;
  }
  // Code as it's shown, fenced: an HTML example stays an example
  const monospace = /mono|courier|consolas|menlo/i.test(style.fontFamily);
  if (
    tag === "pre" ||
    (monospace &&
      style.whiteSpace.startsWith("pre") &&
      !style.display.startsWith("inline") &&
      element.innerText.includes("\n"))
  ) {
    const code = element.innerText;
    if (code.trim()) {
      writer.block(fence(code, codeLanguage(element)), { gap: true });
    }
    return;
  }
  if (/^h[1-6]$/.test(tag)) {
    writer.flush();
    const heading = new Writer();
    walkChildren(element, heading);
    heading.flush();
    const text = heading.blocks.join(" ").trim();
    if (text) {
      writer.block(`${"#".repeat(Number(tag[1]))} ${text}`, { gap: true });
    }
    return;
  }
  if (tag === "li") {
    const ordered = element.parentElement?.tagName === "OL";
    writer.nest(
      (inner) => walkChildren(element, inner),
      ordered ? "1. " : "- ",
      "  ",
    );
    return;
  }
  if (tag === "blockquote") {
    writer.nest((inner) => walkChildren(element, inner), "> ", "> ");
    return;
  }
  if (tag === "table" && isDataTable(element as HTMLTableElement)) {
    const rows = [...(element as HTMLTableElement).rows]
      .map((row) => [...row.cells].map(cellText))
      .filter((cells) => cells.some(Boolean))
      .map((cells) => `| ${cells.join(" | ")} |`);
    if (rows.length > 0) writer.block(rows.join("\n"), { gap: true });
    return;
  }
  if (tag === "code" || tag === "kbd" || tag === "samp") {
    const code = element.innerText.replace(/\s+/g, " ").trim();
    if (code) {
      writer.text(code.includes("`") ? code : `\`${code}\``);
    }
    return;
  }

  // display: contents adds no box of its own; everything else that isn't
  // inline starts and ends a block (flex and grid items are blockified)
  const inline =
    style.display.startsWith("inline") || style.display === "contents";
  if (!inline) writer.flush();
  walkChildren(element, writer);
  if (!inline) writer.flush();
}

/**
 * The visible text of `root` as light Markdown. The root itself is always
 * read (the user picked it), whatever it is
 */
export function toMarkdown(root: HTMLElement) {
  const writer = new Writer();
  walk(root, writer, true);
  writer.flush();

  // No blank line at the edges, never two in a row, and no repeated lines
  // ("Reply", "Share"… under every comment)
  const lines: string[] = [];
  for (const block of writer.blocks) {
    if (!block && (!lines.length || !lines.at(-1))) continue;
    if (block && block === lines.at(-1)) continue;
    lines.push(block);
  }
  while (lines.length && !lines.at(-1)) lines.pop();
  return lines.join("\n");
}

/** Words a reader sees: Markdown marks (#, -, |, ```) don't count */
export function countWords(markdown: string) {
  return markdown.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word))
    .length;
}
