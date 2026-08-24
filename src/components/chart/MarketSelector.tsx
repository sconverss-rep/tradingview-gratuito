"use client";

import { useChartStore } from "@/lib/store/chart-store";
import { MARKET_META, type Market } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

const MARKETS: Market[] = ["crypto", "usa", "bvc"];

export function MarketSelector() {
  const market = useChartStore((s) => s.market);
  const setMarket = useChartStore((s) => s.setMarket);

  return (
    <div className="flex items-center gap-0.5">
      {MARKETS.map((m) => (
        <button
          key={m}
          onClick={() => setMarket(m)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            m === market
              ? "bg-tv-blue/20 text-tv-blue"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {MARKET_META[m].label}
        </button>
      ))}
    </div>
  );
}
