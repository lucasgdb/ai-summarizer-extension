/** A PDF read into memory, page by page */
export type PdfDocument = {
  /** Text of each page, in order (index 0 = page 1) */
  pages: string[];
  /** The document's own title (metadata), else the file name */
  title: string;
  url: string;
};

export type PdfErrorReason =
  | "pdf-protected" // password
  | "pdf-invalid" // not a PDF, or corrupt
  | "pdf-no-text"; // scanned: images only

export class PdfError extends Error {
  constructor(readonly reason: PdfErrorReason) {
    super(reason);
  }
}

/** "relatorio-2026.pdf" from ".../relatorio-2026.pdf?download=1" */
export function pdfFileName(url: string) {
  try {
    const name = decodeURIComponent(
      new URL(url).pathname.split("/").pop() ?? "",
    );
    return name || "document.pdf";
  } catch {
    return "document.pdf";
  }
}

/**
 * Extracts the text of every page with pdf.js (Mozilla's, the engine of
 * Firefox's viewer). Loaded on demand: it's large and only PDFs need it.
 */
export async function extractPdf(
  data: ArrayBuffer,
  url: string,
  onProgress: (page: number, total: number) => void,
  signal: AbortSignal,
): Promise<PdfDocument> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  // Bundled with the extension: MV3 can't load code from elsewhere
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({
    data,
    // Copied by the build hook in wxt.config.ts (not in public/, so not in
    // WXT's typed paths): resolved against the extension's own origin
    cMapUrl: new URL("/pdfjs/cmaps/", location.origin).href,
    cMapPacked: true,
    // Text only: no font rendering, no WebAssembly image decoders, no XFA
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    enableXfa: false,
  });
  signal.addEventListener("abort", () => task.destroy());

  let document: Awaited<typeof task.promise>;
  try {
    document = await task.promise;
  } catch (error) {
    if (error instanceof pdfjs.PasswordException) {
      throw new PdfError("pdf-protected");
    }
    if (signal.aborted) throw error;
    throw new PdfError("pdf-invalid");
  }

  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      signal.throwIfAborted();
      onProgress(number, document.numPages);
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
      }
      pages.push(text);
      page.cleanup();
    }

    if (pages.every((page) => page.trim() === "")) {
      throw new PdfError("pdf-no-text");
    }

    const metadata = await document.getMetadata().catch(() => undefined);
    const info = metadata?.info as { Title?: unknown } | undefined;
    const title =
      typeof info?.Title === "string" && info.Title.trim()
        ? info.Title.trim()
        : pdfFileName(url);
    return { pages, title, url };
  } finally {
    // Frees the document and its worker
    await task.destroy();
  }
}
