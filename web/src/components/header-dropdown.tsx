"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function HeaderDropdown({ label, icon, variant, children }: {
  label: string;
  icon?: ReactNode;
  variant: "community" | "account";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div
    className={`header-dropdown header-dropdown--${variant}`}
    ref={root}
    data-open={open}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    }}
  >
    <button ref={trigger} className="header-dropdown-trigger" type="button" aria-expanded={open}
      aria-controls={id} onClick={() => setOpen(!open)}>
      {icon}{label}<ChevronDown size={13} aria-hidden="true" />
    </button>
    <div id={id} className="header-dropdown-panel" hidden={!open} onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
    }}>
      {children}
    </div>
  </div>;
}
