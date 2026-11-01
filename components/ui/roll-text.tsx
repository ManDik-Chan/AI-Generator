import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Generated content collapses a plain space, so rolling copies of spaces use U+00A0. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Text whose characters roll up one after another when the surrounding link or
 * button is hovered (same micro-interaction as the public landing page).
 * The label is one real text node, so selection, copy, browser translation and
 * screen readers see it exactly once. The rolling glyphs are CSS-generated from
 * data-c in an aria-hidden layer that only shows while the control is hovered or focused.
 */
export function RollText({ text, className }: { text: string; className?: string }) {
  const chars = Array.from(text);
  return (
    <span className={cn("min-w-0", className)}>
      <span className="rt" style={{ "--n": chars.length } as CSSProperties}>
        <span className="rt__txt">{text}</span>
        <span aria-hidden="true" className="rt__fx">
          {chars.map((ch, i) => (
            <span className="rt__c" data-c={ch === " " ? NBSP : ch} key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </span>
      </span>
    </span>
  );
}
