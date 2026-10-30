"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { artFallback, renderArt, type ArtKey } from "@/features/landing/art";
import { cn } from "@/lib/utils";

/*
 * Procedural artwork for the platform, rendered by the same shader as the landing page.
 * Artwork is decoration, so it must never compete with input or navigation: each surface
 * asks for an image sized to its own box, and images render one at a time in idle periods.
 * A surface that unmounts before its turn costs nothing. Results are cached for the
 * session. Without WebGL (or with Save-Data) the CSS gradient stand-in remains.
 */

type Listener = (url: string) => void;
type Job = { key: ArtKey; width: number; listeners: Set<Listener> };

const MIN_WIDTH = 160;
const MAX_WIDTH = 1200;
const STEP = 160;

const cache = new Map<ArtKey, { width: number; url: string }>();
const jobs = new Map<string, Job>();
let pumping = false;
let unavailable = false;

function saveData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/** Pixel width a 3:2 image needs to cover this box (background-size: cover). */
function targetWidth(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const needed = Math.ceil((Math.max(rect.width, rect.height * 1.5) * dpr) / STEP) * STEP;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, needed || 640));
}

function whenIdle(run: () => void) {
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else window.setTimeout(run, 120);
}

function schedule() {
  if (pumping) return;
  pumping = true;
  whenIdle(pump);
}

async function pump() {
  const next = jobs.entries().next();
  if (next.done) {
    pumping = false;
    return;
  }
  const [id, job] = next.value;
  jobs.delete(id);

  let url: string | undefined;
  try {
    url = (await renderArt([job.key], job.width, Math.round((job.width * 2) / 3)))[job.key];
  } catch {
    url = undefined;
  }
  if (!url) {
    unavailable = true;
    jobs.clear();
    pumping = false;
    return;
  }

  const previous = cache.get(job.key);
  if (!previous || previous.width < job.width) cache.set(job.key, { width: job.width, url });
  job.listeners.forEach((listener) => listener(url));
  // Smaller requests for the same artwork are satisfied by this image.
  for (const [otherId, other] of jobs) {
    if (other.key !== job.key || other.width > job.width) continue;
    jobs.delete(otherId);
    other.listeners.forEach((listener) => listener(url));
  }
  whenIdle(pump);
}

function requestArt(key: ArtKey, width: number, listener: Listener) {
  const hit = cache.get(key);
  if (hit) listener(hit.url);
  if ((hit && hit.width >= width) || unavailable || saveData()) return () => undefined;

  const id = `${key}@${width}`;
  let job = jobs.get(id);
  if (!job) {
    job = { key, width, listeners: new Set() };
    jobs.set(id, job);
  }
  const current = job;
  current.listeners.add(listener);
  schedule();
  return () => {
    current.listeners.delete(listener);
    if (!current.listeners.size && jobs.get(id) === current) jobs.delete(id);
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
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return requestArt(k, targetWidth(element), setUrl);
  }, [k]);
  const decorative = !label && !children;
  return (
    <div
      aria-hidden={decorative || undefined}
      aria-label={label}
      className={cn("art-surface", zoom && "art-surface--zoom", className)}
      data-ready={url ? "true" : undefined}
      ref={ref}
      role={label ? "img" : undefined}
      style={{ backgroundImage: artFallback(k), ...style }}
    >
      <div aria-hidden="true" className="art-surface__img" style={url ? { backgroundImage: `url(${url})` } : undefined} />
      {children}
    </div>
  );
}
