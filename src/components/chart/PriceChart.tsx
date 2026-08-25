"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { fetchYahooKlines, fetchYahooQuote } from "@/lib/providers/yahoo";
import { ema, rsi, macd } from "@/lib/indicators";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { MARKET_META } from "@/lib/providers/types";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { FibonacciOverlay } from "./FibonacciOverlay";
import { ChannelOverlay } from "./ChannelOverlay";
import { TrendLineOverlay } from "./TrendLineOverlay";
import { VolumeProfileOverlay } from "./VolumeProfileOverlay";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

interface FiboState {
  phase: "idle" | "placing";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_FIBO: FiboState = { phase: "idle", a: null, b: null };

interface ChannelState {
  phase: "idle" | "p1" | "p2";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
  c: MeasurePoint | null;
}
const INITIAL_CHANNEL: ChannelState = { phase: "idle", a: null, b: null, c: null };

interface TrendLineState {
  phase: "idle" | "placing";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_TRENDLINE: TrendLineState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
};

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  const market = useChartStore((s) => s.market);
  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const priceLines = useChartStore((s) => s.priceLines);
  const trendLines = useChartStore((s) => s.trendLines);
  const fibonacciDrawings = useChartStore((s) => s.fibonacciDrawings);
  const channelDrawings = useChartStore((s) => s.channelDrawings);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const addTrendLine = useChartStore((s) => s.addTrendLine);
  const addFibonacci = useChartStore((s) => s.addFibonacci);
  const addChannel = useChartStore((s) => s.addChannel);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const addTrendLineRef = useRef(addTrendLine);
  addTrendLineRef.current = addTrendLine;
  const addFibonacciRef = useRef(addFibonacci);
  addFibonacciRef.current = addFibonacci;
  const addChannelRef = useRef(addChannel);
  addChannelRef.current = addChannel;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [fibo, setFibo] = useState<FiboState>(INITIAL_FIBO);
  const [channel, setChannel] = useState<ChannelState>(INITIAL_CHANNEL);
  const [trendline, setTrendline] = useState<TrendLineState>(INITIAL_TRENDLINE);
  const [visibleCandles, setVisibleCandles] = useState<Candle[]>([]);
  const [chartDims, setChartDims] = useState({ w: 0, h: 0 });
  const [renderTick, setRenderTick] = useState(0);
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const fiboRef = useRef(fibo);
  fiboRef.current = fibo;
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const trendlineRef = useRef(trendline);
  trendlineRef.current = trendline;

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
        autoScale: true,
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
      }

      if (toolRef.current === "trendline") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = trendlineRef.current;
        if (current.phase === "idle") {
          setTrendline({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.phase === "placing" && current.a) {
          addTrendLineRef.current(current.a, { time, price }, symbolRef.current);
          setTrendline(INITIAL_TRENDLINE);
        }
      }

      if (toolRef.current === "fibonacci") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = fiboRef.current;
        if (current.phase === "idle") {
          setFibo({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.phase === "placing" && current.a) {
          addFibonacciRef.current(current.a, { time, price }, symbolRef.current);
          setFibo(INITIAL_FIBO);
        }
      }

      if (toolRef.current === "channel") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = channelRef.current;
        if (current.phase === "idle") {
          setChannel({ phase: "p1", a: { time, price }, b: { time, price }, c: null });
        } else if (current.phase === "p1") {
          setChannel({ phase: "p2", a: current.a, b: { time, price }, c: { time, price } });
        } else if (current.phase === "p2" && current.a && current.b) {
          addChannelRef.current(current.a, current.b, { time, price }, symbolRef.current);
          setChannel(INITIAL_CHANNEL);
        }
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (
        toolRef.current === "trendline" &&
        trendlineRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const priceT = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceT !== null && isFinite(priceT)) {
          const timeT = Number(param.time);
          setTrendline((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time: timeT, price: priceT } } : prev,
          );
        }
      }

      if (
        toolRef.current === "fibonacci" &&
        fiboRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const priceF = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceF !== null && isFinite(priceF)) {
          const timeF = Number(param.time);
          setFibo((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time: timeF, price: priceF } } : prev,
          );
        }
      }

      if (
        toolRef.current === "channel" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const priceC = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceC !== null && isFinite(priceC)) {
          const timeC = Number(param.time);
          const cur = channelRef.current;
          if (cur.phase === "p1") {
            setChannel((prev) =>
              prev.phase === "p1" ? { ...prev, b: { time: timeC, price: priceC } } : prev,
            );
          } else if (cur.phase === "p2") {
            setChannel((prev) =>
              prev.phase === "p2" ? { ...prev, c: { time: timeC, price: priceC } } : prev,
            );
          }
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render overlays on pan / zoom so pixel coords stay in sync
    const updateVisibleCandles = () => {
      setRenderTick((t) => t + 1);
      if (!chartRef.current) return;
      const ts = chartRef.current.timeScale();
      const range = ts.getVisibleRange();
      if (range) {
        const from = Number(range.from);
        const to = Number(range.to);
        const vc = candlesRef.current.filter((c) => c.time >= from && c.time <= to);
        setVisibleCandles(vc);
      }
      if (containerRef.current) {
        setChartDims({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(updateVisibleCandles);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateVisibleCandles);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(updateVisibleCandles);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateVisibleCandles);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesMapRef.current.clear();
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    };
  }, []);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = candlesRef.current.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r30 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r70 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsi30Ref.current) chartRef.current.removeSeries(rsi30Ref.current);
      if (rsi70Ref.current) chartRef.current.removeSeries(rsi70Ref.current);
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
  }, [indicators, hidden]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Cursor style when drawing tools are active + reset measure on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" ||
        tool === "trendline" ||
        tool === "measure" ||
        tool === "fibonacci" ||
        tool === "channel"
          ? "crosshair"
          : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    if (tool !== "fibonacci") setFibo(INITIAL_FIBO);
    if (tool !== "channel") setChannel(INITIAL_CHANNEL);
    if (tool !== "trendline") setTrendline(INITIAL_TRENDLINE);
  }, [tool]);

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last200: number | undefined;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema200: last200,
      volume: lastVol,
    }));
  }

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const data = rsi(c, cfg.rsi).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);
    if (rsi30Ref.current && data.length > 0)
      rsi30Ref.current.setData([
        { time: data[0].time, value: 30 },
        { time: data[data.length - 1].time, value: 30 },
      ]);
    if (rsi70Ref.current && data.length > 0)
      rsi70Ref.current.setData([
        { time: data[0].time, value: 70 },
        { time: data[data.length - 1].time, value: 70 },
      ]);
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function applyKlines(klines: Candle[]) {
      candlesRef.current = klines;
      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(
          klines.map((k) => ({
            time: k.time as UTCTimestamp,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
          })),
        );
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          klines.map((k) => ({
            time: k.time as UTCTimestamp,
            value: k.volume,
            color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
          })),
        );
      }
      updateEMAs();
      updateRSI();
      updateMACD();
      // Auto-fit: show a reasonable window of bars centered on the latest price
      if (chartRef.current) {
        const ts = chartRef.current.timeScale();
        const totalBars = klines.length;
        // Show last ~150 bars (or all if fewer), with some right margin
        const barsToShow = Math.min(totalBars, 150);
        ts.setVisibleLogicalRange({
          from: totalBars - barsToShow,
          to: totalBars + 10,
        });
      }
      requestAnimationFrame(() => recomputePaneOffsets());

      if (klines.length > 0) {
        const last = klines[klines.length - 1];
        const prev = klines[klines.length - 2] ?? last;
        setLastPrice({
          value: last.close,
          pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
        });
      }
    }

    async function loadCrypto() {
      const klines = await fetchKlines(symbol, timeframe, 1000);
      if (cancelled) return;
      applyKlines(klines);

      const ws = getBinanceWS();
      unsub = ws.subscribeKline({
        symbol,
        interval: timeframe,
        onCandle: (k) => {
          if (!candleSeriesRef.current) return;
          const arr = candlesRef.current;
          const lastCandle = arr[arr.length - 1];
          if (lastCandle && lastCandle.time === k.time) {
            arr[arr.length - 1] = k;
          } else if (!lastCandle || k.time > lastCandle.time) {
            arr.push(k);
            if (arr.length > 2000) arr.shift();
          } else {
            return;
          }
          candleSeriesRef.current.update({
            time: k.time as UTCTimestamp,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
          });
          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
            });
          }
          updateEMAs();
          updateRSI();
          updateMACD();
          const prev = arr[arr.length - 2] ?? lastCandle;
          setLastPrice({
            value: k.close,
            pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
          });
        },
      });
    }

    async function loadStocks() {
      const klines = await fetchYahooKlines(symbol, timeframe, 1000);
      if (cancelled) return;
      applyKlines(klines);

      // Poll for live price updates (Yahoo has no free WebSocket)
      const pollQuote = async () => {
        try {
          const q = await fetchYahooQuote(symbol);
          if (cancelled || !candleSeriesRef.current) return;
          const arr = candlesRef.current;
          if (arr.length === 0) return;
          const lastCandle = arr[arr.length - 1];
          // Update the latest candle's close with the live price
          const updated = {
            ...lastCandle,
            close: q.lastPrice,
            high: Math.max(lastCandle.high, q.lastPrice),
            low: Math.min(lastCandle.low, q.lastPrice),
          };
          arr[arr.length - 1] = updated;
          candleSeriesRef.current.update({
            time: updated.time as UTCTimestamp,
            open: updated.open,
            high: updated.high,
            low: updated.low,
            close: updated.close,
          });
          setLastPrice({
            value: q.lastPrice,
            pct: q.priceChangePercent,
          });
        } catch {
          // silently retry
        }
      };
      pollTimer = setInterval(pollQuote, 5000);
    }

    async function load() {
      try {
        if (market === "crypto") {
          await loadCrypto();
        } else {
          await loadStocks();
        }
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [symbol, timeframe, market]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  // Persisted drawings (trend lines, fibonacci, channel) + in-progress preview
  const trendLineRenders: React.ReactNode[] = [];
  const fiboRenders: React.ReactNode[] = [];
  const channelRenders: React.ReactNode[] = [];

  if (chartRef.current && candleSeriesRef.current) {
    const ts = chartRef.current.timeScale();
    const cs = candleSeriesRef.current;
    const toXY = (p: MeasurePoint) => {
      const x = ts.timeToCoordinate(p.time as UTCTimestamp);
      const y = cs.priceToCoordinate(p.price);
      return x !== null && y !== null ? { x, y } : null;
    };

    // Trend lines
    for (const tl of trendLines) {
      if (tl.symbol !== symbol) continue;
      const pa = toXY(tl.a);
      const pb = toXY(tl.b);
      if (pa && pb) {
        trendLineRenders.push(
          <TrendLineOverlay key={tl.id} aX={pa.x} aY={pa.y} bX={pb.x} bY={pb.y} isPreview={false} />,
        );
      }
    }
    if (trendline.phase === "placing" && trendline.a && trendline.b) {
      const pa = toXY(trendline.a);
      const pb = toXY(trendline.b);
      if (pa && pb) {
        trendLineRenders.push(
          <TrendLineOverlay key="trendline-preview" aX={pa.x} aY={pa.y} bX={pb.x} bY={pb.y} isPreview />,
        );
      }
    }

    // Fibonacci retracements
    for (const fd of fibonacciDrawings) {
      if (fd.symbol !== symbol) continue;
      const pa = toXY(fd.a);
      const pb = toXY(fd.b);
      if (pa && pb) {
        fiboRenders.push(
          <FibonacciOverlay
            key={fd.id}
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            highPrice={Math.max(fd.a.price, fd.b.price)}
            lowPrice={Math.min(fd.a.price, fd.b.price)}
            chartWidth={chartDims.w}
            isPreview={false}
          />,
        );
      }
    }
    if (fibo.phase === "placing" && fibo.a && fibo.b) {
      const pa = toXY(fibo.a);
      const pb = toXY(fibo.b);
      if (pa && pb) {
        fiboRenders.push(
          <FibonacciOverlay
            key="fibo-preview"
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            highPrice={Math.max(fibo.a.price, fibo.b.price)}
            lowPrice={Math.min(fibo.a.price, fibo.b.price)}
            chartWidth={chartDims.w}
            isPreview
          />,
        );
      }
    }

    // Parallel channels
    for (const cd of channelDrawings) {
      if (cd.symbol !== symbol) continue;
      const pa = toXY(cd.a);
      const pb = toXY(cd.b);
      const pc = toXY(cd.c);
      if (pa && pb && pc) {
        channelRenders.push(
          <ChannelOverlay
            key={cd.id}
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            cX={pc.x}
            cY={pc.y}
            isPreview={false}
          />,
        );
      }
    }
    if (channel.phase !== "idle" && channel.a && channel.b) {
      const pa = toXY(channel.a);
      const pb = toXY(channel.b);
      const pc = channel.c ? toXY(channel.c) : null;
      if (pa && pb) {
        channelRenders.push(
          <ChannelOverlay
            key="channel-preview"
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            cX={pc?.x ?? null}
            cY={pc?.y ?? null}
            isPreview
          />,
        );
      }
    }
  }

  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}
      {fiboRenders}
      {channelRenders}
      {trendLineRenders}

      {/* Volume Profile Visible Range */}
      {indicators.vpfr && !hidden.vpfr && visibleCandles.length > 0 && candleSeriesRef.current && (
        <VolumeProfileOverlay
          candles={visibleCandles}
          priceToY={(p) => candleSeriesRef.current?.priceToCoordinate(p) ?? null}
          chartWidth={chartDims.w}
          chartHeight={chartDims.h}
        />
      )}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{symbol}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">{MARKET_META[market].exchange}</span>
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-7 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div className="mt-1 flex flex-col items-start gap-1">
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
          {indicators.volume && (
            <IndicatorPill
              name="Vol"
              value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
              color={INDICATOR_COLORS.volume}
              hidden={hidden.volume}
              onToggleHide={() => toggleHidden("volume")}
              onSettings={() => setSettingsTarget("volume")}
              onRemove={() => removeIndicator("volume")}
            />
          )}
          {indicators.vpfr && (
            <IndicatorPill
              name="Volume Profile"
              color={INDICATOR_COLORS.vpfr}
              hidden={hidden.vpfr}
              onToggleHide={() => toggleHidden("vpfr")}
              onRemove={() => removeIndicator("vpfr")}
            />
          )}
        </div>
      </div>

      {/* RSI pane label */}
      {indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {indicators.macd && paneOffsets[macdPaneIdx] && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}
    </div>
  );
}
