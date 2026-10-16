import { useEffect, useState } from "react";

/** Whole seconds since `since`, ticking once a second */
export function useElapsedSeconds(since: string) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - start) / 1000));
}
