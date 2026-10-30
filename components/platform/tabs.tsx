"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/**
 * Accessible tabs whose selection is mirrored in the URL hash (#overview, #lab …) so a
 * section can be linked to. All panels are server-rendered; inactive ones are hidden.
 */
export function Tabs({ items, label, className, listClassName }: { items: TabItem[]; label: string; className?: string; listClassName?: string }) {
  const ids = items.map((item) => item.id).join("|");
  const [active, setActive] = useState(items[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ids.split("|").includes(hash)) setActive(hash);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [ids]);

  const select = (id: string, focus = false) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
    if (focus) refs.current[id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    select(items[next].id, true);
  };

  return (
    <div className={className}>
      <div aria-label={label} className={cn("scroll-x relative -mx-1 flex gap-1 border-b border-border/12 px-1", listClassName)} role="tablist">
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              aria-controls={`panel-${item.id}`}
              aria-selected={selected}
              className={cn(
                "relative flex h-12 shrink-0 items-center gap-1.5 px-3 text-[.8125rem] font-medium transition-colors duration-300",
                "after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:origin-left after:bg-foreground after:transition-transform after:duration-500 after:ease-out-expo",
                selected ? "text-foreground after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-foreground",
              )}
              id={`tab-${item.id}`}
              key={item.id}
              onClick={() => select(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              ref={(node) => { refs.current[item.id] = node; }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {item.label}
              {item.count !== undefined ? <span className="rounded-full bg-surface px-1.5 text-[.625rem] tabular-nums leading-4 text-muted-foreground">{item.count}</span> : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div aria-labelledby={`tab-${item.id}`} className="pt-8 focus-visible:outline-none" hidden={item.id !== active} id={`panel-${item.id}`} key={item.id} role="tabpanel" tabIndex={0}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
