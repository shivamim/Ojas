"use client";

// Ojas — Command hint button. Shows ⌘K in the topbar. Clicking opens the
// command palette by dispatching the same keyboard shortcut.

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommandHint() {
  const triggerShortcut = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "k", metaKey: true, bubbles: true,
    }));
  };
  return (
    <Button
      variant="ghost"
      onClick={triggerShortcut}
      className="h-9 px-3 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4" />
      <span className="hidden lg:inline text-sm">Search…</span>
      <kbd className="hidden md:inline text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
    </Button>
  );
}
