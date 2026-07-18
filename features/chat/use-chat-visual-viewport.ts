"use client";

import { type RefObject, useEffect } from "react";

import { CHAT_VIEWPORT_CHANGE_EVENT, computeChatViewportMetrics } from "@/features/chat/viewport";

const MOBILE_LAYOUT_QUERY = "(max-width: 820px)";
const KEYBOARD_THRESHOLD_PX = 80;

function isEditableTarget(target: Element | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLElement && target.isContentEditable;
}

function setPixelProperty(element: HTMLElement, property: string, value: number) {
  const next = Math.round(value);
  const current = Number.parseFloat(element.style.getPropertyValue(property));
  if (Number.isFinite(current) && Math.abs(current - next) < 1) return false;
  element.style.setProperty(property, `${next}px`);
  return true;
}

export function useChatVisualViewport(shellRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const viewport = window.visualViewport;
    let frame: number | undefined;
    let enabled = false;
    let layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport?.height ?? 0);

    const reset = () => {
      const shell = shellRef.current;
      if (!shell) return;
      delete shell.dataset.keyboardOpen;
      shell.style.removeProperty("--chat-viewport-height");
      shell.style.removeProperty("--chat-viewport-top");
      shell.style.removeProperty("--keyboard-inset");
    };

    const sync = () => {
      frame = undefined;
      const shell = shellRef.current;
      if (!enabled || !shell || document.visibilityState === "hidden") return;

      const nextLayoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport?.height ?? 0);
      const focused = isEditableTarget(document.activeElement);
      if (!focused || (viewport?.height ?? nextLayoutHeight) >= layoutHeight - 1) {
        layoutHeight = nextLayoutHeight;
      } else {
        layoutHeight = Math.max(layoutHeight, nextLayoutHeight);
      }

      const metrics = computeChatViewportMetrics({
        layoutHeight,
        visualHeight: viewport?.height ?? nextLayoutHeight,
        offsetTop: viewport?.offsetTop ?? 0,
      });
      const changed = [
        setPixelProperty(shell, "--chat-viewport-height", metrics.height),
        setPixelProperty(shell, "--chat-viewport-top", metrics.top),
        setPixelProperty(shell, "--keyboard-inset", metrics.keyboardInset),
      ].some(Boolean);
      const keyboardOpen = focused && metrics.keyboardInset >= KEYBOARD_THRESHOLD_PX;
      const nextKeyboardState = keyboardOpen ? "true" : "false";
      if (shell.dataset.keyboardOpen !== nextKeyboardState) {
        shell.dataset.keyboardOpen = nextKeyboardState;
      }

      if (changed) {
        shell.dispatchEvent(new CustomEvent(CHAT_VIEWPORT_CHANGE_EVENT, { detail: metrics }));
      }
    };

    const schedule = () => {
      if (!enabled || document.visibilityState === "hidden" || frame !== undefined) return;
      frame = window.requestAnimationFrame(sync);
    };

    const handleVisible = () => {
      if (document.visibilityState === "visible") schedule();
      else if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        frame = undefined;
      }
    };

    const addMobileListeners = () => {
      if (enabled) return;
      enabled = true;
      viewport?.addEventListener("resize", schedule);
      viewport?.addEventListener("scroll", schedule);
      window.addEventListener("resize", schedule, { passive: true });
      window.addEventListener("pageshow", schedule);
      document.addEventListener("focusin", schedule);
      document.addEventListener("focusout", schedule);
      document.addEventListener("visibilitychange", handleVisible);
      schedule();
    };

    const removeMobileListeners = () => {
      if (!enabled) return;
      enabled = false;
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
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
  }, [shellRef]);
}
