import { Fragment, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from "react";

/* ------------------------------------------------------------------ icons */

export type LandingIcon =
  | "spark" | "twin" | "chat" | "persona" | "memory" | "image" | "agents" | "pen"
  | "down" | "right" | "dr" | "ur" | "send" | "check" | "lock" | "chev"
  | "folder" | "flask" | "doc" | "key" | "eye" | "compass";

const ICON_PREFIX = "lpi-";

export function Icon({ name, className, hidden = true }: { name: LandingIcon; className?: string; hidden?: boolean }) {
  return (
    <svg aria-hidden={hidden ? "true" : undefined} className={className} focusable="false">
      <use href={`#${ICON_PREFIX}${name}`} />
    </svg>
  );
}

const SPARK = "M32 13c1.8 10.5 7.5 16.2 18 18-10.5 1.8-16.2 7.5-18 18-1.8-10.5-7.5-16.2-18-18 10.5-1.8 16.2-7.5 18-18Z";
const SPARK_SMALL = "M50 41c.6 3.5 2.5 5.4 6 6-3.5.6-5.4 2.5-6 6-.6-3.5-2.5-5.4-6-6 3.5-.6 5.4-2.5 6-6Z";

/** Icon symbols and the two SVG filters used across the page. Rendered once. */
export function IconSprite() {
  return (
    <svg aria-hidden="true" className="sprite" focusable="false">
      <defs>
        <filter height="160%" id="lp-soft" width="160%" x="-30%" y="-30%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter colorInterpolationFilters="sRGB" height="260%" id="lp-goo" width="140%" x="-20%" y="-80%">
          <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="3.6" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -14" />
        </filter>
        <symbol id="lpi-spark" viewBox="13 12 38 38"><path d={SPARK} fill="currentColor" stroke="none" /></symbol>
        <symbol id="lpi-twin" viewBox="12 11 46 44"><path d={SPARK} fill="currentColor" stroke="none" /><path d={SPARK_SMALL} fill="currentColor" stroke="none" /></symbol>
        <symbol id="lpi-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H10l-6 4z" /></symbol>
        <symbol id="lpi-persona" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.6-3.8 4.5-5.8 8-5.8s6.4 2 8 5.8" /></symbol>
        <symbol id="lpi-memory" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.2L6 21z" /></symbol>
        <symbol id="lpi-image" viewBox="0 0 24 24"><rect height="16" rx="2" width="18" x="3" y="4" /><circle cx="9" cy="10" r="2" /><path d="m3 18 6-6 5 5 3-3 4 4" /></symbol>
        <symbol id="lpi-agents" viewBox="0 0 24 24"><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2.6" /><path d="M7 6.8 16.5 11M7 17.2l9.5-4.2" /></symbol>
        <symbol id="lpi-pen" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></symbol>
        <symbol id="lpi-down" viewBox="0 0 24 24"><path d="M12 4v16M6 14l6 6 6-6" /></symbol>
        <symbol id="lpi-right" viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6" /></symbol>
        <symbol id="lpi-dr" viewBox="0 0 24 24"><path d="M6 6l12 12M8 18h10V8" /></symbol>
        <symbol id="lpi-ur" viewBox="0 0 24 24"><path d="M6 18 18 6M8 6h10v10" /></symbol>
        <symbol id="lpi-chev" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></symbol>
        <symbol id="lpi-send" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></symbol>
        <symbol id="lpi-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></symbol>
        <symbol id="lpi-lock" viewBox="0 0 24 24"><rect height="10" rx="2" width="14" x="5" y="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></symbol>
        <symbol id="lpi-folder" viewBox="0 0 24 24"><path d="M3 6.5h6.5l2 2.5H21v9.5H3z" /><path d="M3 11h18" /></symbol>
        <symbol id="lpi-flask" viewBox="0 0 24 24"><path d="M9.5 3h5M10.5 3v6L5 19.5h14L13.5 9V3" /><path d="M7.4 15h9.2" /></symbol>
        <symbol id="lpi-doc" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></symbol>
        <symbol id="lpi-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2" /></symbol>
        <symbol id="lpi-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="lpi-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></symbol>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------- motion helpers */

/** Generated content collapses a plain space, so rolling copies of spaces use U+00A0. */
const NBSP = String.fromCharCode(0xa0);

type Vars = CSSProperties & Record<`--${string}`, string | number>;
export const vars = (v: Record<`--${string}`, string | number>) => v as Vars;

/**
 * Text whose characters roll up one by one when the surrounding link/button is hovered.
 * The label is a single real text node (selection, copy, translation and screen readers
 * all see it once); the rolling glyphs are CSS-generated from data-c in an aria-hidden
 * layer that is only shown while the control is hovered or focused.
 */
export function Roll({ text, className }: { text: string; className?: string }) {
  const chars = Array.from(text);
  return (
    <span className={className}>
      <span className="roll-t" style={vars({ "--n": chars.length })}>
        <span className="roll-t__txt">{text}</span>
        <span aria-hidden="true" className="roll-t__fx">
          {chars.map((ch, i) => (
            <span className="roll-t__c" data-c={ch === " " ? NBSP : ch} key={i} style={vars({ "--i": i })} />
          ))}
        </span>
      </span>
    </span>
  );
}

/** Icon that leaves on one side and returns from the other on hover. */
export function Loop({ name, dir, className }: { name: LandingIcon; dir: "right" | "up" | "down" | "dr" | "ur"; className?: string }) {
  return (
    <i aria-hidden="true" className={`loop loop--${dir}`}>
      <Icon className={className} name={name} />
      <Icon className={className} name={name} />
    </i>
  );
}

/**
 * Copy that lights up character by character with scroll. It stays plain text (one text
 * node per line, no per-character elements); the runtime paints the unread part through
 * CSS Custom Highlights, so the DOM, copy, translation and screen readers are unaffected.
 */
export function Chars({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/** Static artwork / avatar image. */
export function Img(props: ImgHTMLAttributes<HTMLImageElement>) {
  // Small static SVG avatars from /public; native loading keeps them crisp at any size without the image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" decoding="async" {...props} />;
}

export const avatar = (n: number) => `/personas/avatar-${n}.svg`;

/* ---------------------------------------------------------- leaf shadows */

interface Stem { a: [number, number]; c: [number, number]; b: [number, number]; n: number }
const STEMS: Stem[] = [
  { a: [1020, -30], c: [760, 120], b: [520, 430], n: 10 },
  { a: [1020, 140], c: [840, 360], b: [640, 660], n: 8 },
  { a: [900, -20], c: [700, 40], b: [430, 140], n: 7 },
];

/** Soft, blurred branch silhouettes that sway behind a section. */
export function Leaves({ low = false }: { low?: boolean }) {
  const shapes: ReactNode[] = [];
  STEMS.forEach((s, si) => {
    shapes.push(<path d={`M${s.a[0]} ${s.a[1]}Q${s.c[0]} ${s.c[1]} ${s.b[0]} ${s.b[1]}`} fill="none" key={`s${si}`} strokeWidth="5" />);
    for (let i = 1; i <= s.n; i++) {
      const t = i / (s.n + 1);
      const mt = 1 - t;
      const px = mt * mt * s.a[0] + 2 * mt * t * s.c[0] + t * t * s.b[0];
      const py = mt * mt * s.a[1] + 2 * mt * t * s.c[1] + t * t * s.b[1];
      const tx = 2 * mt * (s.c[0] - s.a[0]) + 2 * t * (s.b[0] - s.c[0]);
      const ty = 2 * mt * (s.c[1] - s.a[1]) + 2 * t * (s.b[1] - s.c[1]);
      const ang = (Math.atan2(ty, tx) * 180) / Math.PI;
      const side = i % 2 ? 1 : -1;
      const rx = 64 - t * 18;
      shapes.push(
        <ellipse
          key={`l${si}-${i}`}
          rx={rx.toFixed(1)}
          ry={(rx * 0.36).toFixed(1)}
          stroke="none"
          transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${(ang + side * 52).toFixed(1)}) translate(${(rx * 0.9).toFixed(1)} 0)`}
        />,
      );
    }
  });
  return (
    <div aria-hidden="true" className={low ? "leaves leaves--low" : "leaves"}>
      <svg className="leaves__svg" viewBox="0 0 1000 700">
        <g fill="currentColor" filter="url(#lp-soft)" stroke="currentColor">{shapes}</g>
      </svg>
    </div>
  );
}
