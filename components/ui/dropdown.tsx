"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import {
  DEFAULT_DROPDOWN_PLACEMENT,
  type DropdownPlacement,
} from "@/components/ui/dropdown-placement";
import { resolveDropdownPosition, type DropdownPosition } from "@/components/ui/dropdown-position";
import { cn } from "@/lib/utils";

interface DropdownProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  trigger: ReactNode;
  children: ReactNode;
  placement?: DropdownPlacement;
}

const originClasses: Record<DropdownPlacement, string> = {
  "bottom-end": "origin-top-right",
  "bottom-start": "origin-top-left",
  "top-end": "origin-bottom-right",
  "top-start": "origin-bottom-left",
};

export function Dropdown({ trigger, children, className, placement = DEFAULT_DROPDOWN_PLACEMENT, ...props }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<DropdownPosition>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const resolvedPlacement = position?.placement ?? placement;
  const menuStyle: CSSProperties | undefined = position ? {
    position: position.position,
    left: position.left,
    top: position.top,
    width: position.width,
    maxWidth: position.maxWidth,
    maxHeight: position.maxHeight,
  } : undefined;

  const updatePosition = useCallback(() => {
    const triggerElement = triggerRef.current;
    const menuElement = menuRef.current;
    if (!triggerElement || !menuElement) return;
    const viewport = window.visualViewport;
    setPosition(resolveDropdownPosition({
      trigger: triggerElement.getBoundingClientRect(),
      menu: menuElement.getBoundingClientRect(),
      viewportWidth: viewport?.width ?? window.innerWidth,
      viewportHeight: viewport?.height ?? window.innerHeight,
      viewportLeft: viewport?.offsetLeft ?? 0,
      viewportTop: viewport?.offsetTop ?? 0,
      placement,
    }));
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) { setPosition(undefined); return; }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition, { passive: true });
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open, updatePosition]);

  const menu = open && typeof document !== "undefined" ? createPortal(
    <div
      className={cn(
        "fixed z-[70] min-w-48 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-1.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain break-words rounded-overlay border border-border/14 bg-surface-raised p-1.5 shadow-overlay transition-[opacity,transform] duration-fast motion-reduce:transform-none motion-reduce:transition-none",
        originClasses[resolvedPlacement],
        position ? "scale-100 opacity-100" : "pointer-events-none scale-[.98] opacity-0",
      )}
      id={menuId}
      onClick={(event) => {
        if ((event.target as Element).closest("a,button,[role='menuitem']")) setOpen(false);
      }}
      ref={menuRef}
      role="menu"
      style={menuStyle}
    >
      {children}
    </div>,
    document.body,
  ) : null;

  return (
    <div className={cn("relative", className)} {...props}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className="block w-full rounded-control text-left"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {trigger}
      </button>
      {menu}
    </div>
  );
}

export const Popover = Dropdown;

export function DropdownItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-control px-3 text-left text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        className,
      )}
      role="menuitem"
      type="button"
      {...props}
    />
  );
}
