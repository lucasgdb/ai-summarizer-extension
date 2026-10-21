// The summary's video in a fullscreen window. The side panel can't go
// fullscreen itself, so its fullscreen button opens this page in a window in
// fullscreen state, from the same second. Esc (or the X) closes it
import { XIcon } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "#imports";
import { Button } from "@/components/ui/button";
import {
  type VideoJsHandle,
  VideoJsPlayer,
} from "@/components/video-js-player";
import { parseSession, sessionItem } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getMediaUrl } from "@/lib/media";
import { loadLocale, useLocale } from "@/lib/use-locale";
import "@/styles/globals.css";

const params = new URLSearchParams(location.search);
const videoId = params.get("video") ?? "";
const startAt = Number(params.get("t") ?? 0) || 0;
document.title = params.get("title") || "AI Summarizer";

await loadLocale();

/** Where the video is, for the panel to pick up from */
let player: VideoJsHandle | null = null;

/**
 * Back to the panel, which picks up from where this stopped (it listens for
 * this message), then the window goes
 */
function close(at?: number) {
  if (at !== undefined) {
    void browser.runtime
      .sendMessage({ type: "video-fullscreen-closed", video: videoId, at })
      .catch(() => {});
  }
  window.close();
}

function FullscreenPlayer() {
  const dict = getDictionary(useLocale());
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function fetchUrl() {
    const session = parseSession(await sessionItem.getValue());
    if (!session) {
      setFailed(true);
      return;
    }
    try {
      const link = await getMediaUrl("video", session.token, videoId);
      setSrc(link.url);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on open
  useEffect(() => {
    void fetchUrl();
    const onKey = (event: KeyboardEvent) => {
      // Video.js uses Esc to leave its own fullscreen: only when it isn't in it
      if (event.key === "Escape" && !document.fullscreenElement) {
        close(player?.currentTime());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="relative h-dvh w-screen bg-black">
      {failed ? (
        <p className="grid h-full place-items-center text-sm text-white/80">
          {dict.video.loadFailed}
        </p>
      ) : (
        <VideoJsPlayer
          src={src}
          label={dict.video.player}
          fill
          autoplay
          startAt={startAt}
          onExitFullscreen={(at) => close(at)}
          handle={(next) => {
            player = next;
          }}
          // An expired link mid-play: a new one, from the same spot
          onError={() => void fetchUrl()}
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 right-3 z-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
        aria-label={dict.video.close}
        onClick={() => close(player?.currentTime())}
      >
        <XIcon />
      </Button>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");
createRoot(root).render(
  <StrictMode>
    <FullscreenPlayer />
  </StrictMode>,
);
