"use client";

import { useEffect } from "react";

const KEYBOARD_THRESHOLD_PX = 120;

export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame: number | undefined;

    const sync = () => {
      frame = undefined;
      if (document.visibilityState === "hidden") return;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      root.style.setProperty("--visual-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--visual-viewport-offset-top", `${Math.round(offsetTop)}px`);
      root.dataset.keyboardOpen = String(window.innerHeight - height > KEYBOARD_THRESHOLD_PX);
    };

    const scheduleSync = () => {
      if (frame !== undefined || document.visibilityState === "hidden") return;
      frame = window.requestAnimationFrame(sync);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleSync();
    };

    scheduleSync();
    viewport?.addEventListener("resize", scheduleSync);
    viewport?.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("pageshow", scheduleSync);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("pageshow", scheduleSync);
      document.removeEventListener("visibilitychange", handleVisibility);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty("--visual-viewport-height");
      root.style.removeProperty("--visual-viewport-offset-top");
    };
  }, []);
}
