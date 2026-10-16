export type ServerSentEvent = { event: string; data: string };

/**
 * Splits a `text/event-stream` body into events. EventSource only does GET,
 * so POST streams are read by hand. Comment lines (": ping") are skipped, and
 * `onChunk` fires on every read, keep-alives included.
 */
export async function* readEvents(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  onChunk: () => void,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      onChunk();
      // A "\r" at the end may be half of a "\r\n" split across reads: keep it
      // for the next one instead of turning it into a line break now
      buffer += value;
      const held = buffer.endsWith("\r") ? "\r" : "";
      buffer =
        buffer.slice(0, buffer.length - held.length).replace(/\r\n?/g, "\n") +
        held;

      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");

        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value =
            colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
        if (data.length > 0) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
