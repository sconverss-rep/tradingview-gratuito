"use client";

import { Watchlist } from "@/components/watchlist/Watchlist";

export function RightSidebar() {
  return (
    <aside className="flex w-64 flex-col border-l border-tv-border bg-tv-panel">
      <Watchlist />
    </aside>
  );
}
