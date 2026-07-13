export type DropdownPlacement =
  | "bottom-end"
  | "bottom-start"
  | "top-end"
  | "top-start";

export const DEFAULT_DROPDOWN_PLACEMENT: DropdownPlacement = "bottom-end";

export const dropdownPlacementClasses: Record<DropdownPlacement, string> = {
  "bottom-end": "top-full right-0 mt-2 origin-top-right",
  "bottom-start": "top-full left-0 mt-2 origin-top-left",
  "top-end": "bottom-full right-0 mb-2 origin-bottom-right",
  "top-start": "bottom-full left-0 mb-2 origin-bottom-left",
};
