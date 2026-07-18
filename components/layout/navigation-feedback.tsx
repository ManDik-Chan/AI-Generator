"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function clearPendingLinks() {
  document.querySelectorAll<HTMLAnchorElement>("a[data-navigation-pending]").forEach((link) => {
    delete link.dataset.navigationPending;
    link.removeAttribute("aria-busy");
  });
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
    clearPendingLinks();
  }, [pathname, search]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash === window.location.hash) return;

      target.dataset.navigationPending = "true";
      target.setAttribute("aria-busy", "true");
      setPending(true);
    };

    const handlePageShow = () => {
      setPending(false);
      clearPendingLinks();
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pageshow", handlePageShow);
      clearPendingLinks();
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5" data-navigation-feedback data-pending={pending ? "true" : "false"}>
      <span className="block h-full origin-left scale-x-0 bg-primary opacity-0 shadow-[0_0_12px_hsl(var(--primary)/.55)] transition-[transform,opacity] duration-150 data-[pending=true]:scale-x-100 data-[pending=true]:opacity-100" data-pending={pending ? "true" : "false"} />
      <span className="sr-only">{pending ? "正在打开页面" : ""}</span>
    </div>
  );
}
