import { browser, defineUnlistedScript } from "#imports";
import { extract, mainContent } from "@/lib/bridge/extract";
import {
  abortFill,
  applyAnswer,
  applyDelta,
  beginFill,
  finishFill,
  formRegion,
  scanPage,
  scanPick,
  undoFill,
} from "@/lib/bridge/forms";
import { startPicker } from "@/lib/bridge/picker";
import { countWords, toMarkdown } from "@/lib/bridge/to-markdown";
import {
  type BridgeRequest,
  type BridgeResponse,
  formFillPortName,
  formPickerPortName,
  maxPdfBytes,
  type PickerPanelMessage,
  type PickerPortMessage,
  type ProbeResponse,
  pickerPortName,
  type ReadPdfResponse,
} from "@/lib/messages";

declare global {
  interface Window {
    /** The build that installed the listeners in this tab */
    __aiSummarizerBridge?: string;
  }
}

/** A declared <link rel="icon">, or the classic /favicon.ico of a website */
async function hasIcon() {
  if (document.querySelector('link[rel~="icon"]')) return true;
  if (!location.protocol.startsWith("http")) return false;
  try {
    const response = await fetch("/favicon.ico", {
      method: "HEAD",
      signal: AbortSignal.timeout(1500),
    });
    return (
      response.ok &&
      (response.headers.get("content-type") ?? "").startsWith("image/")
    );
  } catch {
    return false;
  }
}

async function probe(): Promise<ProbeResponse> {
  const pdf = document.contentType === "application/pdf";
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
  // Chrome's PDF viewer has no text in the DOM: the count comes after reading.
  // The same text "Use the whole page" sends, so the count matches the price
  const text = pdf ? "" : toMarkdown(mainContent());
  return {
    pdf,
    url: location.href,
    title: document.title.trim(),
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]'),
    language: document.documentElement.lang,
    words: countWords(text),
    hasIcon: !pdf && (await hasIcon()),
  };
}

async function readPdf(): Promise<ReadPdfResponse> {
  try {
    const response = await fetch(location.href, { credentials: "include" });
    if (!response.ok) return { ok: false, reason: "fetch-failed" };
    const blob = await response.blob();
    if (blob.size > maxPdfBytes) return { ok: false, reason: "too-large" };
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, reason: "fetch-failed" };
  }
}

// Injected on demand by the side panel (scripting.executeScript), never through
// the manifest, so the extension only touches pages the user points it at.
export default defineUnlistedScript(() => {
  // Each injection re-runs this file in the same isolated world
  // Once per build: re-running this build is a no-op, but a tab still holding
  // an older build's script (from before the extension updated) gets this one.
  // The old listeners died with the old extension context
  if (window.__aiSummarizerBridge === __BRIDGE_BUILD__) return;
  window.__aiSummarizerBridge = __BRIDGE_BUILD__;

  // Fill steps run one at a time, in arrival order: an answer's clicks (and
  // their waits) finish before the next delta is typed
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(step: () => T | Promise<T>) => {
    const run = queue.then(step);
    queue = run.catch(() => {});
    return run;
  };
  // A streamed fill in progress, until its finish or abort
  let filling = false;

  browser.runtime.onMessage.addListener(
    (message: BridgeRequest, _sender, sendResponse) => {
      switch (message.type) {
        case "fill-begin":
          enqueue(() => {
            filling = true;
            beginFill();
          }).then(() => sendResponse(true));
          return true;
        case "fill-delta":
          enqueue(() => {
            if (filling) applyDelta(message.id, message.text);
          }).then(() => sendResponse(true));
          return true;
        case "fill-answer":
          enqueue(() =>
            filling ? applyAnswer(message.answer) : ("failed" as const),
          ).then(sendResponse, (error) => {
            // Always an answer: silence would read as "the page went away"
            console.error("[ai-summarizer] fill answer", error);
            sendResponse("failed");
          });
          return true;
        case "fill-finish":
          enqueue(async () => {
            const report = await finishFill(message.answers);
            filling = false;
            return report;
          }).then(sendResponse, (error) => {
            console.error("[ai-summarizer] fill finish", error);
            filling = false;
            sendResponse(null);
          });
          return true;
        case "fill-abort":
          enqueue(() => {
            if (filling) abortFill();
            filling = false;
          }).then(() => sendResponse(true));
          return true;
        case "read-page":
          sendResponse(extract(mainContent(), "page") satisfies BridgeResponse);
          return;
        case "probe":
          probe().then(sendResponse);
          // Keeps the channel open for the async answer
          return true;
        case "read-pdf":
          readPdf().then(sendResponse);
          // Keeps the channel open for the async answer
          return true;
        case "scan-form":
          sendResponse(scanPage());
          return;
        case "undo-fill":
          undoFill().then(sendResponse);
          // Keeps the channel open: the clicks go one at a time
          return true;
      }
    },
  );

  /** The picker on the page, if any: stops it and tells its panel */
  let cancelActivePicker: (() => void) | undefined;

  browser.runtime.onConnect.addListener((port) => {
    // The panel closed mid-fill: nothing more is applied, and a field caught
    // mid-typing goes back as it was
    if (port.name === formFillPortName) {
      port.onDisconnect.addListener(() => {
        enqueue(() => {
          if (filling) abortFill();
          filling = false;
        });
      });
      return;
    }
    if (port.name !== pickerPortName && port.name !== formPickerPortName) {
      return;
    }
    const forForm = port.name === formPickerPortName;

    // One picker at a time: a new one (another section of the panel, another
    // panel) cancels the one already on the page
    cancelActivePicker?.();

    const post = (message: PickerPortMessage) => port.postMessage(message);
    const picker = startPicker({
      onPick: (element) => {
        post(
          forForm
            ? { type: "form", form: scanPick(element) }
            : { type: "selected", content: extract(element, "element") },
        );
        port.disconnect();
      },
      onCancel: () => {
        post({ type: "cancelled" });
        port.disconnect();
      },
      // Picking a form: the whole form lights up, wherever the mouse is in it
      snap: forForm ? formRegion : undefined,
    });
    port.onMessage.addListener((message: PickerPanelMessage) => {
      if (message.type === "command") picker.run(message.command);
    });
    const cancel = () => {
      picker.stop();
      try {
        post({ type: "cancelled" });
        port.disconnect();
      } catch {
        // Already gone
      }
    };
    cancelActivePicker = cancel;
    // Panel closed, tab switched or picking cancelled from the panel
    port.onDisconnect.addListener(() => {
      picker.stop();
      if (cancelActivePicker === cancel) cancelActivePicker = undefined;
    });
  });
});
