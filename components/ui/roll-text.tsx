import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Text whose characters roll up one after another when the surrounding link or
 * button is hovered (same micro-interaction as the public landing page).
 * Screen readers get the plain text once.
 */
export function RollText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("min-w-0", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="rt">
        {Array.from(text).map((ch, i) => {
          const glyph = ch === " " ? " " : ch;
          return (
            <span className="rt__c" key={i} style={{ "--i": i } as CSSProperties}>
              <span>{glyph}</span>
              <span>{glyph}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
