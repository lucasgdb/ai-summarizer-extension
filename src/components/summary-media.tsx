import {
  DownloadIcon,
  FilmIcon,
  HeadphonesIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { browser } from "#imports";
import { BlockedReason } from "@/components/blocked-reason";
import { Hint } from "@/components/hint";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  type VideoJsHandle,
  VideoJsPlayer,
} from "@/components/video-js-player";
import { startAudioJob } from "@/lib/audio-busy";
import type { Session } from "@/lib/auth";
import { useBuyCredits } from "@/lib/buy-credits";
import { formatCredits, getDictionary } from "@/lib/i18n";
import {
  createMedia,
  downloadMedia,
  getMedia,
  getMediaUrl,
  MediaError,
  type MediaKind,
  type MediaUnavailable,
  requestDownloads,
  type SummaryMedia,
  unavailableReason,
} from "@/lib/media";
import {
  queryClient,
  refreshMediaQuotes,
  setBalance,
  useBalance,
  useMediaQuote,
} from "@/lib/queries";
import { ApiError } from "@/lib/requests";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

type Phase =
  /** The button: "Listen", or "Generate audio · N credits" */
  | { kind: "idle"; notice?: string }
  /** POST in flight */
  | { kind: "generating" }
  /** Being made (the POST answers 202), here or by another request */
  | { kind: "waiting"; mediaId: string }
  | { kind: "failed"; refunded: boolean }
  /** A 400 on generating: it can't be made, for a reason the API gave */
  | { kind: "unavailable"; reason: MediaUnavailable }
  | { kind: "playing"; media: SummaryMedia };

/**
 * How often to ask while it's being made, and when to give up. A video takes
 * minutes (~3 for a 7-minute one); audio, seconds
 */
const timing = {
  audio: { pollMs: 2500, waitLimitMs: 3 * 60_000 },
  video: { pollMs: 4000, waitLimitMs: 15 * 60_000 },
} satisfies Record<MediaKind, { pollMs: number; waitLimitMs: number }>;

const icons = { audio: HeadphonesIcon, video: FilmIcon };

/**
 * "Listen" (audio) or "Watch video" for the version on screen: the original
 * (no `language`) or a saved translation. Keyed by kind + summary + language
 * by its parent, so switching languages stops it and starts over
 */
export function MediaControl({
  kind,
  session,
  summaryId,
  language,
  title,
}: {
  kind: MediaKind;
  session: Session;
  summaryId: string;
  /** undefined: the summary's original language */
  language: string | undefined;
  /** Of the version on screen: the exported file is named after it */
  title: string;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const text = dict[kind];
  const Icon = icons[kind];
  const { pollMs, waitLimitMs } = timing[kind];
  const quote = useMediaQuote(kind, session, summaryId, language);
  const balance = useBalance(session).data ?? quote.data?.balance;
  const buyCredits = useBuyCredits();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // The "generating…" line: on screen or not when it's ready (see below)
  const status = useRef<HTMLParagraphElement>(null);

  // Waiting on an audio: summarize and translate wait too (see audio-busy),
  // for as long as this screen follows it. Not for a video: minutes is too
  // long to block anything
  const waiting = kind === "audio" && phase.kind === "waiting";
  useEffect(() => {
    if (waiting) return startAudioJob();
  }, [waiting]);

  // Being generated elsewhere when this opened: wait for it like our own
  const processing =
    phase.kind === "idle" && quote.data?.media?.status === "processing"
      ? quote.data.media.id
      : null;
  useEffect(() => {
    if (processing) setPhase({ kind: "waiting", mediaId: processing });
  }, [processing]);

  // Waiting: GET /audio/{id} (or /videos/{id}) until ready or failed. It
  // also picks up after the panel is closed and opened again: the quote
  // brings it back as "processing"
  const waitingFor = phase.kind === "waiting" ? phase.mediaId : null;
  useEffect(() => {
    if (!waitingFor) return;
    const controller = new AbortController();
    const started = Date.now();
    (async () => {
      while (!controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        if (controller.signal.aborted) return;
        try {
          const media = await getMedia(
            kind,
            session.token,
            waitingFor,
            controller.signal,
          );
          if (media.status === "ready") {
            refreshMediaQuotes(session, summaryId);
            // Charged while it was being made (the POST answers 202 first):
            // the balance and the statement catch up now
            queryClient.invalidateQueries({
              queryKey: ["credits", session.user.id],
            });
            // Opens by itself (scrolled into view) only if it's still in
            // sight: a section left meanwhile is hidden, not gone, and
            // shows the ready button when the user comes back
            const shown = status.current?.checkVisibility() ?? false;
            setPhase(shown ? { kind: "playing", media } : { kind: "idle" });
            return;
          }
          if (media.status === "failed") {
            setPhase({ kind: "failed", refunded: true });
            return;
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && error.status === 404) {
            setPhase({ kind: "idle" });
            refreshMediaQuotes(session, summaryId);
            return;
          }
          // A network hiccup: the next round tries again
        }
        if (Date.now() - started > waitLimitMs) {
          setPhase({ kind: "failed", refunded: true });
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [waitingFor, session, summaryId, kind, pollMs, waitLimitMs]);

  async function generate(price: number) {
    setPhase({ kind: "generating" });
    // Held for the whole request, even if this screen goes away meanwhile:
    // summarize and translate wait until it's charged
    const done = startAudioJob();
    try {
      const result = await createMedia(
        kind,
        session.token,
        summaryId,
        language,
        price,
      );
      refreshMediaQuotes(session, summaryId);
      // Charged (a video says by how much right away, in the 202)
      if (result.credit_balance !== undefined) {
        setBalance(session, result.credit_balance);
        queryClient.invalidateQueries({
          queryKey: ["credits", session.user.id, "transactions"],
        });
      }
      if (result.kind === "processing") {
        setPhase({ kind: "waiting", mediaId: result.media.id });
        return;
      }
      setPhase({ kind: "playing", media: result.media });
    } catch (error) {
      console.error(error);
      const failure = error instanceof MediaError ? error : null;
      if (failure?.reason === "unauthorized") return;
      if (failure?.credits?.balance !== undefined) {
        setBalance(session, failure.credits.balance);
      }
      refreshMediaQuotes(session, summaryId);
      switch (failure?.reason) {
        case "price-changed":
          setPhase({
            kind: "idle",
            notice: text.priceChanged(
              formatCredits(locale, failure.credits?.price ?? 0),
            ),
          });
          return;
        case "insufficient":
          setPhase({ kind: "idle" });
          return;
        case "invalid":
          setPhase({
            kind: "unavailable",
            reason: unavailableReason(failure.detail),
          });
          return;
        case "gone":
          // Deleted meanwhile: the screen catches up
          queryClient.invalidateQueries({
            queryKey: ["summary", session.user.id, summaryId],
          });
          setPhase({ kind: "idle", notice: text.gone });
          return;
        case "offline":
          setPhase({ kind: "idle", notice: dict.summaryErrors.offline.title });
          return;
        default:
          setPhase({ kind: "failed", refunded: failure?.refunded ?? false });
      }
    } finally {
      done();
    }
  }

  if (phase.kind === "playing") {
    const Player = kind === "video" ? VideoPlayer : AudioPlayer;
    return (
      <Player
        session={session}
        media={phase.media}
        title={title}
        onClose={() => setPhase({ kind: "idle" })}
        onNotReady={() =>
          setPhase({ kind: "waiting", mediaId: phase.media.id })
        }
        onGone={() => {
          refreshMediaQuotes(session, summaryId);
          setPhase({ kind: "idle" });
        }}
      />
    );
  }

  if (phase.kind === "generating" || phase.kind === "waiting") {
    return (
      <p
        ref={status}
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner />
        {text.generating}
      </p>
    );
  }

  if (phase.kind === "failed") {
    const price = quote.data?.credits;
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {text.failed}
          {phase.refunded && ` ${dict.credits.refunded}`}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={price === undefined}
          onClick={() => price !== undefined && generate(price)}
        >
          <RotateCcwIcon data-icon="inline-start" />
          {dict.tryAgain}
        </Button>
      </div>
    );
  }

  // Can't be made (a language without a voice yet, a summary too long), from
  // the quote's 400 or the generation's: the button stays, disabled, and
  // says why
  const unavailable =
    phase.kind === "unavailable"
      ? phase.reason
      : quote.error instanceof ApiError && quote.error.status === 400
        ? unavailableReason(quote.error.body.error)
        : null;
  if (unavailable) {
    return (
      <BlockedReason
        reason={text.unavailable[unavailable] ?? text.unavailable.other ?? null}
      >
        <Button variant="outline" size="sm" disabled>
          <Icon data-icon="inline-start" />
          {text.open}
        </Button>
      </BlockedReason>
    );
  }

  const data = quote.data;
  const cached = data?.cached === true && data.media?.status === "ready";
  const price = data?.credits;
  const insufficient =
    !cached &&
    data !== undefined &&
    (!data.sufficient ||
      (balance !== undefined && price !== undefined && balance < price));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={quote.isPending || insufficient}
          aria-label={
            cached
              ? text.open
              : price === undefined
                ? text.generate
                : `${text.generate} · ${formatCredits(locale, price)}`
          }
          onClick={() => {
            if (cached && data?.media) {
              setPhase({ kind: "playing", media: data.media });
            } else if (price !== undefined) {
              generate(price);
            }
          }}
        >
          <Icon data-icon="inline-start" />
          {cached ? (
            text.open
          ) : (
            <>
              {text.generate}
              <span className="font-normal text-muted-foreground tabular-nums">
                ·{" "}
                {price === undefined ? (
                  // Only the number comes from the API
                  <>
                    <TextSkeleton className="w-4 bg-current opacity-30" />{" "}
                    {dict.credits.unit}
                  </>
                ) : (
                  formatCredits(locale, price)
                )}
              </span>
            </>
          )}
        </Button>
        {insufficient && buyCredits && (
          <Button variant="ghost" size="sm" onClick={buyCredits}>
            {dict.buy.open}
          </Button>
        )}
      </div>
      {insufficient && price !== undefined && balance !== undefined && (
        <p className="text-sm text-muted-foreground">
          {balance < 0
            ? dict.credits.negativeBody
            : text.insufficient(
                formatCredits(locale, price),
                formatCredits(locale, balance),
              )}
        </p>
      )}
      {phase.kind === "idle" && phase.notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {phase.notice}
        </p>
      )}
    </div>
  );
}

const speeds = [1, 1.25, 1.5, 2];
const skipSeconds = 10;

/** "0:36", "8:05" */
function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Ahead of play, a link this close to expiring is swapped for a new one */
const renewBeforeMs = 60_000;

/**
 * The MP3 straight from the bucket, in a hidden <audio> with controls of our
 * own (shadcn Slider and Buttons): play/pause, ±10 s, a seek bar, the time and
 * the speed. The link lasts 30 minutes and is never kept: a new one on open,
 * before playing a nearly expired one, and when it fails mid-play (resuming
 * where it stopped)
 */
function AudioPlayer({
  session,
  media: audio,
  title,
  onClose,
  onNotReady,
  onGone,
}: {
  session: Session;
  media: SummaryMedia;
  title: string;
  onClose: () => void;
  /** 409 on the link: back to waiting for it */
  onNotReady: () => void;
  /** 404: deleted */
  onGone: () => void;
}) {
  const dict = getDictionary(useLocale());
  const element = useRef<HTMLAudioElement>(null);
  const expiresAt = useRef(0);
  const renewing = useRef(false);
  /** Recoveries in a row: a broken file isn't retried forever */
  const recoveries = useRef(0);
  const [src, setSrc] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(0);
  // From the API until the file says (the bar is right before it loads)
  const [duration, setDuration] = useState(audio.duration_ms / 1000);
  /** While the thumb is dragged: shown, not yet applied */
  const [seeking, setSeeking] = useState<number | null>(null);
  const { exporting, exportError, exportFile } = useMediaExport(
    "audio",
    session,
    audio,
    title,
    onGone,
  );

  async function freshUrl() {
    try {
      const link = await getMediaUrl("audio", session.token, audio.id);
      expiresAt.current = Date.parse(link.expires_at);
      return link.url;
    } catch (error) {
      console.error(error);
      if (error instanceof MediaError && error.reason === "gone") onGone();
      else if (error instanceof ApiError && error.status === 409) onNotReady();
      else setFailed(true);
      return null;
    }
  }

  /** New link, same place: after an expiry, or one about to happen */
  async function renew(resume: boolean) {
    const player = element.current;
    if (!player || renewing.current) return;
    renewing.current = true;
    setLoading(true);
    const at = player.currentTime;
    const url = await freshUrl();
    renewing.current = false;
    if (!url || !element.current) return;
    const restore = () => {
      player.currentTime = at;
      player.playbackRate = speed;
      if (resume) void player.play().catch(() => {});
    };
    player.addEventListener("loadedmetadata", restore, { once: true });
    setSrc(url);
  }

  // A new link every time the player opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per open
  useEffect(() => {
    let active = true;
    freshUrl().then((url) => {
      if (active && url) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [audio.id]);

  useEffect(() => {
    if (element.current) element.current.playbackRate = speed;
  }, [speed]);

  // A smooth bar while playing (timeupdate only fires ~4 times a second)
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (element.current) setTime(element.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function toggle() {
    const player = element.current;
    if (!player || !src) return;
    if (player.paused) {
      // About to run out: a new link first, then on from the same spot
      if (expiresAt.current - Date.now() < renewBeforeMs) {
        void renew(true);
        return;
      }
      void player.play().catch(() => {});
    } else {
      player.pause();
    }
  }

  function seekTo(seconds: number) {
    const player = element.current;
    if (!player) return;
    const clamped = Math.min(Math.max(seconds, 0), duration || seconds);
    player.currentTime = clamped;
    setTime(clamped);
  }

  const shown = seeking ?? time;

  return (
    <RevealOnOpen>
      <section
        className="space-y-3 rounded-lg border p-card"
        aria-label={dict.audio.player}
      >
        <div className="flex items-center gap-2">
          <HeadphonesIcon className="size-4 text-muted-foreground" />
          <p className="flex-1 text-sm font-medium tracking-tight">
            {dict.audio.player}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {formatDuration(audio.duration_ms)}
            </span>
          </p>
          <Hint label={dict.audio.export}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={dict.audio.export}
              disabled={exporting}
              onClick={exportFile}
            >
              {exporting ? <Spinner /> : <DownloadIcon />}
            </Button>
          </Hint>
          <Hint label={dict.audio.close}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={dict.audio.close}
              onClick={onClose}
            >
              <XIcon />
            </Button>
          </Hint>
        </div>

        {/* biome-ignore lint/a11y/useMediaCaption: the summary's own text is on screen */}
        <audio
          ref={element}
          preload="metadata"
          src={src ?? undefined}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            if (Number.isFinite(seconds)) setDuration(seconds);
            event.currentTarget.playbackRate = speed;
          }}
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onPlaying={() => {
            setLoading(false);
            recoveries.current = 0;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setTime(duration);
          }}
          onTimeUpdate={(event) => {
            if (!playing) setTime(event.currentTarget.currentTime);
          }}
          onError={() => {
            // Expired mid-use (or a dropped connection): once or twice, a new
            // link from where it stopped
            if (!src || recoveries.current >= 2) {
              if (src) setFailed(true);
              setLoading(false);
              return;
            }
            recoveries.current++;
            void renew(playing);
          }}
        />

        {/* The bar and its times as one block. The root is what takes the
          click (Radix): 24px tall around a 4px track, so it's easy to hit;
          the times tuck into the bottom of that area instead of starting
          below it, so nothing looks far from the line */}
        <div>
          <Slider
            className="h-6 cursor-pointer"
            aria-label={dict.audio.seek}
            min={0}
            max={duration || 1}
            step={0.1}
            value={[Math.min(shown, duration || 0)]}
            disabled={!src}
            onValueChange={([value]) => setSeeking(value ?? 0)}
            onValueCommit={([value]) => {
              setSeeking(null);
              seekTo(value ?? 0);
            }}
          />
          <div className="-mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(shown)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="-mt-3 flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={dict.audio.back(skipSeconds)}
            disabled={!src}
            onClick={() => seekTo(time - skipSeconds)}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            size="icon"
            className="rounded-full"
            aria-label={playing ? dict.audio.pause : dict.audio.play}
            disabled={!src}
            onClick={toggle}
          >
            {loading && src && !playing ? (
              <Spinner />
            ) : playing ? (
              <PauseIcon className="fill-current" />
            ) : (
              <PlayIcon className="translate-x-px fill-current" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={dict.audio.forward(skipSeconds)}
            disabled={!src}
            onClick={() => seekTo(time + skipSeconds)}
          >
            <RotateCwIcon />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          <span className="sr-only">{dict.audio.speed}</span>
          {speeds.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              aria-label={`${dict.audio.speed} ${value}×`}
              onClick={() => setSpeed(value)}
              className={cn(
                "cursor-pointer rounded-full px-2 py-0.5 text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                speed === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}×
            </button>
          ))}
        </div>

        {failed && (
          <LoadFailed
            message={dict.audio.failed}
            onRetry={() => {
              recoveries.current = 0;
              setFailed(false);
              void renew(false);
            }}
          />
        )}
        {exportError && (
          <p role="alert" className="text-sm text-muted-foreground">
            {exportError}
          </p>
        )}
      </section>
    </RevealOnOpen>
  );
}

/** "6:39": minutes and seconds, from milliseconds */
function formatDuration(ms: number) {
  return formatTime(ms / 1000);
}

/**
 * The MP4 straight from the bucket, in Video.js with the panel's look: 16:9 at
 * the panel's full width, speed, and a fullscreen that opens a fullscreen
 * window (the side panel can't go fullscreen itself), from the same second.
 * The link lasts 30 minutes and is never kept: a new one on open, before
 * playing a nearly expired one, and when loading fails
 */
function VideoPlayer({
  session,
  media: video,
  title,
  onClose,
  onNotReady,
  onGone,
}: {
  session: Session;
  media: SummaryMedia;
  title: string;
  onClose: () => void;
  /** 409 on the link: back to waiting for it */
  onNotReady: () => void;
  /** 404: deleted */
  onGone: () => void;
}) {
  const dict = getDictionary(useLocale());
  const expiresAt = useRef(0);
  const renewing = useRef(false);
  const recoveries = useRef(0);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { exporting, exportError, exportFile } = useMediaExport(
    "video",
    session,
    video,
    title,
    onGone,
  );

  async function freshUrl() {
    try {
      const link = await getMediaUrl("video", session.token, video.id);
      expiresAt.current = Date.parse(link.expires_at);
      return link.url;
    } catch (error) {
      console.error(error);
      if (error instanceof MediaError && error.reason === "gone") onGone();
      else if (error instanceof ApiError && error.status === 409) onNotReady();
      else setFailed(true);
      return null;
    }
  }

  /** A new link: the player keeps the spot and whether it was playing */
  async function renew() {
    if (renewing.current) return;
    renewing.current = true;
    const url = await freshUrl();
    renewing.current = false;
    if (url) setSrc(url);
  }

  // A new link every time the player opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per open
  useEffect(() => {
    let active = true;
    freshUrl().then((url) => {
      if (active && url) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [video.id]);

  // Back from the fullscreen window: on from where it stopped there
  const panelPlayer = useRef<VideoJsHandle | null>(null);
  useEffect(() => {
    const onMessage = (message: unknown) => {
      const closed = message as { type?: string; video?: string; at?: number };
      if (
        closed?.type !== "video-fullscreen-closed" ||
        closed.video !== video.id
      ) {
        return;
      }
      if (typeof closed.at === "number") panelPlayer.current?.seek(closed.at);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [video.id]);

  function openFullscreen(at: number) {
    const url = browser.runtime.getURL(
      `/player.html?${new URLSearchParams({
        video: video.id,
        t: String(Math.floor(at)),
        title,
      })}` as `/player.html${string}`,
    );
    void browser.windows.create({ url, state: "fullscreen" });
  }

  return (
    <RevealOnOpen>
      <section
        className="space-y-2 rounded-lg border p-card"
        aria-label={dict.video.player}
      >
        <div className="flex items-center gap-2">
          <FilmIcon className="size-4 text-muted-foreground" />
          <p className="flex-1 text-sm font-medium tracking-tight">
            {dict.video.player}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {formatDuration(video.duration_ms)}
            </span>
          </p>
          <Hint label={dict.video.export}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={dict.video.export}
              disabled={exporting}
              onClick={exportFile}
            >
              {exporting ? <Spinner /> : <DownloadIcon />}
            </Button>
          </Hint>
          <Hint label={dict.video.close}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={dict.video.close}
              onClick={onClose}
            >
              <XIcon />
            </Button>
          </Hint>
        </div>
        <VideoJsPlayer
          src={src}
          type={video.content_type}
          label={dict.video.player}
          onFullscreen={openFullscreen}
          handle={(next) => {
            panelPlayer.current = next;
          }}
          onPlay={() => {
            // About to run out: a new link, from the same spot
            if (expiresAt.current - Date.now() < renewBeforeMs) void renew();
          }}
          onError={() => {
            // Expired (or a dropped connection): once or twice, a new link
            if (recoveries.current >= 2) {
              setFailed(true);
              return;
            }
            recoveries.current++;
            void renew();
          }}
        />
        {failed && (
          <LoadFailed
            message={dict.video.loadFailed}
            onRetry={() => {
              recoveries.current = 0;
              setFailed(false);
              void renew();
            }}
          />
        )}
        {exportError && (
          <p role="alert" className="text-sm text-muted-foreground">
            {exportError}
          </p>
        )}
      </section>
    </RevealOnOpen>
  );
}

/** The file wouldn't load even with fresh links: why, and a way to try again */
function LoadFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const dict = getDictionary(useLocale());
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <p className="flex items-center gap-1.5 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" />
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcwIcon data-icon="inline-start" />
        {dict.tryAgain}
      </Button>
    </div>
  );
}

/**
 * Saving the file as the API stores it (MP3 or MP4, no re-encoding), named
 * after the summary. The downloads permission is asked on the first one
 */
function useMediaExport(
  kind: MediaKind,
  session: Session,
  media: SummaryMedia,
  title: string,
  onGone: () => void,
) {
  const text = getDictionary(useLocale())[kind];
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportFile() {
    setExportError(null);
    // First, straight from the click: Chrome only asks inside a user gesture
    const allowed = await requestDownloads().catch(() => false);
    if (!allowed) {
      setExportError(text.exportDenied);
      return;
    }
    setExporting(true);
    try {
      await downloadMedia(kind, session.token, media, title);
    } catch (error) {
      console.error(error);
      if (error instanceof MediaError && error.reason === "gone") onGone();
      else setExportError(text.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportError, exportFile };
}

/**
 * Where a player appears in place of its button: scrolled into view, since
 * the players sit at the end of the summary and would open below the fold.
 * Again while it settles (the controls, a video's frame), then left alone so
 * the user's own scrolling wins
 */
function RevealOnOpen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Opened from its button, which is gone now: focus goes to the player
  // (before KeepFocus would send it to the page's heading)
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      ref.current?.focus({ preventScroll: true });
    }
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reveal = () => element.scrollIntoView({ block: "nearest" });
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(element);
    const stop = setTimeout(() => observer.disconnect(), 1000);
    return () => {
      clearTimeout(stop);
      observer.disconnect();
    };
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="w-full basis-full scroll-mb-4 outline-none"
    >
      {children}
    </div>
  );
}
