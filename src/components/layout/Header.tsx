"use client";

import { Code2, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { MarketSelector } from "@/components/chart/MarketSelector";
import { Separator } from "@/components/ui/separator";

export function Header() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <MarketSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
      </div>

      <div className="flex items-center gap-2">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Source</span>
        </a>
      </div>
    </header>
  );
}
