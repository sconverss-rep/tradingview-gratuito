"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { fetchYahooQuotes } from "@/lib/providers/yahoo";
import { useChartStore } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

export function Watchlist() {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const market = useChartStore((s) => s.market);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});

  // Crypto: Binance tickers + WS
  useEffect(() => {
    if (market !== "crypto" || watchlist.length === 0) return;
    let cancelled = false;

    fetchTickers24h(watchlist)
      .then((tickers) => {
        if (cancelled) return;
        const map: Record<string, Row> = {};
        tickers.forEach((t) => {
          map[t.symbol] = {
            symbol: t.symbol,
            price: t.lastPrice,
            pct: t.priceChangePercent,
          };
        });
        setRows(map);
      })
      .catch(console.error);

    const ws = getBinanceWS();
    const unsub = ws.subscribeMiniTickers(watchlist, (tick) => {
      setRows((prev) => {
        const prevRow = prev[tick.symbol];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "up" }));
            setTimeout(
              () => setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "down" }));
            setTimeout(
              () => setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          }
        }
        return {
          ...prev,
          [tick.symbol]: {
            symbol: tick.symbol,
            price: tick.close,
            pct: tick.pct,
          },
        };
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [watchlist, market]);

  // Stocks: Yahoo polling
  useEffect(() => {
    if (market === "crypto" || watchlist.length === 0) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const quotes = await fetchYahooQuotes(watchlist);
        if (cancelled) return;
        const map: Record<string, Row> = {};
        quotes.forEach((t) => {
          const prev = rows[t.symbol];
          if (prev) {
            if (t.lastPrice > prev.price) {
              setFlash((f) => ({ ...f, [t.symbol]: "up" }));
              setTimeout(
                () => setFlash((f) => ({ ...f, [t.symbol]: null })),
                300,
              );
            } else if (t.lastPrice < prev.price) {
              setFlash((f) => ({ ...f, [t.symbol]: "down" }));
              setTimeout(
                () => setFlash((f) => ({ ...f, [t.symbol]: null })),
                300,
              );
            }
          }
          map[t.symbol] = {
            symbol: t.symbol,
            price: t.lastPrice,
            pct: t.priceChangePercent,
          };
        });
        setRows((prev) => ({ ...prev, ...map }));
      } catch (e) {
        console.error("Yahoo watchlist poll failed:", e);
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist, market]);

  // Clear rows when market changes
  useEffect(() => {
    setRows({});
    setFlash({});
  }, [market]);

  const currencyLabel =
    market === "crypto" ? "USDT" : market === "bvc" ? "COP" : "USD";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Watchlist
        </h2>
        <button
          onClick={() => openSymbolDialog(true)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Agregar símbolo"
          aria-label="Agregar al watchlist"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span>Símbolo</span>
        <span className="text-right">Precio</span>
        <span className="text-right">24h</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {watchlist.map((s) => {
            const row = rows[s];
            const isActive = s === symbol;
            const f = flash[s];
            return (
              <div
                key={s}
                onClick={() => setSymbol(s)}
                className={cn(
                  "group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                  "hover:bg-tv-panel-hover",
                  isActive && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-tv-text">
                    {market === "crypto" ? s.replace("USDT", "") : s}
                  </span>
                  <span className="text-[10px] text-tv-text-dim">
                    {currencyLabel}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-right tabular-nums transition-colors",
                    f === "up" && "text-tv-green",
                    f === "down" && "text-tv-red",
                    !f && "text-tv-text",
                  )}
                >
                  {row ? formatPrice(row.price) : "—"}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={cn(
                      "tabular-nums",
                      row
                        ? row.pct >= 0
                          ? "text-tv-green"
                          : "text-tv-red"
                        : "text-tv-text-muted",
                    )}
                  >
                    {row ? formatPct(row.pct) : "—"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(s);
                    }}
                    className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red group-hover:visible"
                    aria-label={`Quitar ${s} del watchlist`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {watchlist.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Tu watchlist está vacío
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
