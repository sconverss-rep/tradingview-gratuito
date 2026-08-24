"use client";

import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { useChartStore } from "@/lib/store/chart-store";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>
        <RightSidebar />
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
    </div>
  );
}
