import { FileTextIcon, GlobeIcon } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNumber,
  getDictionary,
  hostname,
  localeConfig,
} from "@/lib/i18n";
import type { PageInfo } from "@/lib/page";
import { pdfFileName } from "@/lib/pdf";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

// A typical adult reading speed, for "6 min read"
const wordsPerMinute = 220;

/** Chrome's cached favicon for a page (the "favicon" permission): no request to the site */
function faviconUrl(pageUrl: string) {
  return `${location.origin}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}

function languageName(tag: string, uiLocale: string) {
  try {
    const name = new Intl.DisplayNames([uiLocale], { type: "language" }).of(
      tag,
    );
    return name && name !== tag ? name : "";
  } catch {
    return "";
  }
}

/**
 * Lines up with the card: same padding and line heights, the icon, a title,
 * the site, three lines of description and the facts in their pieces
 * (words · reading time · language), with the separators that are always there
 */
function CardSkeleton() {
  return (
    <div className="rounded-lg border p-3.5" aria-hidden="true">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          <Skeleton className="size-4 rounded" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex h-[1.375rem] items-center">
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="mt-0.5 flex h-4 items-center">
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>
      <div className="mt-3">
        {["w-full", "w-11/12", "w-2/3"].map((width) => (
          <div key={width} className="flex h-5 items-center">
            <Skeleton className={`h-3.5 ${width}`} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
        <Skeleton className="h-3 w-16" />
        <span>·</span>
        <Skeleton className="h-3 w-20" />
        <span>·</span>
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

/**
 * The tab the user is about to summarize: title, site, description and size,
 * so they can tell it's the right page (and roughly how long) before acting.
 * undefined while it's being read; nothing without access to the tab.
 */
export function PageCard({ info }: { info: PageInfo | null | undefined }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const [iconFailed, setIconFailed] = useState(false);

  if (info === undefined) return <CardSkeleton />;
  if (info === null) return null;

  const host = hostname(info.url);
  const title =
    info.title || (info.pdf ? pdfFileName(info.url) : dict.pageInfo.untitled);
  const minutes = Math.max(1, Math.round(info.words / wordsPerMinute));
  const language = info.language
    ? languageName(info.language, localeConfig[locale].intl)
    : "";
  const facts = [
    info.pdf && dict.pdf.label,
    info.words > 0 &&
      dict.pageInfo.words(info.words, formatNumber(locale, info.words)),
    info.words > 0 && dict.pageInfo.readingTime(formatNumber(locale, minutes)),
    language,
  ].filter(Boolean);

  return (
    <section
      aria-label={dict.pageInfo.label}
      className="rounded-lg border p-3.5"
    >
      {/* With the site under it, the icon sits by the title's first line;
          a title alone is centered on the icon instead */}
      <div className={cn("flex gap-3", host ? "items-start" : "items-center")}>
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center",
            host && "mt-0.5",
          )}
        >
          {info.pdf ? (
            <FileTextIcon className="size-4 text-muted-foreground" />
          ) : iconFailed || !info.hasIcon ? (
            // Ours, in the panel's colors: Chrome's stand-in follows its own theme
            <GlobeIcon className="size-4 text-muted-foreground" />
          ) : (
            <img
              src={faviconUrl(info.url)}
              alt=""
              className="size-4"
              onError={() => setIconFailed(true)}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium leading-snug tracking-tight">
            {title}
          </p>
          {host && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {host}
            </p>
          )}
        </div>
      </div>
      {info.description && (
        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
          {info.description}
        </p>
      )}
      {facts.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          {facts.join(" · ")}
        </p>
      )}
    </section>
  );
}
