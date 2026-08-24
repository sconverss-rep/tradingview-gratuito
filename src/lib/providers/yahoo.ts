import type { Candle, Ticker24h, SymbolInfo, Timeframe } from "@/lib/binance/types";
import { YAHOO_INTERVAL_MAP, YAHOO_RANGE_MAP } from "./types";

// ---------- Chart / Klines ----------

export async function fetchYahooKlines(
  symbol: string,
  interval: Timeframe,
  _limit = 1000,
): Promise<Candle[]> {
  const yahooInterval = YAHOO_INTERVAL_MAP[interval] || "1d";
  const range = YAHOO_RANGE_MAP[interval] || "1y";

  const url = `/api/yahoo/chart?symbol=${encodeURIComponent(symbol)}&interval=${yahooInterval}&range=${range}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo chart ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No chart data");

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      time: timestamps[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
      isFinal: true,
    });
  }

  return candles;
}

// ---------- Quotes (ticker 24h equivalent) ----------

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  shortName?: string;
  longName?: string;
  exchange?: string;
  quoteType?: string;
}

export async function fetchYahooQuote(symbol: string): Promise<Ticker24h> {
  const data = await fetchYahooQuotes([symbol]);
  if (data.length === 0) throw new Error(`No quote for ${symbol}`);
  return data[0];
}

export async function fetchYahooQuotes(symbols: string[]): Promise<Ticker24h[]> {
  const url = `/api/yahoo/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo quote ${res.status}`);

  const data = await res.json();
  const quotes: YahooQuote[] = data?.quoteResponse?.result || [];

  return quotes.map((q) => ({
    symbol: q.symbol,
    lastPrice: q.regularMarketPrice ?? 0,
    priceChange: q.regularMarketChange ?? 0,
    priceChangePercent: q.regularMarketChangePercent ?? 0,
    highPrice: q.regularMarketDayHigh ?? 0,
    lowPrice: q.regularMarketDayLow ?? 0,
    volume: q.regularMarketVolume ?? 0,
    quoteVolume: 0,
  }));
}

// ---------- Symbol search ----------

interface YahooSearchQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
  exchDisp?: string;
}

export async function searchYahooSymbols(
  query: string,
  marketFilter?: "usa" | "bvc",
): Promise<SymbolInfo[]> {
  const url = `/api/yahoo/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo search ${res.status}`);

  const data = await res.json();
  const quotes: YahooSearchQuote[] = data?.quotes || [];

  // Filter by equity type
  let filtered = quotes.filter(
    (q) => q.quoteType === "EQUITY" || q.quoteType === "ETF",
  );

  if (marketFilter === "usa") {
    filtered = filtered.filter((q) => {
      const ex = (q.exchDisp || q.exchange || "").toUpperCase();
      return (
        ex.includes("NASDAQ") ||
        ex.includes("NYSE") ||
        ex.includes("AMEX") ||
        ex.includes("NMS") ||
        ex.includes("NGM") ||
        ex.includes("PCX") ||
        ex.includes("ARCA")
      );
    });
  } else if (marketFilter === "bvc") {
    filtered = filtered.filter((q) => {
      const ex = (q.exchDisp || q.exchange || "").toUpperCase();
      const sym = q.symbol.toUpperCase();
      return (
        ex.includes("COLOMB") ||
        ex.includes("BVC") ||
        ex.includes("BOG") ||
        sym.endsWith(".CL") // Yahoo suffix for BVC
      );
    });
  }

  return filtered.map((q) => ({
    symbol: q.symbol,
    baseAsset: q.shortname || q.longname || q.symbol,
    quoteAsset: marketFilter === "bvc" ? "COP" : "USD",
    status: "TRADING",
  }));
}

// ---------- Polling service ----------

type TickCallback = (tick: {
  symbol: string;
  close: number;
  open: number;
  pct: number;
}) => void;

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let pollingSymbols: string[] = [];
let pollingCallback: TickCallback | null = null;

export function startYahooPolling(
  symbols: string[],
  onTick: TickCallback,
  intervalMs = 5000,
): () => void {
  stopYahooPolling();
  pollingSymbols = symbols;
  pollingCallback = onTick;

  const poll = async () => {
    if (pollingSymbols.length === 0) return;
    try {
      const url = `/api/yahoo/quote?symbols=${encodeURIComponent(pollingSymbols.join(","))}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const quotes: YahooQuote[] = data?.quoteResponse?.result || [];
      quotes.forEach((q) => {
        if (pollingCallback && q.regularMarketPrice != null) {
          const close = q.regularMarketPrice;
          const change = q.regularMarketChangePercent ?? 0;
          pollingCallback({
            symbol: q.symbol,
            close,
            open: close / (1 + change / 100),
            pct: change,
          });
        }
      });
    } catch {
      // silently retry next interval
    }
  };

  poll(); // initial fetch
  pollingInterval = setInterval(poll, intervalMs);

  return stopYahooPolling;
}

export function stopYahooPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  pollingSymbols = [];
  pollingCallback = null;
}

export function updateYahooPollingSymbols(symbols: string[]) {
  pollingSymbols = symbols;
}
