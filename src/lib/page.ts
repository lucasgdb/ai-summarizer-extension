import { browser } from "#imports";
import { maxChars, normalize } from "./bridge/extract";
import {
  type BridgeRequest,
  type BridgeResponse,
  type PickedContent,
  type PickerCommand,
  type PickerPanelMessage,
  type PickerPortMessage,
  type ProbeResponse,
  pickerPortName,
  type ReadPdfResponse,
} from "./messages";
import {
  extractPdf,
  type PdfDocument,
  PdfError,
  type PdfErrorReason,
} from "./pdf";

const allSites = { origins: ["<all_urls>"] };

export type PageErrorReason =
  | "no-access"
  | "restricted"
  | "empty"
  | "file-access" // a local file, with "Allow access to file URLs" off
  | "pdf-too-large"
  | "pdf-unreadable" // the PDF couldn't be downloaded
  | PdfErrorReason;

export class PageError extends Error {
  constructor(readonly reason: PageErrorReason) {
    super(reason);
  }
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    throw new PageError("restricted");
  }
  // url is only there with activeTab or host access; fine without it
  return { id: tab.id, url: tab.url };
}

async function activeTabId() {
  return (await activeTab()).id;
}

async function injectBridge(tabId: number, url?: string) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["/page-bridge.js"],
    });
  } catch {
    // Local files need a separate switch on the extension's details page
    if (
      url?.startsWith("file:") &&
      !(await browser.extension.isAllowedFileSchemeAccess())
    ) {
      throw new PageError("file-access");
    }
    // With host access granted a failure means a page no extension may touch
    // (chrome://, the Web Store...)
    const granted = await browser.permissions.contains(allSites);
    throw new PageError(granted ? "restricted" : "no-access");
  }
}

function isPdfUrl(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

export type PageInfo = ProbeResponse;

/**
 * What the active tab is, for the start screen: title, description, size, and
 * whether it's a PDF (by the URL, or the page itself for one served without
 * ".pdf"). Quiet: null without access to the tab.
 */
export async function inspectPage(): Promise<PageInfo | null> {
  let url: string | undefined;
  try {
    const tab = await activeTab();
    url = tab.url;
    await injectBridge(tab.id, tab.url);
    const info: ProbeResponse = await browser.tabs.sendMessage(tab.id, {
      type: "probe",
    } satisfies BridgeRequest);
    return { ...info, pdf: info.pdf || isPdfUrl(info.url) };
  } catch {
    // No access to the page, but the URL alone can still say "PDF"
    if (url && isPdfUrl(url)) {
      return {
        pdf: true,
        url,
        title: "",
        description: "",
        language: "",
        words: 0,
        hasIcon: false,
      };
    }
    return null;
  }
}

export async function detectPdf() {
  return (await inspectPage())?.pdf ?? false;
}

async function pdfBytes(tabId: number, url: string | undefined) {
  const response: ReadPdfResponse = await browser.tabs.sendMessage(tabId, {
    type: "read-pdf",
  } satisfies BridgeRequest);
  if (response.ok) {
    return (await fetch(response.dataUrl)).arrayBuffer();
  }
  if (response.reason === "too-large") throw new PageError("pdf-too-large");
  // A page can't fetch file:// URLs, but the extension can (with file access)
  if (url?.startsWith("file:")) {
    try {
      return await (await fetch(url)).arrayBuffer();
    } catch {}
  }
  throw new PageError("pdf-unreadable");
}

/** Downloads the tab's PDF and extracts the text of every page */
export async function readPdf(
  onProgress: (page: number, total: number) => void,
  signal: AbortSignal,
): Promise<PdfDocument> {
  const tab = await activeTab();
  await injectBridge(tab.id, tab.url);
  const probe: ProbeResponse = await browser.tabs.sendMessage(tab.id, {
    type: "probe",
  } satisfies BridgeRequest);
  const data = await pdfBytes(tab.id, tab.url ?? probe.url);
  try {
    return await extractPdf(data, probe.url, onProgress, signal);
  } catch (error) {
    if (error instanceof PdfError) throw new PageError(error.reason);
    throw error;
  }
}

/** All pages, or page N (1-based) */
export type PdfPages = "all" | number;

/** The part of the PDF to summarize, as picked content */
export function pdfContent(pdf: PdfDocument, pages: PdfPages): PickedContent {
  const raw =
    pages === "all" ? pdf.pages.join("\n\n") : (pdf.pages[pages - 1] ?? "");
  const text = normalize(raw);
  return {
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    source: "pdf",
    // Shown by the Selection from the page choice, in the UI language
    label: "",
    title: pdf.title,
    url: pdf.url,
  };
}

function assertReadable(content: PickedContent) {
  if (!content.text) {
    throw new PageError("empty");
  }
  return content;
}

/** Must run straight from a click: permission prompts need a user gesture. */
export function requestAccess() {
  return browser.permissions.request(allSites);
}

export async function readPage() {
  const tabId = await activeTabId();
  await injectBridge(tabId);
  const content: BridgeResponse = await browser.tabs.sendMessage(tabId, {
    type: "read-page",
  } satisfies BridgeRequest);
  return assertReadable(content);
}

/**
 * Lets the user click an element on the page. Resolves with its content, or
 * null if they cancel. Aborting the signal removes the picker. `onReady` hands
 * over a function that drives the picker from the panel.
 */
export async function pickElement(
  signal: AbortSignal,
  onReady: (send: (command: PickerCommand) => void) => void,
) {
  const tabId = await activeTabId();
  await injectBridge(tabId);

  return new Promise<PickedContent | null>((resolve, reject) => {
    const port = browser.tabs.connect(tabId, { name: pickerPortName });
    let settled = false;
    onReady((command) => {
      if (!settled) {
        port.postMessage({
          type: "command",
          command,
        } satisfies PickerPanelMessage);
      }
    });

    port.onMessage.addListener((message: PickerPortMessage) => {
      settled = true;
      if (message.type === "cancelled") {
        resolve(null);
        return;
      }
      try {
        resolve(assertReadable(message.content));
      } catch (error) {
        reject(error);
      }
    });
    // The page navigated away or the tab closed mid-pick
    port.onDisconnect.addListener(() => {
      if (!settled) resolve(null);
    });
    signal.addEventListener("abort", () => {
      settled = true;
      port.disconnect();
      resolve(null);
    });
  });
}
