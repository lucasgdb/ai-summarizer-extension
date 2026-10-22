// "Fill": finds the fields of a pick (or the page), describes them for the
// API, and writes the answers back. Runs in the page, in the extension's
// isolated world: it keeps which element each field id is, so the panel only
// ever deals in ids.
//
// What a person sees is what counts: labels, legends and help text, native
// controls and their ARIA lookalikes (Radix/shadcn radios, checkboxes and
// switches are buttons with a role). Never read, never sent, never filled:
// passwords, payment cards, files, one-time codes and hidden fields. Nothing
// is ever submitted.

import type {
  FillOutcome,
  FillReport,
  FormAnswer,
  FormField,
  FormFieldKind,
  ScannedForm,
} from "@/lib/messages";
import { describe } from "./extract";
import { durations, highlight, highlightTyping } from "./palette";

/** What the API takes (GET /forms/options: max_fields) */
const maxFields = 100;
const maxLabel = 500;
const maxOptions = 50;

type Handle =
  | { kind: "text"; element: HTMLInputElement | HTMLTextAreaElement }
  | { kind: "select"; element: HTMLSelectElement }
  /** Native radios of one name, or the ARIA radios of one radiogroup */
  | { kind: "radio"; options: Choice[] }
  | { kind: "checkbox"; element: HTMLElement }
  | { kind: "checkbox_group"; options: Choice[] };

type Choice = { value: string; element: HTMLElement };

/** Before the last fill, for "Undo" */
type Snapshot =
  | {
      kind: "value";
      element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      value: string;
    }
  | { kind: "checked"; element: HTMLElement; checked: boolean };

let fields = new Map<string, Handle>();
let undo: Snapshot[] = [];

// --- Reading -----------------------------------------------------------------

/**
 * Text of an element with a space wherever its children meet: a legend with a
 * badge reads "Motivo da nota? obrigatória", not "nota?obrigatória"
 */
function textOf(
  element: Element | null | undefined,
  /** Subtrees to leave out (the control itself, the legend) */
  skip: Element[] = [],
): string {
  if (!element) return "";
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push((node as Text).data);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    if (skip.includes(child)) return;
    if (child.matches("script,style,svg,input,select,textarea,option")) return;
    if (child.matches("[aria-hidden='true'],[hidden]")) return;
    parts.push(" ");
    for (const grandchild of child.childNodes) walk(grandchild);
    parts.push(" ");
  };
  for (const child of element.childNodes) walk(child);
  return parts.join("").replace(/\s+/g, " ").trim();
}

function cut(text: string, max = maxLabel) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function byIds(ids: string | null) {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => textOf(document.getElementById(id)))
    .filter(Boolean)
    .join(" ");
}

/** A heading-like text right before the control, for fields with no label */
function precedingText(element: Element) {
  let node: Element | null = element;
  for (let depth = 0; node && depth < 4; depth++) {
    let previous = node.previousElementSibling;
    while (previous) {
      const text = textOf(previous);
      if (text) return text.length <= 200 ? text : "";
      previous = previous.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
}

function labelOf(element: HTMLElement) {
  const labelled =
    byIds(element.getAttribute("aria-labelledby")) ||
    element.getAttribute("aria-label")?.trim();
  if (labelled) return labelled;
  if ("labels" in element) {
    const labels = (element as HTMLInputElement).labels;
    const text = labels
      ? [...labels]
          .map((label) => textOf(label))
          .join(" ")
          .trim()
      : "";
    if (text) return text;
  }
  const legend = element.closest("fieldset")?.querySelector("legend");
  if (legend) return textOf(legend);
  return (
    element.getAttribute("placeholder")?.trim() ||
    precedingText(element) ||
    element
      .getAttribute("name")
      ?.replace(/[-_[\]]+/g, " ")
      .trim() ||
    ""
  );
}

/**
 * The help text: aria-describedby, or the rest of the field's own fieldset
 * ("Be specific…", "0/10 characters") when it holds just this field
 */
function descriptionOf(element: HTMLElement, label: string) {
  const described = byIds(element.getAttribute("aria-describedby"));
  if (described) return described;
  const fieldset = element.closest("fieldset");
  if (!fieldset) return "";
  const controls = fieldset.querySelectorAll(
    "input:not([type=hidden]),textarea,select,[role=radiogroup],[role=checkbox],[role=switch]",
  );
  if (controls.length > 1 && !element.matches("[role=radiogroup]")) return "";
  // Not the question (legend) nor the control's own text (a radiogroup's
  // options are sent as options already)
  const legend = fieldset.querySelector("legend");
  return textOf(fieldset, [element, ...(legend ? [legend] : [])])
    .replace(label, "")
    .trim();
}

function isRequired(element: HTMLElement) {
  return (
    (element as HTMLInputElement).required === true ||
    element.getAttribute("aria-required") === "true"
  );
}

/** Seen by a person: the element, or (for a visually hidden input) its label */
function isShown(element: HTMLElement) {
  if (element.checkVisibility({ checkVisibilityCSS: true })) return true;
  const label =
    (element as HTMLInputElement).labels?.[0] ?? element.closest("label");
  return label?.checkVisibility({ checkVisibilityCSS: true }) ?? false;
}

function isSensitive(input: HTMLInputElement) {
  const autocomplete = input.autocomplete?.toLowerCase() ?? "";
  return (
    input.type === "password" ||
    input.type === "file" ||
    autocomplete.startsWith("cc-") ||
    autocomplete === "one-time-code" ||
    autocomplete.includes("current-password") ||
    autocomplete.includes("new-password") ||
    /captcha/i.test(`${input.name} ${input.id} ${input.className}`)
  );
}

const textKinds: Record<string, FormFieldKind> = {
  text: "text",
  search: "text",
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
};

function choiceLabel(element: HTMLElement) {
  return (
    element.getAttribute("aria-label")?.trim() ||
    byIds(element.getAttribute("aria-labelledby")) ||
    ((element as HTMLInputElement).labels?.[0]
      ? textOf((element as HTMLInputElement).labels?.[0])
      : "") ||
    textOf(element.closest("label")) ||
    textOf(element) ||
    (element as HTMLInputElement).value ||
    ""
  );
}

function isChecked(element: HTMLElement) {
  if (element instanceof HTMLInputElement) return element.checked;
  return element.getAttribute("aria-checked") === "true";
}

/** A radiogroup's label: its own, else the fieldset it's the question of */
function groupLabel(group: HTMLElement) {
  return (
    byIds(group.getAttribute("aria-labelledby")) ||
    textOf(group.closest("fieldset")?.querySelector("legend")) ||
    group.getAttribute("aria-label")?.trim() ||
    precedingText(group)
  );
}

// --- Elements that survive a re-render ---------------------------------------
//
// React may replace a control's node on any render (a list re-keyed, a
// component defined inline). A field keeps where its element was (its path
// in the page) and what it says (its label), and finds the new node when the
// old one is gone, so a click or a check never lands on a detached element.

type Ref = {
  last: HTMLElement;
  path: number[];
  selector: string;
  text: string;
};

function pathOf(element: Element) {
  const path: number[] = [];
  let node: Element | null = element;
  while (node && node !== document.documentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    path.unshift([...parent.children].indexOf(node));
    node = parent;
  }
  return path;
}

function elementAt(path: number[]) {
  let node: Element | undefined = document.documentElement;
  for (const index of path) {
    node = node?.children[index];
    if (!node) return null;
  }
  return node instanceof HTMLElement ? node : null;
}

function selectorOf(element: HTMLElement) {
  const role = element.getAttribute("role");
  const type = element instanceof HTMLInputElement ? element.type : "";
  return `${element.tagName.toLowerCase()}${role ? `[role="${role}"]` : ""}${
    type ? `[type="${type}"]` : ""
  }`;
}

/** What tells this control from its neighbours: its option text or label */
function identityOf(element: HTMLElement) {
  const checkable =
    element.matches("[role=checkbox],[role=radio],[role=switch]") ||
    (element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio"));
  return checkable ? choiceLabel(element) : labelOf(element);
}

function resolve(ref: Ref) {
  if (ref.last.isConnected) return ref.last;
  const at = elementAt(ref.path);
  if (at?.matches(ref.selector) && identityOf(at) === ref.text) {
    ref.last = at;
    return at;
  }
  // Moved: the one control with the same kind and the same text
  const same = [...document.querySelectorAll<HTMLElement>(ref.selector)].filter(
    (candidate) => identityOf(candidate) === ref.text,
  );
  const found =
    same.length === 1 ? same[0] : at?.matches(ref.selector) ? at : null;
  if (found) ref.last = found;
  return ref.last;
}

/** `base` with an `element` that always answers with the live node */
function withElement<T extends object, E extends HTMLElement>(
  base: T,
  element: E,
): T & { readonly element: E } {
  const ref: Ref = {
    last: element,
    path: pathOf(element),
    selector: selectorOf(element),
    text: identityOf(element),
  };
  return Object.defineProperty(base, "element", {
    get: () => resolve(ref),
    enumerable: true,
  }) as T & { readonly element: E };
}

/** `base` whose `element` is whatever `source.element` is at the time */
function linkedTo<T extends object, E extends HTMLElement>(
  base: T,
  source: { readonly element: E },
): T & { readonly element: E } {
  return Object.defineProperty(base, "element", {
    get: () => source.element,
    enumerable: true,
  }) as T & { readonly element: E };
}

/**
 * The question a checkbox belongs to: the closest fieldset with a legend, or
 * a [role=group]. Native ones with no such container group by name
 */
function questionOf(box: HTMLElement): Element | string | null {
  const fieldset = box.closest("fieldset");
  if (fieldset?.querySelector("legend")) return fieldset;
  const group = box.closest("[role=group]");
  if (group) return group;
  if (box instanceof HTMLInputElement && box.name) return `name:${box.name}`;
  return null;
}

/** "Choose up to 3", "no máximo 2", "at least 1"… in the question's words */
function choiceLimits(text: string) {
  const max = text.match(
    /(?:at[ée]|no m[áa]ximo|up to|at most|max(?:imum)?\.?)\s*(\d+)/i,
  );
  const min = text.match(
    /(?:pelo menos|no m[íi]nimo|at least|min(?:imum)?\.?)\s*(\d+)/i,
  );
  return {
    ...(max && { max_choices: Number(max[1]) }),
    ...(min && { min_choices: Number(min[1]) }),
  };
}

function choiceValue(box: HTMLElement, index: number) {
  const value =
    box instanceof HTMLInputElement
      ? box.value
      : (box.getAttribute("value") ?? box.dataset.value);
  return value && value !== "on" ? value : `${index}`;
}

type Found = { field: Omit<FormField, "id">; handle: Handle; at: Element };

/**
 * Checkboxes of one question become one checkbox_group (the question as its
 * label, the help text as its description, the boxes as options); a lone one
 * stays a checkbox, labelled by its own text
 */
function groupCheckboxes(boxes: HTMLElement[]): Found[] {
  const groups = new Map<Element | string, HTMLElement[]>();
  const result: Found[] = [];
  const single = (box: HTMLElement) =>
    result.push({
      at: box,
      handle: withElement({ kind: "checkbox" as const }, box),
      field: {
        kind: "checkbox",
        label: choiceLabel(box) || labelOf(box),
        required: isRequired(box),
        filled: isChecked(box),
      },
    });

  for (const box of boxes) {
    const question = questionOf(box);
    if (question) groups.set(question, [...(groups.get(question) ?? []), box]);
    else single(box);
  }

  for (const [question, members] of groups) {
    if (members.length < 2) {
      for (const box of members) single(box);
      continue;
    }
    const ordered = [...members].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const container = typeof question === "string" ? null : question;
    const first = ordered[0] as HTMLElement;
    const legend = container?.querySelector("legend") ?? null;
    const label =
      textOf(legend) ||
      byIds(container?.getAttribute("aria-labelledby") ?? null) ||
      container?.getAttribute("aria-label")?.trim() ||
      precedingText(container ?? first.closest("label") ?? first) ||
      (typeof question === "string" ? question.slice("name:".length) : "");
    // The help text: not the question, not the options' own labels
    const optionTexts = ordered.flatMap((box) => {
      const labels: Element[] = [box];
      const native = (box as HTMLInputElement).labels;
      if (native) labels.push(...native);
      const wrapping = box.closest("label");
      if (wrapping) labels.push(wrapping);
      return labels;
    });
    const description =
      byIds(container?.getAttribute("aria-describedby") ?? null) ||
      (container
        ? textOf(container, [...(legend ? [legend] : []), ...optionTexts])
        : "");
    const options = ordered.map((box, index) =>
      withElement({ value: choiceValue(box, index) }, box),
    );
    result.push({
      at: first,
      handle: { kind: "checkbox_group", options },
      field: {
        kind: "checkbox_group",
        label,
        ...(description && { description }),
        required:
          ordered.some(isRequired) ||
          (container instanceof HTMLElement && isRequired(container)),
        filled: ordered.some(isChecked),
        ...choiceLimits(`${label} ${description}`),
        options: options.map((option) => ({
          value: option.value,
          label: choiceLabel(option.element),
        })),
      },
    });
  }
  return result;
}

/**
 * The fields inside `root`, in page order. Remembered here until the next
 * scan, so fill and undo can find them by id
 */
export function scanForm(root: HTMLElement, label: string): ScannedForm {
  const found: { field: Omit<FormField, "id">; handle: Handle; at: Element }[] =
    [];
  let sensitive = 0;
  let unsupported = 0;
  const seenRadioNames = new Set<string>();
  /** Native and ARIA, grouped by question once all are found */
  const checkboxes: HTMLElement[] = [];

  const scope = (selector: string) => [
    ...(root.matches(selector) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(selector),
  ];

  for (const element of scope("input, textarea, select")) {
    // Radix and friends mirror their buttons into hidden native inputs for
    // form submission: the button is the real control
    if (element.getAttribute("aria-hidden") === "true") continue;
    const control = element as HTMLInputElement;
    if (control.disabled || control.readOnly) continue;
    if (element instanceof HTMLInputElement) {
      const type = element.type;
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
        continue;
      }
      if (isSensitive(element)) {
        sensitive++;
        continue;
      }
      if (!isShown(element)) continue;

      if (type === "radio") {
        const name = element.name;
        if (name && seenRadioNames.has(name)) continue;
        if (name) seenRadioNames.add(name);
        const group = name
          ? [
              ...(element.form ?? root).querySelectorAll<HTMLInputElement>(
                `input[type=radio][name="${CSS.escape(name)}"]`,
              ),
            ].filter((radio) => !radio.disabled)
          : [element];
        const options = group.map((radio, index) =>
          withElement(
            {
              value:
                radio.value && radio.value !== "on" ? radio.value : `${index}`,
            },
            radio as HTMLElement,
          ),
        );
        const fieldLabel =
          textOf(element.closest("fieldset")?.querySelector("legend")) ||
          precedingText(element.closest("label") ?? element) ||
          name;
        found.push({
          at: element,
          handle: { kind: "radio", options },
          field: {
            kind: "radio",
            label: fieldLabel,
            required: group.some((radio) => radio.required),
            filled: group.some((radio) => radio.checked),
            options: options.map((option) => ({
              value: option.value,
              label: choiceLabel(option.element),
            })),
          },
        });
        continue;
      }

      if (type === "checkbox") {
        // Grouped with the ARIA ones below, by question
        checkboxes.push(element);
        continue;
      }

      const kind = textKinds[type];
      if (!kind) {
        unsupported++; // color, range, time, month…
        continue;
      }
      const text = labelOf(element);
      found.push({
        at: element,
        handle: withElement({ kind: "text" as const }, element),
        field: {
          kind,
          label: text,
          description: descriptionOf(element, text),
          required: isRequired(element),
          filled: element.value.trim() !== "",
          ...(element.minLength > 0 && { min_length: element.minLength }),
          ...(element.maxLength > 0 &&
            element.maxLength < 1_000_000 && { max_length: element.maxLength }),
          ...(element.min && { min: element.min }),
          ...(element.max && { max: element.max }),
          ...(element.pattern && { pattern: element.pattern }),
        },
      });
      continue;
    }

    if (!isShown(element)) continue;
    if (element instanceof HTMLTextAreaElement) {
      const text = labelOf(element);
      found.push({
        at: element,
        handle: withElement({ kind: "text" as const }, element),
        field: {
          kind: "textarea",
          label: text,
          description: descriptionOf(element, text),
          required: isRequired(element),
          filled: element.value.trim() !== "",
          ...(element.minLength > 0 && { min_length: element.minLength }),
          ...(element.maxLength > 0 &&
            element.maxLength < 1_000_000 && { max_length: element.maxLength }),
        },
      });
      continue;
    }
    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        unsupported++;
        continue;
      }
      const options = [...element.options].filter(
        (option) => !option.disabled && option.value !== "",
      );
      const placeholder = element.options[element.selectedIndex];
      found.push({
        at: element,
        handle: withElement({ kind: "select" as const }, element),
        field: {
          kind: "select",
          label: labelOf(element),
          required: element.required,
          filled: Boolean(placeholder && placeholder.value !== ""),
          options: options.map((option) => ({
            value: option.value,
            label: option.label.trim() || option.text.trim(),
          })),
        },
      });
    }
  }

  // ARIA radios: Radix/shadcn render buttons with role=radio in a radiogroup
  for (const group of scope("[role=radiogroup]")) {
    if (!group.checkVisibility({ checkVisibilityCSS: true })) continue;
    const radios = [...group.querySelectorAll<HTMLElement>("[role=radio]")]
      .filter((radio) => !(radio instanceof HTMLInputElement))
      .filter((radio) => radio.getAttribute("aria-disabled") !== "true");
    if (radios.length === 0) continue;
    const options = radios.map((radio, index) =>
      withElement(
        {
          value:
            radio.getAttribute("value") || radio.dataset.value || `${index}`,
        },
        radio,
      ),
    );
    found.push({
      at: group,
      handle: { kind: "radio", options },
      field: {
        kind: "radio",
        label: groupLabel(group),
        description: descriptionOf(group, groupLabel(group)),
        required: isRequired(group),
        filled: radios.some(isChecked),
        options: options.map((option) => ({
          value: option.value,
          label: choiceLabel(option.element),
        })),
      },
    });
  }

  // ARIA checkboxes and switches (Radix/shadcn: buttons with a role)
  for (const box of scope("[role=checkbox],[role=switch]")) {
    if (box instanceof HTMLInputElement) continue;
    if (box.getAttribute("aria-disabled") === "true") continue;
    if (!box.checkVisibility({ checkVisibilityCSS: true })) continue;
    checkboxes.push(box);
  }
  for (const group of groupCheckboxes(checkboxes)) found.push(group);

  unsupported += scope(
    "[role=combobox]:not(input):not(select),[contenteditable=''],[contenteditable=true]",
  ).filter((element) => element.checkVisibility()).length;

  // Page order, whatever pass found them
  found.sort((a, b) =>
    a.at.compareDocumentPosition(b.at) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1,
  );

  // Many forms say it only in words: "Name *", "(obrigatória)", "required"
  for (const { field } of found) {
    if (/\*\s*$|\bobrigat[óo]ri[oa]s?\b|\brequired\b/i.test(field.label)) {
      field.required = true;
    }
  }

  const kept = found.slice(0, maxFields);
  fields = new Map();
  undo = [];
  const described = kept.map(({ field, handle }, index) => {
    const id = `f${index + 1}`;
    fields.set(id, handle);
    return {
      ...field,
      id,
      label: cut(field.label),
      ...(field.description
        ? { description: cut(field.description) }
        : { description: undefined }),
      ...(field.options && {
        options: field.options.slice(0, maxOptions).map((option) => ({
          value: cut(option.value, 200),
          label: cut(option.label, 200),
        })),
      }),
    } satisfies FormField;
  });

  return {
    title: document.title,
    url: location.href,
    label,
    fields: described,
    sensitive,
    unsupported,
    truncated: found.length > maxFields,
  };
}

/** What a person answers: a native control, or an ARIA one */
const controls =
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),textarea,select,[role=radiogroup],[role=checkbox],[role=switch]";

/**
 * Questions inside `element`: a radio group or a question's checkboxes count
 * once, not once per option
 */
function questionsIn(element: Element) {
  const seen = new Set<Element>();
  for (const control of element.querySelectorAll(controls)) {
    seen.add(
      control.closest("fieldset,[role=radiogroup],[role=group]") ?? control,
    );
  }
  return seen.size;
}

/**
 * What hovering points at while picking a form: the form around the mouse,
 * not the label, text or button under it. The closest <form>; without one,
 * from the first container with a question, up to where the questions stop
 * growing (two or more, through any wrappers), so a survey is one pick
 */
export function formRegion(element: HTMLElement): HTMLElement {
  const form = element.closest("form");
  if (form && questionsIn(form) > 0) return form;

  let region: HTMLElement | null = element;
  while (region && questionsIn(region) === 0) region = region.parentElement;
  if (!region || region === document.body) return element;

  let count = questionsIn(region);
  for (
    let parent = region.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    const above = questionsIn(parent);
    // One question so far: take the group it belongs to. Two or more: only
    // wrappers that add nothing (the next level up is another form)
    if (count < 2 ? above > count : above === count) {
      region = parent;
      count = above;
    } else {
      break;
    }
  }
  return region;
}

/** "Use the whole page": every field in the document */
export function scanPage() {
  return scanForm(document.body, "");
}

export function scanPick(element: HTMLElement) {
  return scanForm(element, describe(element));
}

// --- Writing -----------------------------------------------------------------

/**
 * Sets a value the way typing does, so React, Vue and plain listeners all
 * notice. Running in the isolated world helps: React's own value tracker lives
 * in the page's world, so it sees the old value and reports the change
 */
function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  element.focus({ preventScroll: true });
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.blur();
}

/**
 * A click, as a person would (radios and checkboxes, native or ARIA), then a
 * wait until the page shows it: a controlled list (`setSelected([...selected,
 * x])`) only sees the previous click once it has re-rendered
 */
async function toggle(target: { readonly element: HTMLElement }) {
  const before = isChecked(target.element);
  target.element.click();
  const started = performance.now();
  // The live node each time: the click may have made the page replace it.
  // Some pages only show the change after saving it (a request per click)
  while (
    isChecked(target.element) === before &&
    performance.now() - started < 1000
  ) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

function flash(element: Element) {
  element.animate(
    [
      { outline: `2px solid ${highlight}`, outlineOffset: "2px" },
      { outline: "2px solid transparent", outlineOffset: "2px" },
    ],
    { duration: durations.flash, easing: "ease-out" },
  );
}

function remember(handle: Handle) {
  if (handle.kind === "text" || handle.kind === "select") {
    const source: {
      readonly element:
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement;
    } = handle;
    undo.push(
      linkedTo({ kind: "value" as const, value: handle.element.value }, source),
    );
  } else if (handle.kind === "checkbox") {
    undo.push(
      linkedTo(
        { kind: "checked" as const, checked: isChecked(handle.element) },
        handle,
      ),
    );
  } else {
    for (const option of handle.options) {
      undo.push(
        linkedTo(
          { kind: "checked" as const, checked: isChecked(option.element) },
          option,
        ),
      );
    }
  }
}

/**
 * What applying an answer did. A change is checked later (`done`), not right
 * after the click: React (Radix, shadcn…) re-renders on its own schedule, so
 * aria-checked and controlled values only show the new state a moment later
 */
type Applied =
  | { outcome: Exclude<FillOutcome, "filled"> }
  | { outcome: "filled"; done: () => boolean };

async function apply(handle: Handle, answer: FormAnswer): Promise<Applied> {
  // The API may send the unused keys as null
  const value = answer.value ?? undefined;
  const values = answer.values ?? undefined;
  const checked = answer.checked ?? undefined;
  switch (handle.kind) {
    case "text": {
      if (value === undefined) return { outcome: "skipped" };
      if (handle.element.value === value) return { outcome: "unchanged" };
      setValue(handle.element, value);
      return { outcome: "filled", done: () => handle.element.value === value };
    }
    case "select": {
      if (value === undefined) return { outcome: "skipped" };
      if (
        ![...handle.element.options].some((option) => option.value === value)
      ) {
        return { outcome: "failed" };
      }
      if (handle.element.value === value) return { outcome: "unchanged" };
      setValue(handle.element, value);
      return { outcome: "filled", done: () => handle.element.value === value };
    }
    case "radio": {
      const option = handle.options.find((choice) => choice.value === value);
      if (!option)
        return { outcome: value === undefined ? "skipped" : "failed" };
      if (isChecked(option.element)) return { outcome: "unchanged" };
      await toggle(option);
      return { outcome: "filled", done: () => isChecked(option.element) };
    }
    case "checkbox":
      if (checked === undefined) return { outcome: "skipped" };
      if (isChecked(handle.element) === checked)
        return { outcome: "unchanged" };
      await toggle(handle);
      return {
        outcome: "filled",
        done: () => isChecked(handle.element) === checked,
      };
    case "checkbox_group": {
      if (!values) return { outcome: "skipped" };
      const toggled = handle.options.filter(
        (option) => isChecked(option.element) !== values.includes(option.value),
      );
      if (toggled.length === 0) return { outcome: "unchanged" };
      // Out first, then in, one at a time: a page that caps the picks
      // ("up to 3") never sees one too many on the way
      const wanted = (option: Choice) => values.includes(option.value);
      const wrong = () =>
        handle.options.filter(
          (option) => isChecked(option.element) !== wanted(option),
        );
      // A page that saves each click may answer the next one from a state
      // that didn't have the last one yet, and undo it: after a pause, what
      // didn't stick gets clicked again (twice at most)
      for (let pass = 0; pass < 3; pass++) {
        const pending = wrong();
        if (pending.length === 0) break;
        if (pass > 0) await new Promise((resolve) => setTimeout(resolve, 500));
        const again = wrong();
        const out = again.filter((option) => isChecked(option.element));
        const into = again.filter((option) => !isChecked(option.element));
        for (const option of [...out, ...into]) await toggle(option);
      }
      return {
        outcome: "filled",
        done: () =>
          handle.options.every(
            (option) =>
              isChecked(option.element) === values.includes(option.value),
          ),
      };
    }
  }
}

function elementOf(handle: Handle) {
  return "element" in handle ? handle.element : handle.options[0]?.element;
}

/** Long enough for a framework to re-render after the clicks and inputs */
function settle() {
  return new Promise<void>((resolve) => setTimeout(resolve, 150));
}

// --- A fill, step by step (the stream's events, in order) --------------------

type Live = {
  /** Typed into by deltas, answer not in yet */
  typing?: { original: string; text: string; outline: string };
  /** Answered: how it went, and the final check once the page has caught up */
  outcome?: FillOutcome;
  done?: () => boolean;
  shown?: Element;
};

let live = new Map<string, Live>();
let touched = new Set<string>();

function touch(id: string, handle: Handle) {
  if (touched.has(id)) return;
  touched.add(id);
  remember(handle);
}

function shownOf(handle: Handle, target: Element) {
  return handle.kind === "radio" || handle.kind === "checkbox_group"
    ? (target.closest("[role=radiogroup],fieldset") ?? target)
    : target;
}

/** Writes without focus/blur on every piece: only an input event */
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function stopTyping(id: string, handle: Handle) {
  const state = live.get(id);
  if (!state?.typing || handle.kind !== "text") return state;
  handle.element.style.outline = state.typing.outline;
  return state;
}

/** A new fill: nothing to undo yet, nothing typed */
export function beginFill() {
  undo = [];
  touched = new Set();
  live = new Map();
}

/**
 * The next piece of a text answer, typed into the field. The first piece
 * keeps the original value (for Undo, or a skip) and starts from empty
 */
export function applyDelta(id: string, text: string) {
  const handle = fields.get(id);
  if (handle?.kind !== "text" || !handle.element.isConnected) return;
  touch(id, handle);
  const state = live.get(id) ?? {};
  if (!state.typing) {
    state.typing = {
      original: handle.element.value,
      text: "",
      outline: handle.element.style.outline,
    };
    // While the AI types: a soft outline, and the caret where it writes
    handle.element.style.outline = `2px solid ${highlightTyping}`;
    handle.element.focus({ preventScroll: true });
  }
  state.typing.text += text;
  live.set(id, state);
  type(handle.element, state.typing.text);
}

/**
 * A field's final answer (it replaces what deltas typed). A skip puts the
 * original value back. Clicks go one at a time, waiting for the page
 */
export async function applyAnswer(answer: FormAnswer): Promise<FillOutcome> {
  const handle = fields.get(answer.id);
  if (!handle) return record(answer.id, { outcome: "failed" });
  const target = elementOf(handle);
  if (!target?.isConnected) return record(answer.id, { outcome: "failed" });
  const state = stopTyping(answer.id, handle);

  if (answer.skipped != null) {
    if (state?.typing && handle.kind === "text") {
      setValue(handle.element, state.typing.original);
    }
    return record(answer.id, { outcome: "skipped" });
  }

  touch(answer.id, handle);
  let applied: Applied;
  try {
    if (state?.typing && handle.kind === "text" && answer.value != null) {
      // Typed already: the final text (trimmed, cut to max_length) wins
      const value = answer.value;
      setValue(handle.element, value);
      applied = {
        outcome: "filled",
        done: () => handle.element.value === value,
      };
    } else {
      applied = await apply(handle, answer);
    }
  } catch {
    applied = { outcome: "failed" };
  }
  if (applied.outcome === "filled") flash(shownOf(handle, target));
  return record(answer.id, {
    outcome: applied.outcome,
    done: applied.outcome === "filled" ? applied.done : undefined,
    shown: shownOf(handle, target),
  });
}

function record(id: string, change: Live): FillOutcome {
  const state = { ...live.get(id), ...change, typing: undefined };
  live.set(id, state);
  return change.outcome ?? "failed";
}

/**
 * The stream's `done`: answers that never came as an `answer` event are
 * applied now (usually skips), then every field is checked once the page has
 * caught up. The report is final
 */
export async function finishFill(answers: FormAnswer[]): Promise<FillReport> {
  for (const answer of answers) {
    if (live.get(answer.id)?.outcome === undefined) await applyAnswer(answer);
  }
  if ([...live.values()].some((state) => state.done)) await settle();
  return answers.map(({ id }) => {
    const state = live.get(id);
    if (!state?.outcome) return { id, outcome: "failed" };
    if (!state.done) return { id, outcome: state.outcome };
    return { id, outcome: state.done() ? "filled" : "failed" };
  });
}

/**
 * The fill stopped (an error, a cancel, the panel closed): what was answered
 * stays (and Undo covers it); a field caught mid-typing goes back as it was
 */
export function abortFill() {
  for (const [id, state] of live) {
    const handle = fields.get(id);
    if (!state.typing || handle?.kind !== "text") continue;
    handle.element.style.outline = state.typing.outline;
    if (handle.element.isConnected) {
      setValue(handle.element, state.typing.original);
    }
    live.set(id, { ...state, typing: undefined });
  }
}

/**
 * Puts back what the last fill changed. A radio can't be unchecked by a click
 * once picked (that's how radios work), so a group that had nothing picked
 * keeps the answer; the panel says so
 */
export async function undoFill() {
  let restored = 0;
  let kept = 0;
  const toggles: { readonly element: HTMLElement }[] = [];
  for (const snapshot of undo) {
    if (!snapshot.element.isConnected) continue;
    if (snapshot.kind === "value") {
      if (snapshot.element.value !== snapshot.value) {
        setValue(snapshot.element, snapshot.value);
        restored++;
      }
      continue;
    }
    if (isChecked(snapshot.element) === snapshot.checked) continue;
    const role = snapshot.element.getAttribute("role");
    const radio =
      role === "radio" ||
      (snapshot.element instanceof HTMLInputElement &&
        snapshot.element.type === "radio");
    // Restored by checking the one that was picked before, if any
    if (radio && !snapshot.checked) continue;
    toggles.push(snapshot);
  }
  // One at a time, the ones to uncheck first (a capped group stays in range)
  const ordered = [
    ...toggles.filter((target) => isChecked(target.element)),
    ...toggles.filter((target) => !isChecked(target.element)),
  ];
  for (const element of ordered) {
    await toggle(element);
    restored++;
  }
  // Radio groups that had nothing picked before can't go back to empty
  for (const handle of fields.values()) {
    if (handle.kind !== "radio") continue;
    const before = undo.filter(
      (snapshot) =>
        snapshot.kind === "checked" &&
        handle.options.some((option) => option.element === snapshot.element),
    );
    if (
      before.length > 0 &&
      before.every(
        (snapshot) => snapshot.kind === "checked" && !snapshot.checked,
      ) &&
      handle.options.some((option) => isChecked(option.element))
    ) {
      kept++;
    }
  }
  undo = [];
  return { restored, kept };
}
