"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseCookieHeader } from "@supabase/ssr";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase/browser";
import { readPersistence } from "@/lib/auth/supabase/persistence";

/** Keep live tabs in step with server-action logout and validate on return from sleep/bfcache. */
export function SessionSync() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let leaving = false;
    const checkLogout = () => {
      const cookies = parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
      if (readPersistence(cookies) !== "signed-out") return false;
      if (!leaving) {
        leaving = true;
        void supabase.auth.stopAutoRefresh();
        // A full navigation also discards the tab's cached authenticated RSC payloads.
        window.location.replace("/login");
      }
      return true;
    };
    const validate = () => {
      if (document.visibilityState === "visible" && !checkLogout()) router.refresh();
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !checkLogout()) router.refresh();
    });
    checkLogout();
    const interval = window.setInterval(checkLogout, 2000);
    window.addEventListener("focus", validate);
    window.addEventListener("pageshow", validate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", validate);
      window.removeEventListener("pageshow", validate);
      subscription.unsubscribe();
    };
  }, [router]);
  return null;
}
