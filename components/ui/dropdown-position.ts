import type { CSSProperties } from "react";

import type { DropdownPlacement } from "@/components/ui/dropdown-placement";

export const DROPDOWN_COLLISION_PADDING = 12;
export const DROPDOWN_TRIGGER_GAP = 8;

export interface DropdownPosition extends CSSProperties {
  placement: DropdownPlacement;
}

type Rect = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

export function resolveDropdownPosition({
  trigger,
  menu,
  viewportWidth,
  viewportHeight,
  viewportLeft = 0,
  viewportTop = 0,
  placement,
}: {
  trigger: Rect;
  menu: Rect;
  viewportWidth: number;
  viewportHeight: number;
  viewportLeft?: number;
  viewportTop?: number;
  placement: DropdownPlacement;
}): DropdownPosition {
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const startsTop = placement.startsWith("top");
  const alignsEnd = placement.endsWith("end");
  const spaceAbove = trigger.top - viewportTop - DROPDOWN_COLLISION_PADDING - DROPDOWN_TRIGGER_GAP;
  const spaceBelow = viewportBottom - trigger.bottom - DROPDOWN_COLLISION_PADDING - DROPDOWN_TRIGGER_GAP;
  const openTop = startsTop ? spaceAbove >= Math.min(menu.height, 160) || spaceAbove >= spaceBelow : spaceBelow < Math.min(menu.height, 160) && spaceAbove > spaceBelow;
  const resolvedPlacement = `${openTop ? "top" : "bottom"}-${alignsEnd ? "end" : "start"}` as DropdownPlacement;
  const maxWidth = Math.max(160, viewportWidth - DROPDOWN_COLLISION_PADDING * 2);
  const width = Math.min(Math.max(menu.width, Math.min(trigger.width, maxWidth)), maxWidth);
  const rawLeft = alignsEnd ? trigger.right - width : trigger.left;
  const left = Math.min(Math.max(rawLeft, viewportLeft + DROPDOWN_COLLISION_PADDING), viewportRight - DROPDOWN_COLLISION_PADDING - width);
  const availableHeight = Math.max(0, openTop ? spaceAbove : spaceBelow);
  const height = Math.min(menu.height, availableHeight);
  const top = openTop ? trigger.top - DROPDOWN_TRIGGER_GAP - height : trigger.bottom + DROPDOWN_TRIGGER_GAP;

  return {
    placement: resolvedPlacement,
    position: "fixed",
    left,
    top,
    width,
    maxWidth,
    maxHeight: availableHeight,
  };
}
