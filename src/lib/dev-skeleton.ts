// Development only: what every loading state shows (components/loadable.tsx),
// chosen with the switch at the bottom of the panel (dev/skeleton-switch.tsx).
// "real": as in production. "skeleton": the skeleton even once the data is
// there. "overlay": the data, with the skeleton's shapes over it in
// translucent red, to line the two up to the pixel. A build never changes
// anything: `devSkeleton` is false there and the code goes away
import { useSyncExternalStore } from "react";

export type SkeletonMode = "real" | "skeleton" | "overlay";

export const skeletonModes: SkeletonMode[] = ["real", "skeleton", "overlay"];

/** `pnpm dev` (mode "development"); false in every build */
export const devSkeleton = import.meta.env.MODE === "development";

const key = "dev-skeleton";
const listeners = new Set<() => void>();

function read(): SkeletonMode {
  try {
    const saved = sessionStorage.getItem(key);
    return skeletonModes.includes(saved as SkeletonMode)
      ? (saved as SkeletonMode)
      : "real";
  } catch {
    return "real";
  }
}

let mode: SkeletonMode = devSkeleton ? read() : "real";

export function setSkeletonMode(next: SkeletonMode) {
  mode = next;
  try {
    sessionStorage.setItem(key, next);
  } catch {}
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The switch's mode; always "real" outside `pnpm dev` */
export function useSkeletonMode(): SkeletonMode {
  return useSyncExternalStore(
    subscribe,
    () => mode,
    () => "real",
  );
}
