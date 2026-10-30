"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { artFallback, renderArt, type ArtKey } from "@/features/landing/art";
import { cn } from "@/lib/utils";

/*
 * Procedural artwork for the platform, rendered by the same shader as the landing page.
 * Requests made in the same tick are batched into one WebGL pass; results are cached for
 * the session. Without WebGL (or with Save-Data) the CSS gradient stand-in remains.
 */

const cache = new Map<ArtKey, string>();
const waiting = new Map<ArtKey, Set<(url: string) => void>>();
let queued = new Set<ArtKey>();
let scheduled = false;
let unavailable = false;

function saveData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

async function flush() {
  scheduled = false;
  const keys = Array.from(queued);
  queued = new Set();
  if (!keys.length) return;
  let urls: Partial<Record<ArtKey, string>> = {};
  try {
    urls = await renderArt(keys, 1200, 800);
  } catch {
    urls = {};
  }
  if (!Object.keys(urls).length) unavailable = true;
  for (const key of keys) {
    const url = urls[key];
    const listeners = waiting.get(key);
    waiting.delete(key);
    if (!url) continue;
    cache.set(key, url);
    listeners?.forEach((listener) => listener(url));
  }
}

function requestArt(key: ArtKey, listener: (url: string) => void) {
  const hit = cache.get(key);
  if (hit) {
    listener(hit);
    return () => undefined;
  }
  if (unavailable || saveData()) return () => undefined;
  let listeners = waiting.get(key);
  if (!listeners) {
    listeners = new Set();
    waiting.set(key, listeners);
    queued.add(key);
  }
  listeners.add(listener);
  if (!scheduled) {
    scheduled = true;
    window.setTimeout(flush, 40);
  }
  return () => {
    listeners?.delete(listener);
  };
}

export function ArtSurface({
  k,
  className,
  children,
  style,
  zoom = false,
  label,
}: {
  k: ArtKey;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
  zoom?: boolean;
  /** Accessible description; omit for purely decorative artwork. */
  label?: string;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => requestArt(k, setUrl), [k]);
  const decorative = !label && !children;
  return (
    <div
      aria-hidden={decorative || undefined}
      aria-label={label}
      className={cn("art-surface", zoom && "art-surface--zoom", className)}
      data-ready={url ? "true" : undefined}
      role={label ? "img" : undefined}
      style={{ backgroundImage: artFallback(k), ...style }}
    >
      <div aria-hidden="true" className="art-surface__img" style={url ? { backgroundImage: `url(${url})` } : undefined} />
      {children}
    </div>
  );
}
