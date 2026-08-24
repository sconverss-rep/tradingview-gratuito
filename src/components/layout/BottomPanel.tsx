"use client";

import { useEffect, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { fetchTicker24h } from "@/lib/binance/rest";
import { fetchYahooQuote } from "@/lib/providers/yahoo";
import { MARKET_META } from "@/lib/providers/types";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const market = useChartStore((s) => s.market);
  const [t, setT] = useState<Ticker24h | null>(null);

  useEffect(() => {
    let cancelled = false;
    setT(null);
    const load = async () => {
      try {
        const ticker =
          market === "crypto"
            ? await fetchTicker24h(symbol)
            : await fetchYahooQuote(symbol);
        if (!cancelled) setT(ticker);
      } catch (e) {
        console.error("BottomPanel ticker error:", e);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, market]);

  const upClass = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");
  const meta = MARKET_META[market];

  return (
    <div className="flex h-9 items-center gap-0 border-t border-tv-border bg-tv-panel px-3 text-xs">
      <Stat label="Símbolo" value={symbol} />
      <Stat
        label="24h Cambio"
        value={t ? formatPct(t.priceChangePercent) : "—"}
        valueClass={t ? upClass(t.priceChangePercent) : ""}
      />
      <Stat
        label="24h Alto"
        value={t ? formatPrice(t.highPrice) : "—"}
        valueClass="text-tv-green"
      />
      <Stat
        label="24h Bajo"
        value={t ? formatPrice(t.lowPrice) : "—"}
        valueClass="text-tv-red"
      />
      <Stat
        label={`24h Vol${market === "crypto" ? " (base)" : ""}`}
        value={t ? formatVolume(t.volume) : "—"}
      />
      {market === "crypto" && (
        <Stat
          label="24h Vol (USDT)"
          value={t ? formatVolume(t.quoteVolume) : "—"}
        />
      )}
      <div className="ml-auto flex items-center gap-2 text-[10px] text-tv-text-dim">
        <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-green" />
        <span>
          {meta.exchange} · {market === "crypto" ? "Live" : "Polling"}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 border-r border-tv-border px-3">
      <span className="text-tv-text-dim">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}
