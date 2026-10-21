// Contract between the side panel and the script injected into the page

export type PickedContent = {
  text: string;
  truncated: boolean;
  source: "element" | "page" | "pdf";
  /** devtools-like selector of the picked element, e.g. `article.post` */
  label: string;
  title: string;
  url: string;
};

/** The panel opens a port per picking session; closing it cancels the picker. */
export const pickerPortName = "picker";

/**
 * Keyboard focus stays in the side panel while picking, so the panel forwards
 * the shortcuts (and clicks on its hints) to the page.
 */
export type PickerCommand = "parent" | "child" | "select" | "cancel";

export type PickerPanelMessage = { type: "command"; command: PickerCommand };

export type PickerPortMessage =
  | { type: "selected"; content: PickedContent }
  /** The form picker's answer: the fields of what was picked */
  | { type: "form"; form: ScannedForm }
  | { type: "cancelled" };

/**
 * Open while a streamed fill runs: if the panel closes (or the fill is
 * cancelled) without a finish, the page stops and tidies up
 */
export const formFillPortName = "form-fill";

/** Same picker, for "fill": the pick is scanned for fields instead of read */
export const formPickerPortName = "form-picker";

/**
 * A field as the API sees it (POST /forms/quote and /forms/fill). `id` is
 * ours: the page keeps which element it is, and the answers come back by it
 */
export type FormFieldKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "checkbox_group";

export type FormField = {
  id: string;
  kind: FormFieldKind;
  label: string;
  description?: string;
  required: boolean;
  /** Has an answer already (the answer itself is never sent) */
  filled: boolean;
  min_length?: number;
  max_length?: number;
  min?: string;
  max?: string;
  pattern?: string;
  /** select, radio, checkbox_group */
  options?: { value: string; label: string }[];
  /** checkbox_group, when the question says so ("Choose up to 3") */
  max_choices?: number;
  min_choices?: number;
};

export type ScannedForm = {
  title: string;
  url: string;
  /** devtools-like selector of the pick, or "" for the whole page */
  label: string;
  fields: FormField[];
  /** Left out on purpose: passwords, cards, files, captchas… */
  sensitive: number;
  /** Widgets we can't fill yet (custom comboboxes, rich editors) */
  unsupported: number;
  /** More fields than the API takes: only the first ones were kept */
  truncated: boolean;
};

/** One answer from POST /forms/fill */
export type FormAnswer = {
  id: string;
  // One of these is set; the API may send the others as null
  /** Text, number, ISO date, or the value of one of the options */
  value?: string | null;
  /** checkbox_group */
  values?: string[] | null;
  /** A single checkbox */
  checked?: boolean | null;
  /** Why it was left blank (nothing in the context to answer it with) */
  skipped?: string | null;
};

export type FillOutcome = "filled" | "skipped" | "unchanged" | "failed";

export type FillReport = { id: string; outcome: FillOutcome }[];

export type BridgeRequest =
  | { type: "read-page" }
  /** Is the tab showing a PDF? (Chrome's viewer: contentType application/pdf) */
  | { type: "probe" }
  /** The PDF's bytes, fetched from inside the tab (same origin, its cookies) */
  | { type: "read-pdf" }
  /** "Use the whole page" for fill: every field on it */
  | { type: "scan-form" }
  // A streamed fill, one event at a time (the page queues them in order)
  | { type: "fill-begin" }
  /** Types the next piece of a text answer */
  | { type: "fill-delta"; id: string; text: string }
  /** A field's final answer; answers with its FillOutcome */
  | { type: "fill-answer"; answer: FormAnswer }
  /** The stream's done: answers with the final FillReport */
  | { type: "fill-finish"; answers: FormAnswer[] }
  /** Stopped (error, cancel): a field caught mid-typing goes back */
  | { type: "fill-abort" }
  /** Puts back what the fields had before the last fill */
  | { type: "undo-fill" };

export type BridgeResponse = PickedContent;

/** What the start screen shows about the tab, before any action */
export type ProbeResponse = {
  pdf: boolean;
  url: string;
  title: string;
  /** <meta name="description"> or og:description */
  description: string;
  /** <html lang>, e.g. "pt-BR" */
  language: string;
  /** In the main content (article/main/body); 0 for a PDF (unknown until read) */
  words: number;
  /**
   * The site has an icon of its own. Without one, Chrome's favicon service
   * answers with its default page icon, drawn for Chrome's theme rather than
   * the panel's (white on a light panel)
   */
  hasIcon: boolean;
};

/** PDFs travel as a data: URL (extension messaging is JSON-only) */
export type ReadPdfResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: "too-large" | "fetch-failed" };

/** Over this, the base64 message gets slow and the text won't fit anyway */
export const maxPdfBytes = 30 * 1024 * 1024;

/** From the panel or the popup, to the background */
export type BackgroundRequest =
  /** Switching to the popup: opened once the side panel asking has closed */
  | { type: "open-popup"; windowId: number }
  /**
   * Google sign-in, run by the background: its window closes the toolbar
   * popup, and the flow must survive that (lib/auth.ts). `attempt` tells
   * this one's outcome apart from an older one still open
   */
  | { type: "sign-in"; attempt: string };
