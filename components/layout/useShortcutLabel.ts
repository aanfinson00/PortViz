"use client";

import { useEffect, useState } from "react";

/**
 * Returns a platform-appropriate label for the Cmd-K / Ctrl-K shortcut.
 * SSR + first client render emit "Ctrl K" (the common case for the
 * Windows-heavy user base); after mount, Mac browsers swap to "⌘ K".
 * Splitting state this way avoids React hydration mismatches.
 */
export function useShortcutLabel(key = "K"): string {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const platform =
      (navigator as { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform ?? "";
    if (/Mac|iPad|iPhone|iPod/i.test(platform)) setIsMac(true);
  }, []);
  return isMac ? `⌘ ${key}` : `Ctrl ${key}`;
}
