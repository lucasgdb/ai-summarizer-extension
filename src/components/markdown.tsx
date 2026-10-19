import type { UrlTransform } from "@tanstack/markdown";
import { streamingMarkdownExtension } from "@tanstack/markdown/extensions/streaming";
import {
  type MarkdownComponents,
  Markdown as TanStackMarkdown,
} from "@tanstack/markdown/react";

// A second barrier (the API already strips them): the summary comes from a
// model that read an untrusted page, so a link is only its text, never
// something to click, and an image only its alt text, never loaded
const components = {
  a: ({ children }) => <span>{children}</span>,
} satisfies MarkdownComponents;

const urlTransform: UrlTransform = () => null;

// While text is still arriving, drop the empty heading or bullet a "## " or
// "- " has just started, instead of flashing it
const streamingExtensions = [streamingMarkdownExtension()];

/**
 * Raw HTML stays off (the default): the content comes from a model that read
 * an arbitrary web page. Heading ids are off too, since several summaries can
 * share a page and their ids would collide.
 */
export function Markdown({
  children,
  streaming = false,
}: {
  children: string;
  /** Partial Markdown: re-rendered as each piece arrives */
  streaming?: boolean;
}) {
  return (
    <div className="markdown" data-streaming={streaming || undefined}>
      <TanStackMarkdown
        components={components}
        urlTransform={urlTransform}
        headingIds={false}
        extensions={streaming ? streamingExtensions : undefined}
      >
        {children}
      </TanStackMarkdown>
    </div>
  );
}
