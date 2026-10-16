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
  | { type: "cancelled" };

export type BridgeRequest =
  | { type: "read-page" }
  /** Is the tab showing a PDF? (Chrome's viewer: contentType application/pdf) */
  | { type: "probe" }
  /** The PDF's bytes, fetched from inside the tab (same origin, its cookies) */
  | { type: "read-pdf" };

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
