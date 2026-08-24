"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { searchYahooSymbols } from "@/lib/providers/yahoo";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const market = useChartStore((s) => s.market);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);
  const [yahooResults, setYahooResults] = useState<SymbolInfo[]>([]);
  const [searching, setSearching] = useState(false);

  // Load Binance symbols for crypto market
  useEffect(() => {
    if (open && market === "crypto" && allSymbols.length === 0) {
      fetchExchangeSymbols().then(setAllSymbols).catch(console.error);
    }
  }, [open, market, allSymbols.length]);

  // Debounced Yahoo search for stocks
  const searchStocks = useCallback(
    async (q: string) => {
      if (market === "crypto" || q.trim().length < 1) {
        setYahooResults([]);
        return;
      }
      setSearching(true);
      try {
        const results = await searchYahooSymbols(
          q,
          market === "bvc" ? "bvc" : "usa",
        );
        setYahooResults(results);
      } catch {
        setYahooResults([]);
      }
      setSearching(false);
    },
    [market],
  );

  useEffect(() => {
    if (market === "crypto") return;
    const timer = setTimeout(() => searchStocks(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchStocks, market]);

  const filtered = useMemo(() => {
    if (market !== "crypto") return yahooResults;
    const q = query.trim().toUpperCase();
    if (!q) return allSymbols.slice(0, 100);
    return allSymbols
      .filter(
        (s) =>
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q),
      )
      .slice(0, 100);
  }, [query, allSymbols, yahooResults, market]);

  const placeholder =
    market === "crypto"
      ? "BTC, ETH, SOL…"
      : market === "usa"
        ? "AAPL, TSLA, NVDA…"
        : "Ecopetrol, Bancolombia…";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Buscar símbolo —{" "}
            {market === "crypto" ? "Crypto" : market === "usa" ? "USA" : "BVC"}
          </DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {searching && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Buscando…
              </div>
            )}
            {!searching && filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                {market !== "crypto" && query.trim().length === 0
                  ? "Escribe para buscar"
                  : "Sin resultados"}
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.symbol}
                onClick={() => {
                  setSymbol(s.symbol);
                  addToWatchlist(s.symbol);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.symbol === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-tv-text">
                    {market === "crypto" ? s.baseAsset : s.symbol}
                  </span>
                  <span className="max-w-[200px] truncate text-tv-text-muted">
                    {market === "crypto"
                      ? `/ ${s.quoteAsset}`
                      : s.baseAsset}
                  </span>
                </div>
                <span className="text-tv-text-muted">
                  {market === "crypto" ? s.symbol : s.quoteAsset}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
