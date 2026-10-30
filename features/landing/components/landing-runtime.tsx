"use client";

import Lenis from "lenis";
import { useEffect, useRef } from "react";

import { artFallback, isArtKey, renderArt, type ArtKey } from "@/features/landing/art";
import { LANG_COOKIE, type LandingLang } from "@/features/landing/content";

interface RuntimeProps {
  lang: LandingLang;
  bubbles: string[];
  chips: [string, string][];
}

/** Drives every scroll / pointer animation on the landing page. Renders nothing visible. */
export function LandingRuntime(props: RuntimeProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>("[data-landing]");
    if (!root) return;
    return startLanding(root, propsRef.current);
  }, []);

  return <span hidden ref={anchor} />;
}

/* ====================================================================== */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const ZMIN = -2800;
const ZMAX = 560;
const HOLD = 0.3;
const STEP = 1.3;
const AVATAR_BG = ["#dce5d6", "#f3d5c5", "#e4e0da", "#e2dff0", "#efe4cc", "#d8e4e8"];
const HERO_ART: ArtKey[] = ["chat", "persona", "memory", "image", "agents", "stone", "dawn", "moss"];

interface HeroCard { el: HTMLDivElement; x: number; y: number; z: number }
interface Goo { host: HTMLElement; items: HTMLElement[]; rects: SVGRectElement[]; radii: number[]; until: number }
interface Magnet { el: HTMLElement; s: number; x: number; y: number; tx: number; ty: number }
interface CharHost { host: HTMLElement; chars: { el: HTMLElement; v: number }[]; min: number; top: number; h: number }
type Themed = HTMLElement & { _top?: number; _h?: number };

function startLanding(root: HTMLElement, { lang, bubbles, chips }: RuntimeProps): () => void {
  const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = root) => el.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = root) => Array.from(el.querySelectorAll<T>(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const cleanups: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(target: Window | Document | HTMLElement, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn as EventListener, opts);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const S = { vw: innerWidth, vh: innerHeight, y: 0, lastY: 0, vel: 0, mx: 0, my: 0, tmx: 0, tmy: 0, boost: 0 };
  const setVh = () => root.style.setProperty("--vh", `${innerHeight * 0.01}px`);
  setVh();

  /* -------------------------------------------------------------- hero */
  const cam = $("[data-cam]");
  const heroCenter = $("[data-hero-center]");
  const heroShade = $("[data-hero-shade]");

  const place = (it: HeroCard, initial: boolean) => {
    let x = 0;
    let y = 0;
    for (let n = 0; n < 14; n++) {
      x = rand(-1, 1) * S.vw * 0.62;
      y = rand(-1, 1) * S.vh * 0.58;
      if (!(Math.abs(x) < S.vw * 0.27 && Math.abs(y) < S.vh * 0.17)) break; // keep the headline clear
    }
    it.x = x;
    it.y = y;
    it.z = initial ? rand(ZMIN, ZMAX - 220) : ZMIN - rand(0, 300);
  };

  const hero: HeroCard[] = [];
  if (cam) {
    const small = S.vw < 700;
    const defs: { t: "avatar" | "art" | "bubble" | "chip"; i: number }[] = [];
    const add = (t: (typeof defs)[number]["t"], n: number) => { for (let i = 0; i < n; i++) defs.push({ t, i }); };
    add("avatar", small ? 7 : 12);
    add("art", small ? 8 : 14);
    add("bubble", small ? 3 : 6);
    add("chip", small ? 3 : 6);
    for (let i = defs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [defs[i], defs[j]] = [defs[j], defs[i]];
    }
    for (const d of defs) {
      const el = document.createElement("div");
      el.className = `hcard hcard--${d.t}`;
      const inner = document.createElement("div");
      inner.className = "hcard__in";
      if (d.t === "avatar") {
        inner.style.setProperty("--s", `${rand(64, 104) | 0}px`);
        inner.style.setProperty("--bg", AVATAR_BG[d.i % AVATAR_BG.length]);
        const img = new Image();
        img.alt = "";
        img.decoding = "async";
        img.src = `/personas/avatar-${(d.i % 12) + 1}.svg`;
        inner.appendChild(img);
      } else if (d.t === "art") {
        const tall = Math.random() > 0.4;
        const w = tall ? rand(84, 128) : rand(120, 172);
        const h = tall ? w * rand(1.2, 1.4) : w * rand(0.62, 0.78);
        inner.style.setProperty("--w", `${w | 0}px`);
        inner.style.setProperty("--h", `${h | 0}px`);
        inner.style.setProperty("--bp", `${rand(0, 100) | 0}% ${rand(0, 100) | 0}%`);
        inner.classList.add("art");
        inner.dataset.art = HERO_ART[d.i % HERO_ART.length];
      } else if (d.t === "bubble") {
        inner.textContent = bubbles[d.i % bubbles.length];
      } else {
        const [k, v] = chips[d.i % chips.length];
        const dot = document.createElement("i");
        const key = document.createElement("b");
        key.textContent = k;
        const val = document.createElement("span");
        val.textContent = v;
        inner.append(dot, key, val);
      }
      el.appendChild(inner);
      cam.appendChild(el);
      const it: HeroCard = { el, x: 0, y: 0, z: 0 };
      place(it, true);
      hero.push(it);
    }
    cleanups.push(() => hero.forEach((it) => it.el.remove()));
  }

  const updateHero = (dt: number) => {
    if (!cam || !heroCenter || !heroShade || S.y > S.vh * 1.05) return;
    S.mx = lerp(S.mx, S.tmx, 0.05);
    S.my = lerp(S.my, S.tmy, 0.05);
    S.boost *= Math.exp(-dt * 1.8);
    const p = clamp(S.y / S.vh, 0, 1);
    const speed = reduce ? 0 : 60 + S.boost + Math.min(Math.abs(S.vel) * 0.8, 1600);
    cam.style.transform = `rotateX(${(-S.my * 4).toFixed(2)}deg) rotateY(${(S.mx * 6).toFixed(2)}deg)`;
    for (const it of hero) {
      it.z += speed * dt;
      if (it.z > ZMAX) place(it, false);
      const o = smooth(ZMIN, ZMIN + 1000, it.z) * (1 - smooth(ZMAX - 280, ZMAX, it.z));
      it.el.style.transform = `translate3d(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px,${it.z.toFixed(1)}px)`;
      it.el.style.opacity = o.toFixed(3);
    }
    heroCenter.style.transform = `translate3d(0,${(-p * 14).toFixed(2)}vh,0) scale(${(1 - p * 0.08).toFixed(4)})`;
    heroShade.style.opacity = (p * 0.55).toFixed(3);
  };

  /* ----------------------------------------------------------- artwork */
  let disposed = false;
  const artUrls: string[] = [];
  const artPromise = (async () => {
    const els = $$("[data-art]").filter((el) => isArtKey(el.dataset.art));
    els.forEach((el) => { el.style.backgroundImage = artFallback(el.dataset.art as ArtKey); });
    const keys = Array.from(new Set(els.map((el) => el.dataset.art as ArtKey)));
    const urls = await renderArt(keys, 1600, 1000);
    Object.values(urls).forEach((u) => u && artUrls.push(u));
    if (disposed) return;
    els.forEach((el) => {
      const url = urls[el.dataset.art as ArtKey];
      if (url) el.style.backgroundImage = `url("${url}")`;
    });
  })().catch(() => undefined);
  cleanups.push(() => artUrls.forEach((u) => URL.revokeObjectURL(u)));

  /* -------------------------------------------------------- goo shapes */
  const goos: Goo[] = $$("[data-goo]").map((host) => {
    const G: Goo = { host, items: $$("[data-goo-item]", host), rects: $$<SVGRectElement>(".goo rect", host), radii: [], until: 0 };
    const kick = () => { G.until = performance.now() + 1100; };
    ["pointerenter", "pointerleave", "focusin", "focusout"].forEach((ev) => on(host, ev, kick));
    return G;
  });
  const drawGoo = (G: Goo) => {
    const hb = G.host.getBoundingClientRect();
    if (!hb.width) return;
    if (!G.radii.length) G.radii = G.items.map((it) => parseFloat(getComputedStyle(it).borderTopLeftRadius) || 0);
    G.items.forEach((it, i) => {
      const r = G.rects[i];
      if (!r) return;
      const b = it.getBoundingClientRect();
      r.setAttribute("x", (b.left - hb.left).toFixed(2));
      r.setAttribute("y", (b.top - hb.top).toFixed(2));
      r.setAttribute("width", b.width.toFixed(2));
      r.setAttribute("height", b.height.toFixed(2));
      r.setAttribute("rx", Math.min(G.radii[i], b.height / 2).toFixed(2));
    });
  };
  const drawAllGoo = () => goos.forEach(drawGoo);

  /* ----------------------------------------------------------- magnets */
  const mags: Magnet[] = finePointer && !reduce
    ? $$("[data-magnetic]").map((el) => ({ el, s: parseFloat(el.dataset.magnetic ?? "") || 0.3, x: 0, y: 0, tx: 0, ty: 0 }))
    : [];
  const aimMagnets = (cx: number, cy: number) => {
    for (const m of mags) {
      const r = m.el.getBoundingClientRect();
      if (!r.width) continue;
      const dx = cx - (r.left + r.width / 2 - m.x);
      const dy = cy - (r.top + r.height / 2 - m.y);
      const near = Math.abs(dx) < r.width / 2 + 28 && Math.abs(dy) < r.height / 2 + 28;
      m.tx = near ? dx * m.s : 0;
      m.ty = near ? dy * m.s : 0;
    }
  };
  const releaseMagnets = () => mags.forEach((m) => { m.tx = 0; m.ty = 0; });
  const updateMagnets = () => {
    for (const m of mags) {
      const nx = lerp(m.x, m.tx, 0.14);
      const ny = lerp(m.y, m.ty, 0.14);
      if (Math.abs(nx - m.x) < 0.01 && Math.abs(ny - m.y) < 0.01) continue;
      m.x = nx;
      m.y = ny;
      m.el.style.translate = `${nx.toFixed(2)}px ${ny.toFixed(2)}px`;
    }
  };

  /* ---------------------------------------------------------- chapters */
  const chapEl = $("[data-chapters]");
  const chapItems = $$("[data-chapter]");
  const chapBgs = chapItems.map((c) => $("[data-chapter-bg]", c));
  const chap = { top: 0, height: 0, active: -2 };
  const rollTrack = $("[data-roll-track]");
  const rollItem = rollTrack?.firstElementChild as HTMLElement | null;
  const bar = $("[data-chapters-bar]");

  const updateChapters = () => {
    if (!chapEl) return;
    const vh = S.vh;
    const local = S.y - chap.top;
    const n = chapItems.length;
    const ps = chapItems.map((_, i) => (i === 0 ? 1 : clamp((local - HOLD * vh - (i - 1) * STEP * vh) / vh, 0, 1)));

    let active = local < -0.5 * vh ? -1 : 0;
    for (let i = 1; i < n; i++) if (ps[i] > 0.5) active = i;
    if (active !== chap.active) {
      chap.active = active;
      chapItems.forEach((c, i) => c.classList.toggle("is-active", i === active));
    }

    if (local < -vh || local > chap.height) return;
    let f = 0;
    chapItems.forEach((c, i) => {
      const p = ps[i];
      const next = i + 1 < n ? ps[i + 1] : 0;
      if (i > 0) {
        c.style.clipPath = `inset(${((1 - p) * 100).toFixed(3)}% 0 0 0)`;
        f += p;
      }
      let y = (i > 0 ? (1 - p) * 16 : 0) - next * 8;
      if (i === 0 && local < 0) y += (local / vh) * 10;
      const bg = chapBgs[i];
      if (bg) bg.style.transform = `translate3d(0,${y.toFixed(3)}vh,0)`;
    });
    if (rollTrack && rollItem) rollTrack.style.transform = `translate3d(0,${(-f * rollItem.offsetHeight).toFixed(2)}px,0)`;
    if (bar) bar.style.transform = `scaleX(${(n > 1 ? f / (n - 1) : 1).toFixed(4)})`;
  };

  /* --------------------------------------------- characters light up */
  const charHosts: CharHost[] = $$("[data-chars]").map((host) => ({
    host,
    chars: $$(".ch", host).map((el) => ({ el, v: -1 })),
    min: parseFloat(getComputedStyle(host).getPropertyValue("--ch-min")) || 0.16,
    top: 0,
    h: 0,
  }));
  const updateChars = () => {
    for (const c of charHosts) {
      const top = c.top - S.y;
      if (top > S.vh || top + c.h < 0) continue;
      const prog = clamp((S.vh * 0.85 - top) / (S.vh * 0.25 + c.h), 0, 1);
      const total = c.chars.length + 10;
      c.chars.forEach((ch, k) => {
        const o = c.min + (1 - c.min) * clamp(prog * total - k, 0, 1);
        if (Math.abs(o - ch.v) > 0.01) {
          ch.v = o;
          ch.el.style.opacity = o.toFixed(3);
        }
      });
    }
  };

  /* --------------------------------------------------------- parallax */
  const parallax = $$("[data-parallax]").map((el) => ({ el, frame: el.parentElement as HTMLElement, top: 0, h: 0 }));
  const updateParallax = () => {
    for (const p of parallax) {
      const center = p.top + p.h / 2 - S.y - S.vh / 2;
      if (Math.abs(center) > S.vh * 1.2) continue;
      p.el.style.transform = `translate3d(0,${(-center * 0.12).toFixed(2)}px,0)`;
    }
  };

  /* ----------- stars spin while scrolling and settle upright afterwards */
  const brandMark = $<SVGElement>(".brand__mark");
  const fabMark = $<SVGElement>(".fab__mark");
  const footerMark = $<SVGElement>(".footer__mark svg");
  const footerEl = $("footer");
  const footerBox = { top: 0, h: 1 };
  let spin = 0;
  const updateMarks = (dt: number) => {
    if (!reduce) {
      const v = S.vel * 0.06;
      if (Math.abs(v) > 6) spin += v * dt;
      else spin = lerp(spin, Math.round(spin / 90) * 90, 0.08);
    }
    const turn = `${spin.toFixed(2)}deg`;
    if (brandMark) brandMark.style.rotate = turn;
    if (fabMark) fabMark.style.rotate = turn;
    if (footerMark) {
      const p = clamp((S.y + S.vh - footerBox.top) / footerBox.h, 0, 1);
      if (p > 0) footerMark.style.transform = `rotate(${((1 - p) * -30).toFixed(2)}deg) scale(${(0.86 + p * 0.14).toFixed(4)})`;
    }
  };

  /* ------------------------------ header / fab follow the section tone */
  const header = $("[data-header]");
  const fab = $(".fab");
  const themed = $$<Themed>("[data-theme]");
  const toneAt = (y: number) => {
    let tone = "light";
    for (const el of themed) if (y >= (el._top ?? 0) && y < (el._top ?? 0) + (el._h ?? 0)) tone = el.dataset.theme ?? "light";
    return tone;
  };
  const updateTone = () => {
    const top = toneAt(S.y + 40) === "dark" ? "dark" : "light";
    if (header && header.dataset.tone !== top) header.dataset.tone = top;
    const bottom = toneAt(S.y + S.vh - 40);
    if (fab && fab.dataset.tone !== bottom) fab.dataset.tone = bottom;
  };

  /* ---------------------------------------------------------- measure */
  const measure = () => {
    S.vw = innerWidth;
    S.vh = innerHeight;
    const y = window.scrollY;
    const topOf = (el: Element) => el.getBoundingClientRect().top + y;
    themed.forEach((el) => { el._top = topOf(el); el._h = el.offsetHeight; });
    if (chapEl) { chap.top = topOf(chapEl); chap.height = chapEl.offsetHeight; }
    charHosts.forEach((c) => { c.top = topOf(c.host); c.h = c.host.offsetHeight; });
    parallax.forEach((p) => { p.top = topOf(p.frame); p.h = p.frame.offsetHeight; });
    if (footerEl) { footerBox.top = topOf(footerEl); footerBox.h = footerEl.offsetHeight || 1; }
    drawAllGoo();
  };

  /* ----------------------------------------------------- smooth scroll */
  let lenis: Lenis | null = null;
  if (!reduce) {
    try {
      lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
      lenis.stop();
    } catch {
      lenis = null;
    }
  }
  cleanups.push(() => lenis?.destroy());

  /* ---------------------------------------------------------- reveals */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
  $$("[data-reveal], .footer__art").forEach((el) => io.observe(el));

  // Masked media and hairlines report as hidden to the observer, so watch their parent instead.
  const byParent = new Map<Element, HTMLElement[]>();
  $$("[data-media], [data-rule]").forEach((el) => {
    const p = el.parentElement;
    if (!p) return;
    byParent.set(p, [...(byParent.get(p) ?? []), el]);
  });
  const pio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      byParent.get(e.target)?.forEach((el) => el.classList.add("is-in"));
      pio.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
  byParent.forEach((_, p) => pio.observe(p));
  cleanups.push(() => { io.disconnect(); pio.disconnect(); });

  // Fast jumps can skip an element entirely; reveal anything already above the fold.
  const sweep = window.setInterval(() => {
    $$("[data-reveal]:not(.is-in), .footer__art:not(.is-in)").forEach((el) => {
      if (el.getBoundingClientRect().bottom < 0) { el.classList.add("is-in"); io.unobserve(el); }
    });
    byParent.forEach((list, p) => {
      if (!list[0].classList.contains("is-in") && p.getBoundingClientRect().bottom < 0) {
        list.forEach((el) => el.classList.add("is-in"));
        pio.unobserve(p);
      }
    });
  }, 400);
  cleanups.push(() => window.clearInterval(sweep));

  /* -------------------------------------------------------------- menu */
  const menu = $("[data-menu]");
  const menuBtn = $("[data-menu-btn]");
  const setMenu = (open: boolean) => {
    if (!menu || !menuBtn || menu.classList.contains("is-open") === open) return;
    menu.classList.toggle("is-open", open);
    menu.inert = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", (open ? menuBtn.dataset.labelClose : menuBtn.dataset.labelOpen) ?? "");
    root.classList.toggle("menu-open", open);
    if (open) lenis?.stop();
    else lenis?.start();
    later(drawAllGoo, 50);
  };
  if (menuBtn && menu) on(menuBtn, "click", () => setMenu(!menu.classList.contains("is-open")));

  /* ------------------------------------------------- language switcher */
  const langBox = $("[data-lang]");
  const langBtn = $("[data-lang-btn]");
  const setLangMenu = (open: boolean) => {
    if (!langBox || !langBtn) return;
    langBox.classList.toggle("is-open", open);
    langBtn.setAttribute("aria-expanded", String(open));
  };
  if (langBtn && langBox) {
    on(langBtn, "click", (e: MouseEvent) => {
      e.stopPropagation();
      setLangMenu(!langBox.classList.contains("is-open"));
    });
  }
  on(document, "click", (e: MouseEvent) => {
    if (langBox && !langBox.contains(e.target as Node)) setLangMenu(false);
  });
  $$<HTMLButtonElement>("[data-set-lang]").forEach((b) => on(b, "click", () => {
    const code = b.dataset.setLang;
    setLangMenu(false);
    if (!code || code === lang) return;
    document.cookie = `${LANG_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    root.classList.add("is-leaving");
    later(() => window.location.assign(url.toString()), reduce ? 0 : 750);
  }));

  on(document, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") { setMenu(false); setLangMenu(false); }
  });

  // The brand link on the landing page itself scrolls back to the top.
  on(root, "click", (e: MouseEvent) => {
    const a = (e.target as Element).closest?.("a[href]");
    if (!a) return;
    setMenu(false);
    if (a.getAttribute("href") === "/" && window.location.pathname === "/") {
      e.preventDefault();
      if (lenis) lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  /* ----------------------------------------------------------- pointer */
  on(document, "pointermove", (e: PointerEvent) => {
    S.tmx = (e.clientX / S.vw - 0.5) * 2;
    S.tmy = (e.clientY / S.vh - 0.5) * 2;
    const pill = (e.target as Element).closest?.<HTMLElement>(".pill");
    if (pill && root.contains(pill)) {
      const r = pill.getBoundingClientRect();
      pill.style.setProperty("--gx", `${(e.clientX - r.left).toFixed(1)}px`);
      pill.style.setProperty("--gy", `${(e.clientY - r.top).toFixed(1)}px`);
    }
    if (mags.length) aimMagnets(e.clientX, e.clientY);
  }, { passive: true });
  on(window, "wheel", releaseMagnets, { passive: true });
  on(document, "pointerleave", releaseMagnets);

  let resizeTimer = 0;
  let lastW = innerWidth;
  on(window, "resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // mobile URL bars change the height constantly; only re-pin when the width changes there
      if (innerWidth !== lastW || !matchMedia("(hover: none)").matches) setVh();
      lastW = innerWidth;
      measure();
    }, 120);
  });
  cleanups.push(() => window.clearTimeout(resizeTimer));

  /* --------------------------------------------------------- main loop */
  let raf = 0;
  let last = performance.now();
  const frame = (t: number) => {
    const dt = clamp((t - last) / 1000, 0.001, 0.05);
    last = t;
    lenis?.raf(t);
    S.y = window.scrollY;
    S.vel = lerp(S.vel, (S.y - S.lastY) / dt, 0.2);
    S.lastY = S.y;
    for (const G of goos) if (t < G.until) drawGoo(G); // reads first, then writes
    updateHero(dt);
    updateChapters();
    updateChars();
    updateParallax();
    updateMarks(dt);
    updateMagnets();
    updateTone();
    raf = requestAnimationFrame(frame);
  };

  /* --------------------------------------------------------- preloader */
  const pre = $("[data-preloader]");
  const odo = $("[data-odo]");
  const odoT = $("[data-odo-col='t']");
  const odoO = $("[data-odo-col='o']");
  const setOdo = (v: number) => {
    const full = v >= 100;
    odo?.classList.toggle("is-full", full);
    if (odoT) odoT.style.transform = `translate3d(0,${-(full ? 0 : Math.floor(v / 10))}em,0)`;
    if (odoO) odoO.style.transform = `translate3d(0,${-(full ? 0 : v % 10)}em,0)`;
  };
  const t0 = performance.now();
  const MIN = reduce ? 200 : 1600;
  let assetsReady = false;
  Promise.race([
    Promise.all([document.fonts?.ready, artPromise]),
    new Promise((r) => window.setTimeout(r, 4500)),
  ]).then(() => { assetsReady = true; });

  let shown = -1;
  let preRaf = 0;
  const finish = () => {
    setOdo(100);
    later(() => {
      root.classList.remove("is-loading");
      root.classList.add("is-loaded");
      S.boost = reduce ? 0 : 2200;
      lenis?.start();
      measure();
      later(() => { if (pre) pre.hidden = true; }, 1600);
    }, reduce ? 0 : 350);
  };
  const preFrame = (t: number) => {
    const k = clamp((t - t0) / MIN, 0, 1);
    const v = Math.round(Math.min(1 - Math.pow(1 - k, 3), assetsReady ? 1 : 0.86) * 100);
    if (v !== shown) { shown = v; setOdo(v); }
    if (k >= 1 && assetsReady) { finish(); return; }
    preRaf = requestAnimationFrame(preFrame);
  };

  measure();
  raf = requestAnimationFrame(frame);
  preRaf = requestAnimationFrame(preFrame);
  document.fonts?.ready.then(() => { if (!disposed) measure(); });
  on(window, "load", measure);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(preRaf);
    timers.forEach((id) => window.clearTimeout(id));
    cleanups.forEach((fn) => fn());
    root.classList.remove("is-loaded", "menu-open", "is-leaving");
    root.classList.add("is-loading");
    if (pre) pre.hidden = false;
  };
}
