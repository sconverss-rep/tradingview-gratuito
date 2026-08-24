"use client";

import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

export function TimeframeSelector() {
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  return (
    <div className="flex items-center gap-0.5 rounded bg-tv-bg p-0.5">
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          onClick={() => setTf(t)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium uppercase transition-colors",
            tf === t
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
