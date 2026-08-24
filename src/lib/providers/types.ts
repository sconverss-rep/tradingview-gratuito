export type Market = "crypto" | "usa" | "bvc";

export interface MarketMeta {
  label: string;
  exchange: string;
  currency: string;
}

export const MARKET_META: Record<Market, MarketMeta> = {
  crypto: { label: "Crypto", exchange: "Binance", currency: "USDT" },
  usa: { label: "USA", exchange: "NYSE / NASDAQ", currency: "USD" },
  bvc: { label: "BVC", exchange: "Bolsa de Colombia", currency: "COP" },
};

/** Yahoo Finance interval strings that map to our Timeframe type */
export const YAHOO_INTERVAL_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "60m", // aggregate client-side or just use 1h
  "1d": "1d",
  "1w": "1wk",
};

/** Range to request for each interval (Yahoo requires range param) */
export const YAHOO_RANGE_MAP: Record<string, string> = {
  "1m": "7d",
  "5m": "60d",
  "15m": "60d",
  "1h": "730d",
  "4h": "730d",
  "1d": "5y",
  "1w": "10y",
};

export const DEFAULT_USA_WATCHLIST = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "JPM",
];

export const DEFAULT_BVC_WATCHLIST = [
  "EC",       // Ecopetrol (ADR NYSE)
  "CIB",      // Bancolombia (ADR NYSE)
  "AVAL",     // Grupo Aval (ADR NYSE)
  "PFBCOLOM.CL", // Bancolombia pref (BVC via Yahoo)
  "ECOPETL.CL",  // Ecopetrol (BVC via Yahoo)
  "ISA.CL",      // ISA (BVC via Yahoo)
  "NUTRESA.CL",  // Nutresa (BVC via Yahoo)
  "GRUPOARG.CL", // Grupo Argos (BVC via Yahoo)
];
