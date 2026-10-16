import type { UrlTransform } from "@tanstack/markdown";
import { streamingMarkdownExtension } from "@tanstack/markdown/extensions/streaming";
import {
  type MarkdownComponents,
  Markdown as TanStackMarkdown,
} from "@tanstack/markdown/react";

// Links open outside the panel
const components = {
  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
} satisfies MarkdownComponents;

// Images keep only their alt text: a summary has no business loading trackers.
// Links keep the built-in policy, which strips executable protocols.
const urlTransform: UrlTransform = (_url, kind, defaultUrl) =>
  kind === "image" ? null : defaultUrl;

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
