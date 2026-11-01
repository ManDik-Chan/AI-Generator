"use client";

import { useEffect } from "react";
import { parseCookieHeader } from "@supabase/ssr";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase/browser";
import { readPersistence } from "@/lib/auth/supabase/persistence";

/** Keep live tabs in step with server-action logout and validate on return from sleep/bfcache. */
export function SessionSync({ viewerId }: { viewerId: string }) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let leaving = false;
    let disposed = false;
    let needsValidation = document.visibilityState === "hidden";
    let queuedReturn = false;
    let pending: AbortController | undefined;
    let pendingTimer: number | undefined;
    const cancelPending = () => {
      if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
      pendingTimer = undefined;
      pending?.abort();
      pending = undefined;
    };
    const leave = () => {
      if (leaving || disposed) return;
      leaving = true;
      cancelPending();
      void supabase.auth.stopAutoRefresh();
      // Discard cached authenticated RSC payloads when the session is invalid.
      window.location.replace("/login");
    };
    const checkLogout = () => {
      if (leaving) return true;
      const cookies = parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
      if (readPersistence(cookies) !== "signed-out") return false;
      leave();
      return true;
    };
    const validate = (force = false) => {
      if (disposed || checkLogout()) return;
      if (!force && document.visibilityState !== "visible") { needsValidation = true; return; }
      // One in-flight server check covers focus/visibility/pageshow event bursts.
      if (pending) {
        if (!force) {
          // A new away/return cycle may have changed accounts after this request
          // captured its cookies. Recheck that return once the old request settles.
          if (needsValidation) queuedReturn = true;
          return;
        }
        // SDK sign-out may arrive after the old request captured valid cookies.
        cancelPending();
      }
      needsValidation = false;
      queuedReturn = false;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => {
        if (disposed || leaving || pending !== controller) return;
        // An unavailable check grants no validity and must not block later returns.
        needsValidation = true;
        cancelPending();
        if (queuedReturn && document.visibilityState === "visible") validate();
      }, 10_000);
      pendingTimer = timeout;
      void fetch("/api/auth/session", {
        credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        // Identity context only: the server still authenticates the request's own session.
        headers: { "x-aig-viewer": viewerId },
      })
        .then((response) => {
          if (disposed || controller.signal.aborted || pending !== controller || checkLogout()) return;
          if (response.status === 401 || response.status === 409) leave();
          else if (response.status !== 204) needsValidation = true;
          // Valid sessions keep the current page, draft and generation mounted.
        })
        .catch(() => {
          if (!disposed && !controller.signal.aborted && pending === controller) needsValidation = true;
          // An unavailable check grants no access; protected requests still validate.
        })
        .finally(() => {
          window.clearTimeout(timeout);
          if (pending === controller) {
            pending = undefined; pendingTimer = undefined;
            // Transport errors alone wait for a later return; only an actual
            // return received during this request queues an immediate fresh check.
            if (queuedReturn && needsValidation && !disposed && !leaving && document.visibilityState === "visible") validate();
          }
        });
    };
    const onBlur = () => { if (!checkLogout()) needsValidation = true; };
    const onFocus = () => { if (!checkLogout() && needsValidation) validate(); };
    const onVisibility = () => {
      if (checkLogout()) return;
      if (document.visibilityState !== "visible") needsValidation = true;
      else if (needsValidation) validate();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // Initial entry was just checked by the server. Only bfcache restores need a check.
      if (!checkLogout() && event.persisted) validate();
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") validate(true);
    });
    checkLogout();
    const interval = window.setInterval(checkLogout, 2000);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      cancelPending();
      window.clearInterval(interval);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      subscription.unsubscribe();
    };
  }, [viewerId]);
  return null;
}
