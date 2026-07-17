"use client";

import { useEffect } from "react";

const MOBILE_LAYOUT_QUERY = "(max-width: 820px)";
const KEYBOARD_THRESHOLD_PX = 140;
const KEYBOARD_HEIGHT_RATIO = 0.82;

function isEditableTarget(target: Element | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLElement && target.isContentEditable;
}

function setPixelProperty(root: HTMLElement, property: string, value: number) {
  const next = Math.round(value);
  const current = Number.parseFloat(root.style.getPropertyValue(property));
  if (Number.isFinite(current) && Math.abs(current - next) < 1) return;
  root.style.setProperty(property, `${next}px`);
}

export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const viewport = window.visualViewport;
    let frame: number | undefined;
    let enabled = false;
    let syncHeight = false;
    let layoutHeight = window.innerHeight;

    const reset = () => {
      delete root.dataset.keyboardOpen;
      root.style.removeProperty("--visual-viewport-height");
      root.style.removeProperty("--visual-viewport-offset-top");
    };

    const sync = () => {
      frame = undefined;
      if (!enabled || document.visibilityState === "hidden") return;

      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const focused = isEditableTarget(document.activeElement);
      if (!focused) layoutHeight = window.innerHeight;
      const availableLayoutHeight = Math.max(layoutHeight, window.innerHeight);
      const keyboardOpen = focused
        && availableLayoutHeight - height > KEYBOARD_THRESHOLD_PX
        && height < availableLayoutHeight * KEYBOARD_HEIGHT_RATIO;

      if (syncHeight) setPixelProperty(root, "--visual-viewport-height", height);
      setPixelProperty(root, "--visual-viewport-offset-top", offsetTop);

      const nextKeyboardState = keyboardOpen ? "true" : "false";
      if (root.dataset.keyboardOpen !== nextKeyboardState) {
        root.dataset.keyboardOpen = nextKeyboardState;
      }
      syncHeight = false;
    };

    const schedule = (includeHeight = true) => {
      if (!enabled || document.visibilityState === "hidden") return;
      syncHeight ||= includeHeight;
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(sync);
    };

    const handleViewportResize = () => schedule(true);
    const handleViewportScroll = () => schedule(false);
    const handleFocusChange = () => schedule(true);
    const handleVisible = () => {
      if (document.visibilityState === "visible") schedule(true);
    };

    const addMobileListeners = () => {
      if (enabled) return;
      enabled = true;
      viewport?.addEventListener("resize", handleViewportResize);
      viewport?.addEventListener("scroll", handleViewportScroll);
      window.addEventListener("resize", handleViewportResize, { passive: true });
      window.addEventListener("pageshow", handleViewportResize);
      document.addEventListener("focusin", handleFocusChange);
      document.addEventListener("focusout", handleFocusChange);
      document.addEventListener("visibilitychange", handleVisible);
      schedule(true);
    };

    const removeMobileListeners = () => {
      if (!enabled) return;
      enabled = false;
      viewport?.removeEventListener("resize", handleViewportResize);
      viewport?.removeEventListener("scroll", handleViewportScroll);
      window.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("pageshow", handleViewportResize);
      document.removeEventListener("focusin", handleFocusChange);
      document.removeEventListener("focusout", handleFocusChange);
      document.removeEventListener("visibilitychange", handleVisible);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      reset();
    };

    const handleMediaChange = () => {
      if (media.matches) addMobileListeners();
      else removeMobileListeners();
    };

    media.addEventListener("change", handleMediaChange);
    handleMediaChange();

    return () => {
      media.removeEventListener("change", handleMediaChange);
      removeMobileListeners();
    };
  }, []);
}
