import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDictionary } from "@/lib/use-locale";
import "@/styles/video-js.css";

const speeds = [1, 1.25, 1.5, 2];

export type VideoJsHandle = {
  currentTime: () => number;
  pause: () => void;
  seek: (seconds: number) => void;
};

/**
 * Video.js on a <video-js> element, with the panel's look (styles/video-js.css).
 * Created once per mount; a new `src` swaps the source and keeps going from
 * `resumeAt` when given. `onFullscreen`, when set, replaces the browser's
 * fullscreen (button and double-click): the side panel can't go fullscreen
 * itself, so the panel opens a fullscreen window instead
 */
export function VideoJsPlayer({
  src,
  type = "video/mp4",
  label,
  fill = false,
  autoplay = false,
  startAt = 0,
  onFullscreen,
  onExitFullscreen,
  onPlay,
  onError,
  handle,
}: {
  src: string | null;
  /** The file's content_type */
  type?: string;
  label: string;
  /** Fill the parent (the fullscreen window) instead of a 16:9 box */
  fill?: boolean;
  autoplay?: boolean;
  /** Seconds to start from, once the first source has loaded */
  startAt?: number;
  onFullscreen?: (at: number) => void;
  /**
   * Already "fullscreen" (the fullscreen window): the button shows "exit",
   * and it (or a double-click) calls this instead of the browser's exit
   */
  onExitFullscreen?: (at: number) => void;
  /** Before playing: e.g. swap a link that's about to expire */
  onPlay?: () => void;
  /** The source failed (an expired link): `at` is where it stopped */
  onError?: (at: number, wasPlaying: boolean) => void;
  handle?: (handle: VideoJsHandle | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  // The latest callbacks, without re-creating the player
  const callbacks = useRef({ onFullscreen, onExitFullscreen, onPlay, onError });
  callbacks.current = { onFullscreen, onExitFullscreen, onPlay, onError };
  const started = useRef(false);
  // Where the speed menu renders, in the control bar, once there is one
  const [speedSlot, setSpeedSlot] = useState<{
    player: Player;
    slot: HTMLElement;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: created once
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    // Video.js moves and replaces the element: React only owns the container
    const element = document.createElement("video-js");
    element.classList.add("vjs-panel");
    host.append(element);
    const instance = videojs(element, {
      controls: true,
      preload: "metadata",
      autoplay,
      playsinline: true,
      fill,
      aspectRatio: fill ? undefined : "16:9",
      fluid: !fill,
      controlBar: {
        pictureInPictureToggle: false,
        remainingTimeDisplay: false,
        // The speed menu is ours (SpeedMenu): Video.js's draws a giant "1x"
        playbackRateMenuButton: false,
      },
      userActions: { doubleClick: true, hotkeys: true },
    });
    instance.el().setAttribute("aria-label", label);
    player.current = instance;

    // Right before the fullscreen button, where Video.js puts its own
    const bar = instance.getChild("ControlBar");
    const slot = document.createElement("div");
    slot.className = "vjs-control vjs-speed-slot";
    bar
      ?.el()
      .insertBefore(slot, bar.getChild("FullscreenToggle")?.el() ?? null);
    setSpeedSlot({ player: instance, slot });

    if (callbacks.current.onFullscreen) {
      // The button and double-click both end up here
      instance.requestFullscreen = () => {
        instance.pause();
        callbacks.current.onFullscreen?.(instance.currentTime() ?? 0);
        return Promise.resolve();
      };
    }
    if (callbacks.current.onExitFullscreen) {
      // The window is the fullscreen: shown as such, and leaving it closes
      // the window (the browser's own fullscreen isn't involved)
      // The class switches the button's icon to "exit"; its label is set
      // here. Not a fullscreenchange event: Video.js would check the
      // browser's real state (not fullscreen) and undo both
      instance.isFullscreen(true);
      instance.addClass("vjs-fullscreen");
      const toggle = instance
        .getChild("ControlBar")
        ?.getChild("FullscreenToggle") as
        | { controlText: (text: string) => void }
        | undefined;
      toggle?.controlText(instance.localize("Exit Fullscreen"));
      instance.exitFullscreen = () => {
        callbacks.current.onExitFullscreen?.(instance.currentTime() ?? 0);
        return Promise.resolve();
      };
      instance.requestFullscreen = () => Promise.resolve();
    }
    instance.on("play", () => callbacks.current.onPlay?.());
    instance.on("error", () => {
      callbacks.current.onError?.(
        instance.currentTime() ?? 0,
        !instance.paused(),
      );
    });
    handle?.({
      currentTime: () => instance.currentTime() ?? 0,
      pause: () => instance.pause(),
      seek: (seconds) => {
        instance.currentTime(seconds);
      },
    });

    return () => {
      setSpeedSlot(null);
      handle?.(null);
      instance.dispose();
      player.current = null;
    };
  }, []);

  // A new link: same spot, same state (startAt and autoplay only count for
  // the first one)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per source
  useEffect(() => {
    const instance = player.current;
    if (!instance || !src) return;
    const first = !started.current;
    const at = first ? startAt : (instance.currentTime() ?? 0);
    const wasPlaying = first ? autoplay : !instance.paused();
    instance.error(null);
    instance.src({ src, type });
    instance.one("loadedmetadata", () => {
      if (at > 0) instance.currentTime(at);
      if (wasPlaying) void instance.play()?.catch(() => {});
    });
    started.current = true;
  }, [src]);

  return (
    <div ref={container} className={fill ? "h-full w-full" : "w-full"}>
      {speedSlot &&
        createPortal(<SpeedMenu player={speedSlot.player} />, speedSlot.slot)}
    </div>
  );
}

/**
 * The speed, as the panel's other menus (shadcn's dropdown, like the audio
 * player's choices). While it's open the controls stay up: the pointer is
 * over the menu, outside the player, and Video.js would hide them
 */
function SpeedMenu({ player }: { player: Player }) {
  const dict = useDictionary();
  const [rate, setRate] = useState(() => player.playbackRate() ?? 1);

  useEffect(() => {
    const update = () => setRate(player.playbackRate() ?? 1);
    player.on("ratechange", update);
    return () => player.off("ratechange", update);
  }, [player]);

  function onOpenChange(open: boolean) {
    const options = player.options_ as { inactivityTimeout?: number };
    // Read on every check: 0 keeps the user "active" (controls shown)
    options.inactivityTimeout = open ? 0 : 2000;
    player.userActive(true);
  }

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={`${dict.audio.speed}: ${rate}×`}
        className="h-6 cursor-pointer rounded-md px-1.5 text-xs font-medium tabular-nums text-white/90 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 data-[state=open]:bg-white/15"
      >
        {rate}×
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-28">
        <DropdownMenuLabel>{dict.audio.speed}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(rate)}
          onValueChange={(value) => player.playbackRate(Number(value))}
        >
          {speeds.map((value) => (
            <DropdownMenuRadioItem
              key={value}
              value={String(value)}
              className="tabular-nums"
            >
              {value}×
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
