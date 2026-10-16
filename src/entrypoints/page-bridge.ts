import { browser, defineUnlistedScript } from "#imports";
import { extract, mainContent } from "@/lib/bridge/extract";
import { startPicker } from "@/lib/bridge/picker";
import {
  type BridgeRequest,
  type BridgeResponse,
  maxPdfBytes,
  type PickerPanelMessage,
  type PickerPortMessage,
  type ProbeResponse,
  pickerPortName,
  type ReadPdfResponse,
} from "@/lib/messages";

declare global {
  interface Window {
    __aiSummarizerBridge?: true;
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
  // Chrome's PDF viewer has no text in the DOM: the count comes after reading
  const text = pdf ? "" : (mainContent().innerText ?? "");
  return {
    pdf,
    url: location.href,
    title: document.title.trim(),
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]'),
    language: document.documentElement.lang,
    words: text.split(/\s+/).filter(Boolean).length,
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
  if (window.__aiSummarizerBridge) return;
  window.__aiSummarizerBridge = true;

  browser.runtime.onMessage.addListener(
    (message: BridgeRequest, _sender, sendResponse) => {
      switch (message.type) {
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
      }
    },
  );

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== pickerPortName) return;

    const post = (message: PickerPortMessage) => port.postMessage(message);
    const picker = startPicker({
      onPick: (element) => {
        post({ type: "selected", content: extract(element, "element") });
        port.disconnect();
      },
      onCancel: () => {
        post({ type: "cancelled" });
        port.disconnect();
      },
    });
    port.onMessage.addListener((message: PickerPanelMessage) => {
      if (message.type === "command") picker.run(message.command);
    });
    // Panel closed, tab switched or picking cancelled from the panel
    port.onDisconnect.addListener(picker.stop);
  });
});
