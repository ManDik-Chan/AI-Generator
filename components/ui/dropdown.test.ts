import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DROPDOWN_PLACEMENT,
  dropdownPlacementClasses,
} from "@/components/ui/dropdown-placement";
import { DROPDOWN_COLLISION_PADDING, resolveDropdownPosition } from "@/components/ui/dropdown-position";

describe("Dropdown placement", () => {
  it("defaults existing callers to bottom-end", () => {
    expect(DEFAULT_DROPDOWN_PLACEMENT).toBe("bottom-end");
    expect(readFileSync("components/ui/dropdown.tsx", "utf8")).toContain(
      "placement = DEFAULT_DROPDOWN_PLACEMENT",
    );
  });

  it("maps bottom-end to downward end alignment", () => {
    const classes = dropdownPlacementClasses["bottom-end"].split(" ");

    expect(classes).toEqual(
      expect.arrayContaining([
        "top-full",
        "right-0",
        "mt-2",
        "origin-top-right",
      ]),
    );
  });

  it("maps top-end upward without conflicting direction classes", () => {
    const classes = dropdownPlacementClasses["top-end"].split(" ");

    expect(classes).toEqual(
      expect.arrayContaining([
        "bottom-full",
        "right-0",
        "mb-2",
        "origin-bottom-right",
      ]),
    );
    expect(classes).not.toContain("top-full");
    expect(classes).not.toContain("mt-2");
  });

  it("keeps every placement free of conflicting axis and margin classes", () => {
    for (const classes of Object.values(dropdownPlacementClasses)) {
      const tokens = classes.split(" ");
      expect(tokens).not.toEqual(expect.arrayContaining(["top-full", "bottom-full"]));
      expect(tokens).not.toEqual(expect.arrayContaining(["left-0", "right-0"]));
      expect(tokens).not.toEqual(expect.arrayContaining(["mt-2", "mb-2"]));
    }
  });

  it("keeps the panel inside the viewport and scrolls long content", () => {
    const dropdown = readFileSync("components/ui/dropdown.tsx", "utf8");

    expect(dropdown).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(dropdown).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(dropdown).toContain("overflow-y-auto");
    expect(dropdown).toContain("overflow-x-hidden");
    expect(dropdown).toContain("z-[70]");
    expect(dropdown).toContain("createPortal");
    expect(DROPDOWN_COLLISION_PADDING).toBe(12);
  });

  it("flips upward and clamps end-aligned menus inside a narrow viewport", () => {
    const position = resolveDropdownPosition({
      trigger: { top: 700, right: 315, bottom: 744, left: 260, width: 55, height: 44 },
      menu: { top: 0, right: 220, bottom: 260, left: 0, width: 220, height: 260 },
      viewportWidth: 320,
      viewportHeight: 760,
      placement: "bottom-end",
    });

    expect(position.placement).toBe("top-end");
    expect(Number(position.left)).toBeGreaterThanOrEqual(12);
    expect(Number(position.top)).toBeGreaterThanOrEqual(12);
    expect(Number(position.maxWidth)).toBeLessThanOrEqual(296);
  });
});
