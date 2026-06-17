"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Accordion({ title, children, defaultOpen = false, className = "" }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border border-zinc-800 rounded-lg overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 text-sm text-zinc-400">{children}</div>}
    </div>
  );
}
