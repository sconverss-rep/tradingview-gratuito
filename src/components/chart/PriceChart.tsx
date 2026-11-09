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
  type Logical,
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
import { FibonacciOverlay, FIBO_LEVELS } from "./FibonacciOverlay";
import { ChannelOverlay, type ChannelAnchor } from "./ChannelOverlay";
import { TrendLineOverlay } from "./TrendLineOverlay";
import { RectangleOverlay } from "./RectangleOverlay";
import { ShapeAnchors, type ShapeAnchor } from "./ShapeAnchors";
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

type DrawingKind = "hline" | "trendline" | "fibonacci" | "channel" | "rectangle";
interface SelectedDrawing {
  kind: DrawingKind;
  id: string;
}

interface RectangleState {
  phase: "idle" | "placing";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_RECTANGLE: RectangleState = { phase: "idle", a: null, b: null };

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

type TimeScaleApi = ReturnType<IChartApi["timeScale"]>;

// Time <-> logical index conversion that extrapolates beyond the first/last bar,
// so drawings can live in the empty space to the right of the latest candle.
function timeToLogical(candles: Candle[], time: number): number | null {
  const n = candles.length;
  if (n < 2) return null;
  if (time >= candles[n - 1].time) {
    const step = candles[n - 1].time - candles[n - 2].time;
    return n - 1 + (time - candles[n - 1].time) / step;
  }
  if (time <= candles[0].time) {
    return (time - candles[0].time) / (candles[1].time - candles[0].time);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return lo + (time - candles[lo].time) / (candles[lo + 1].time - candles[lo].time);
}

function logicalToTime(candles: Candle[], l: number): number | null {
  const n = candles.length;
  if (n < 2) return null;
  if (l >= n - 1) return candles[n - 1].time + (l - (n - 1)) * (candles[n - 1].time - candles[n - 2].time);
  if (l <= 0) return candles[0].time + l * (candles[1].time - candles[0].time);
  const i = Math.floor(l);
  return candles[i].time + (l - i) * (candles[i + 1].time - candles[i].time);
}

function timeToX(ts: TimeScaleApi, candles: Candle[], time: number): number | null {
  const l = timeToLogical(candles, time);
  return l === null ? null : ts.logicalToCoordinate(l as Logical);
}

function xToTime(ts: TimeScaleApi, candles: Candle[], x: number): number | null {
  const l = ts.coordinateToLogical(x);
  return l === null ? null : logicalToTime(candles, l);
}

interface ChannelPx {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  /** vertical offset (px) of the parallel line */
  dY: number;
}

function channelPx(
  ts: TimeScaleApi,
  cs: ISeriesApi<"Candlestick">,
  candles: Candle[],
  a: MeasurePoint,
  b: MeasurePoint,
  c: MeasurePoint,
): ChannelPx | null {
  const aX = timeToX(ts, candles, a.time);
  const bX = timeToX(ts, candles, b.time);
  const cX = timeToX(ts, candles, c.time);
  const aY = cs.priceToCoordinate(a.price);
  const bY = cs.priceToCoordinate(b.price);
  const cY = cs.priceToCoordinate(c.price);
  if (aX === null || bX === null || cX === null || aY === null || bY === null || cY === null) return null;
  const t = bX === aX ? 0 : (cX - aX) / (bX - aX);
  return { aX, aY, bX, bY, dY: cY - (aY + (bY - aY) * t) };
}

/** Distance from a pixel to the channel (0 when inside the band) */
function channelDistance(g: ChannelPx, x: number, y: number): number {
  const d1 = distToSegment(x, y, g.aX, g.aY, g.bX, g.bY);
  const d2 = distToSegment(x, y, g.aX, g.aY + g.dY, g.bX, g.bY + g.dY);
  const left = Math.min(g.aX, g.bX);
  const right = Math.max(g.aX, g.bX);
  if (x >= left && x <= right && g.bX !== g.aX) {
    const t = (x - g.aX) / (g.bX - g.aX);
    const yUp = g.aY + (g.bY - g.aY) * t;
    const yLo = yUp + g.dY;
    if (y >= Math.min(yUp, yLo) && y <= Math.max(yUp, yLo)) return 0;
  }
  return Math.min(d1, d2);
}

/** Price offset of the parallel line given the cursor pixel (vertical offset, like TradingView) */
function channelOffsetPrice(
  ts: TimeScaleApi,
  cs: ISeriesApi<"Candlestick">,
  candles: Candle[],
  a: MeasurePoint,
  b: MeasurePoint,
  x: number,
  y: number,
): number | null {
  const aX = timeToX(ts, candles, a.time);
  const bX = timeToX(ts, candles, b.time);
  const aY = cs.priceToCoordinate(a.price);
  const bY = cs.priceToCoordinate(b.price);
  if (aX === null || bX === null || aY === null || bY === null) return null;
  const t = bX === aX ? 0 : (x - aX) / (bX - aX);
  const dY = y - (aY + (bY - aY) * t);
  const p = cs.coordinateToPrice(bY + dY);
  return p === null ? null : p - b.price;
}

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
  const rectangles = useChartStore((s) => s.rectangles);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const addTrendLine = useChartStore((s) => s.addTrendLine);
  const addFibonacci = useChartStore((s) => s.addFibonacci);
  const addChannel = useChartStore((s) => s.addChannel);
  const updateChannel = useChartStore((s) => s.updateChannel);
  const addRectangle = useChartStore((s) => s.addRectangle);
  const removePriceLine = useChartStore((s) => s.removePriceLine);
  const removeTrendLine = useChartStore((s) => s.removeTrendLine);
  const removeFibonacci = useChartStore((s) => s.removeFibonacci);
  const removeChannel = useChartStore((s) => s.removeChannel);
  const removeRectangle = useChartStore((s) => s.removeRectangle);
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
  const updateChannelRef = useRef(updateChannel);
  updateChannelRef.current = updateChannel;
  const addRectangleRef = useRef(addRectangle);
  addRectangleRef.current = addRectangle;
  const removePriceLineRef = useRef(removePriceLine);
  removePriceLineRef.current = removePriceLine;
  const removeTrendLineRef = useRef(removeTrendLine);
  removeTrendLineRef.current = removeTrendLine;
  const removeFibonacciRef = useRef(removeFibonacci);
  removeFibonacciRef.current = removeFibonacci;
  const removeChannelRef = useRef(removeChannel);
  removeChannelRef.current = removeChannel;
  const removeRectangleRef = useRef(removeRectangle);
  removeRectangleRef.current = removeRectangle;
  const priceLinesRef = useRef(priceLines);
  priceLinesRef.current = priceLines;
  const trendLinesRef = useRef(trendLines);
  trendLinesRef.current = trendLines;
  const fibonacciDrawingsRef = useRef(fibonacciDrawings);
  fibonacciDrawingsRef.current = fibonacciDrawings;
  const channelDrawingsRef = useRef(channelDrawings);
  channelDrawingsRef.current = channelDrawings;
  const rectanglesRef = useRef(rectangles);
  rectanglesRef.current = rectangles;
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
  const [rectangle, setRectangle] = useState<RectangleState>(INITIAL_RECTANGLE);
  const [selected, setSelected] = useState<SelectedDrawing | null>(null);
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
  const rectangleRef = useRef(rectangle);
  rectangleRef.current = rectangle;

  function startChannelDrag(id: string, anchor: ChannelAnchor, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: "channel", id });
    const chart = chartRef.current;
    const cs = candleSeriesRef.current;
    const box = containerRef.current;
    const cd = channelDrawingsRef.current.find((c) => c.id === id);
    if (!chart || !cs || !box || !cd) return;
    const ts = chart.timeScale();
    const candles = candlesRef.current;
    const g = channelPx(ts, cs, candles, cd.a, cd.b, cd.c);
    const offStart = g ? cs.coordinateToPrice(g.bY + g.dY) : null;
    if (!g || offStart === null) return;
    const off0 = offStart - cd.b.price;
    const rect0 = box.getBoundingClientRect();
    const startX = e.clientX - rect0.left;
    const startY = e.clientY - rect0.top;

    const move = (ev: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const price = cs.coordinateToPrice(y);
      const time = xToTime(ts, candles, x);
      if (price === null || time === null) return;
      let a: MeasurePoint = cd.a;
      let b: MeasurePoint = cd.b;
      let off = off0;
      if (anchor === "a") a = { time, price };
      else if (anchor === "b") b = { time, price };
      else if (anchor === "a2") off = price - cd.a.price;
      else if (anchor === "b2") off = price - cd.b.price;
      else if (anchor === "mb") {
        const pm = cs.coordinateToPrice((g.aY + g.bY) / 2);
        if (pm === null) return;
        off = price - pm;
      } else {
        const p0 = cs.coordinateToPrice(startY);
        const l0 = ts.coordinateToLogical(startX);
        const l1 = ts.coordinateToLogical(x);
        if (p0 === null || l0 === null || l1 === null) return;
        const shift = (pt: MeasurePoint): MeasurePoint => {
          const l = timeToLogical(candles, pt.time);
          const t = l === null ? null : logicalToTime(candles, l + (l1 - l0));
          return t === null ? pt : { time: t, price: pt.price + (price - p0) };
        };
        a = shift(cd.a);
        b = shift(cd.b);
      }
      updateChannelRef.current(id, a, b, { time: b.time, price: b.price + off });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startShapeDrag(
    kind: "trendline" | "fibonacci" | "rectangle",
    id: string,
    anchor: ShapeAnchor,
    e: React.PointerEvent,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind, id });
    const chart = chartRef.current;
    const cs = candleSeriesRef.current;
    const box = containerRef.current;
    const st = useChartStore.getState();
    const list =
      kind === "trendline" ? st.trendLines : kind === "fibonacci" ? st.fibonacciDrawings : st.rectangles;
    const d = list.find((x) => x.id === id);
    if (!chart || !cs || !box || !d) return;
    const ts = chart.timeScale();
    const candles = candlesRef.current;
    const rect0 = box.getBoundingClientRect();
    const startX = e.clientX - rect0.left;
    const startY = e.clientY - rect0.top;

    const move = (ev: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const price = cs.coordinateToPrice(y);
      const time = xToTime(ts, candles, x);
      if (price === null || time === null) return;
      let a: MeasurePoint = d.a;
      let b: MeasurePoint = d.b;
      if (anchor === "a") a = { time, price };
      else if (anchor === "b") b = { time, price };
      else if (anchor === "a2") {
        a = { time, price: d.a.price };
        b = { time: d.b.time, price };
      } else if (anchor === "b2") {
        b = { time, price: d.b.price };
        a = { time: d.a.time, price };
      } else {
        const p0 = cs.coordinateToPrice(startY);
        const l0 = ts.coordinateToLogical(startX);
        const l1 = ts.coordinateToLogical(x);
        if (p0 === null || l0 === null || l1 === null) return;
        const shift = (pt: MeasurePoint): MeasurePoint => {
          const l = timeToLogical(candles, pt.time);
          const t = l === null ? null : logicalToTime(candles, l + (l1 - l0));
          return t === null ? pt : { time: t, price: pt.price + (price - p0) };
        };
        a = shift(d.a);
        b = shift(d.b);
      }
      const store = useChartStore.getState();
      if (kind === "trendline") store.updateTrendLine(id, a, b);
      else if (kind === "fibonacci") store.updateFibonacci(id, a, b);
      else store.updateRectangle(id, a, b);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startHLineDrag(id: string, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: "hline", id });
    const cs = candleSeriesRef.current;
    const box = containerRef.current;
    if (!cs || !box) return;
    const move = (ev: PointerEvent) => {
      const price = cs.coordinateToPrice(ev.clientY - box.getBoundingClientRect().top);
      if (price !== null && isFinite(price)) useChartStore.getState().updatePriceLine(id, price);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

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
    const timeAt = (x: number) => xToTime(chart.timeScale(), candlesRef.current, x);

    // Closest drawing (of the current symbol) to a pixel, within a small tolerance
    const findDrawingAt = (clickX: number, clickY: number): SelectedDrawing | null => {
      const cs = candleSeriesRef.current;
      if (!cs) return null;
      const ts = chart.timeScale();
      const candles = candlesRef.current;
      const sym = symbolRef.current;
      const TOL = 8;
      let best = TOL;
      let hit: SelectedDrawing | null = null;
      const consider = (d: number, kind: DrawingKind, id: string) => {
        if (d < best) {
          best = d;
          hit = { kind, id };
        }
      };

      for (const pl of priceLinesRef.current) {
        if (pl.symbol !== sym) continue;
        const y = cs.priceToCoordinate(pl.price);
        if (y !== null) consider(Math.abs(clickY - y), "hline", pl.id);
      }

      for (const tl of trendLinesRef.current) {
        if (tl.symbol !== sym) continue;
        const ax = timeToX(ts, candles, tl.a.time);
        const ay = cs.priceToCoordinate(tl.a.price);
        const bx = timeToX(ts, candles, tl.b.time);
        const by = cs.priceToCoordinate(tl.b.price);
        if (ax === null || ay === null || bx === null || by === null) continue;
        consider(distToSegment(clickX, clickY, ax, ay, bx, by), "trendline", tl.id);
      }

      for (const fd of fibonacciDrawingsRef.current) {
        if (fd.symbol !== sym) continue;
        const ax = timeToX(ts, candles, fd.a.time);
        const ay = cs.priceToCoordinate(fd.a.price);
        const bx = timeToX(ts, candles, fd.b.time);
        const by = cs.priceToCoordinate(fd.b.price);
        if (ax === null || ay === null || bx === null || by === null) continue;
        const x0 = Math.min(ax, bx);
        const x1 = Math.max(ax, bx);
        consider(distToSegment(clickX, clickY, ax, ay, bx, by), "fibonacci", fd.id);
        const ys = FIBO_LEVELS.map((level) => by + (ay - by) * level);
        // level lines and their labels (drawn to the left of the first anchor)
        if (clickX >= x0 - 110 && clickX <= x1 + TOL) {
          for (const y of ys) consider(Math.abs(clickY - y), "fibonacci", fd.id);
        }
        // anywhere inside the bands (low priority so other drawings on top win)
        if (clickX >= x0 && clickX <= x1 && clickY >= Math.min(...ys) && clickY <= Math.max(...ys)) {
          consider(6, "fibonacci", fd.id);
        }
      }

      for (const cd of channelDrawingsRef.current) {
        if (cd.symbol !== sym) continue;
        const g = channelPx(ts, cs, candles, cd.a, cd.b, cd.c);
        if (g) consider(channelDistance(g, clickX, clickY), "channel", cd.id);
      }

      for (const rd of rectanglesRef.current) {
        if (rd.symbol !== sym) continue;
        const ax = timeToX(ts, candles, rd.a.time);
        const ay = cs.priceToCoordinate(rd.a.price);
        const bx = timeToX(ts, candles, rd.b.time);
        const by = cs.priceToCoordinate(rd.b.price);
        if (ax === null || ay === null || bx === null || by === null) continue;
        const inside =
          clickX >= Math.min(ax, bx) - TOL &&
          clickX <= Math.max(ax, bx) + TOL &&
          clickY >= Math.min(ay, by) - TOL &&
          clickY <= Math.max(ay, by) + TOL;
        if (inside) consider(0, "rectangle", rd.id);
      }

      return hit;
    };

    // Click handler — drawing tools, selection (cursor) and eraser
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        const id = addPriceLineRef.current(price, symbolRef.current);
        setSelected({ kind: "hline", id });
        useChartStore.getState().setTool("cursor");
        return;
      }

      if (toolRef.current === "cursor") {
        setSelected(findDrawingAt(param.point.x, param.point.y));
        return;
      }

      if (toolRef.current === "eraser") {
        const hit = findDrawingAt(param.point.x, param.point.y);
        if (hit) {
          if (hit.kind === "hline") removePriceLineRef.current(hit.id);
          else if (hit.kind === "trendline") removeTrendLineRef.current(hit.id);
          else if (hit.kind === "fibonacci") removeFibonacciRef.current(hit.id);
          else if (hit.kind === "channel") removeChannelRef.current(hit.id);
          else removeRectangleRef.current(hit.id);
          setSelected(null);
        }
        return;
      }

      if (toolRef.current === "rectangle") {
        const time = timeAt(param.point.x);
        if (time === null) return;
        const current = rectangleRef.current;
        if (current.phase === "idle") {
          setRectangle({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.phase === "placing" && current.a) {
          const id = addRectangleRef.current(current.a, { time, price }, symbolRef.current);
          setSelected({ kind: "rectangle", id });
          useChartStore.getState().setTool("cursor");
          setRectangle(INITIAL_RECTANGLE);
        }
      }

      if (toolRef.current === "measure") {
        const time = timeAt(param.point.x);
        if (time === null) return;
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
        const time = timeAt(param.point.x);
        if (time === null) return;
        const current = trendlineRef.current;
        if (current.phase === "idle") {
          setTrendline({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.phase === "placing" && current.a) {
          const id = addTrendLineRef.current(current.a, { time, price }, symbolRef.current);
          setSelected({ kind: "trendline", id });
          useChartStore.getState().setTool("cursor");
          setTrendline(INITIAL_TRENDLINE);
        }
      }

      if (toolRef.current === "fibonacci") {
        const time = timeAt(param.point.x);
        if (time === null) return;
        const current = fiboRef.current;
        if (current.phase === "idle") {
          setFibo({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.phase === "placing" && current.a) {
          const id = addFibonacciRef.current(current.a, { time, price }, symbolRef.current);
          setSelected({ kind: "fibonacci", id });
          useChartStore.getState().setTool("cursor");
          setFibo(INITIAL_FIBO);
        }
      }

      if (toolRef.current === "channel") {
        const time = timeAt(param.point.x);
        if (time === null) return;
        const current = channelRef.current;
        if (current.phase === "idle") {
          setChannel({ phase: "p1", a: { time, price }, b: { time, price }, c: null });
        } else if (current.phase === "p1") {
          setChannel({ phase: "p2", a: current.a, b: { time, price }, c: { time, price } });
        } else if (current.phase === "p2" && current.a && current.b) {
          const off = channelOffsetPrice(
            chart.timeScale(),
            candleSeriesRef.current,
            candlesRef.current,
            current.a,
            current.b,
            param.point.x,
            param.point.y,
          );
          if (off !== null) {
            const id = addChannelRef.current(
              current.a,
              current.b,
              { time: current.b.time, price: current.b.price + off },
              symbolRef.current,
            );
            setSelected({ kind: "channel", id });
            useChartStore.getState().setTool("cursor");
          }
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
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = timeAt(param.point.x);
          if (time === null) return;
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (
        toolRef.current === "trendline" &&
        trendlineRef.current.phase === "placing" &&
        param.point &&
        candleSeriesRef.current
      ) {
        const priceT = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceT !== null && isFinite(priceT)) {
          const timeT = timeAt(param.point.x);
          if (timeT === null) return;
          setTrendline((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time: timeT, price: priceT } } : prev,
          );
        }
      }

      if (
        toolRef.current === "rectangle" &&
        rectangleRef.current.phase === "placing" &&
        param.point &&
        candleSeriesRef.current
      ) {
        const priceR = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceR !== null && isFinite(priceR)) {
          const timeR = timeAt(param.point.x);
          if (timeR === null) return;
          setRectangle((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time: timeR, price: priceR } } : prev,
          );
        }
      }

      if (
        toolRef.current === "fibonacci" &&
        fiboRef.current.phase === "placing" &&
        param.point &&
        candleSeriesRef.current
      ) {
        const priceF = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceF !== null && isFinite(priceF)) {
          const timeF = timeAt(param.point.x);
          if (timeF === null) return;
          setFibo((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time: timeF, price: priceF } } : prev,
          );
        }
      }

      if (
        toolRef.current === "channel" &&
        param.point &&
        candleSeriesRef.current
      ) {
        const priceC = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (priceC !== null && isFinite(priceC)) {
          const timeC = timeAt(param.point.x);
          if (timeC === null) return;
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
      const existing = map.get(pl.id);
      if (existing) {
        existing.applyOptions({ price: pl.price });
      } else {
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
        tool === "rectangle" ||
        tool === "measure" ||
        tool === "fibonacci" ||
        tool === "channel" ||
        tool === "eraser"
          ? "crosshair"
          : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    if (tool !== "fibonacci") setFibo(INITIAL_FIBO);
    if (tool !== "channel") setChannel(INITIAL_CHANNEL);
    if (tool !== "trendline") setTrendline(INITIAL_TRENDLINE);
    if (tool !== "rectangle") setRectangle(INITIAL_RECTANGLE);
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
    const aX = timeToX(ts, candlesRef.current, measure.a.time);
    const bX = timeToX(ts, candlesRef.current, measure.b.time);
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
  const rectangleRenders: React.ReactNode[] = [];
  let hlineHandle: React.ReactNode = null;

  if (chartRef.current && candleSeriesRef.current) {
    const ts = chartRef.current.timeScale();
    const cs = candleSeriesRef.current;
    const toXY = (p: MeasurePoint) => {
      const x = timeToX(ts, candlesRef.current, p.time);
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
          <TrendLineOverlay
            key={tl.id}
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            isPreview={false}
            selected={selected?.kind === "trendline" && selected.id === tl.id}
            onAnchorPointerDown={(anchor, e) => startShapeDrag("trendline", tl.id, anchor, e)}
          />,
        );
      }
    }
    if (trendline.phase === "placing" && trendline.a && trendline.b) {
      const pa = toXY(trendline.a);
      const pb = toXY(trendline.b);
      if (pa && pb) {
        trendLineRenders.push(
          <TrendLineOverlay key="trendline-preview" aX={pa.x} aY={pa.y} bX={pb.x} bY={pb.y} isPreview selected={false} />,
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
            aPrice={fd.a.price}
            bPrice={fd.b.price}
            isPreview={false}
            selected={selected?.kind === "fibonacci" && selected.id === fd.id}
            onAnchorPointerDown={(anchor, e) => startShapeDrag("fibonacci", fd.id, anchor, e)}
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
            aPrice={fibo.a.price}
            bPrice={fibo.b.price}
            isPreview
            selected={false}
          />,
        );
      }
    }

    // Parallel channels
    for (const cd of channelDrawings) {
      if (cd.symbol !== symbol) continue;
      const g = channelPx(ts, cs, candlesRef.current, cd.a, cd.b, cd.c);
      if (g) {
        channelRenders.push(
          <ChannelOverlay
            key={cd.id}
            aX={g.aX}
            aY={g.aY}
            bX={g.bX}
            bY={g.bY}
            dY={g.dY}
            isPreview={false}
            selected={selected?.kind === "channel" && selected.id === cd.id}
            onAnchorPointerDown={(anchor, e) => startChannelDrag(cd.id, anchor, e)}
          />,
        );
      }
    }
    if (channel.phase !== "idle" && channel.a && channel.b) {
      const pa = toXY(channel.a);
      const pb = toXY(channel.b);
      const g = channel.c ? channelPx(ts, cs, candlesRef.current, channel.a, channel.b, channel.c) : null;
      if (pa && pb) {
        channelRenders.push(
          <ChannelOverlay
            key="channel-preview"
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            dY={g ? g.dY : null}
            isPreview
            selected={false}
          />,
        );
      }
    }

    // Handle for the selected horizontal line
    if (selected?.kind === "hline") {
      const pl = priceLines.find((p) => p.id === selected.id && p.symbol === symbol);
      const y = pl ? cs.priceToCoordinate(pl.price) : null;
      if (pl && y !== null) {
        hlineHandle = (
          <svg className="pointer-events-none absolute inset-0 z-20" style={{ overflow: "visible" }}>
            <ShapeAnchors
              color="#2962ff"
              points={[{ key: "mt", x: (chartDims.w || 400) / 2, y }]}
              onPointerDown={(_, e) => startHLineDrag(pl.id, e)}
            />
          </svg>
        );
      }
    }

    // Rectangles
    for (const rd of rectangles) {
      if (rd.symbol !== symbol) continue;
      const pa = toXY(rd.a);
      const pb = toXY(rd.b);
      if (pa && pb) {
        rectangleRenders.push(
          <RectangleOverlay
            key={rd.id}
            aX={pa.x}
            aY={pa.y}
            bX={pb.x}
            bY={pb.y}
            isPreview={false}
            selected={selected?.kind === "rectangle" && selected.id === rd.id}
            onAnchorPointerDown={(anchor, e) => startShapeDrag("rectangle", rd.id, anchor, e)}
          />,
        );
      }
    }
    if (rectangle.phase === "placing" && rectangle.a && rectangle.b) {
      const pa = toXY(rectangle.a);
      const pb = toXY(rectangle.b);
      if (pa && pb) {
        rectangleRenders.push(
          <RectangleOverlay key="rectangle-preview" aX={pa.x} aY={pa.y} bX={pb.x} bY={pb.y} isPreview selected={false} />,
        );
      }
    }
  }

  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}
      <div
        className="pointer-events-none absolute left-0 top-0 overflow-hidden"
        style={{
          height: paneOffsets[0]?.height ?? "100%",
          width: Math.max(0, chartDims.w - (chartRef.current?.priceScale("right").width() ?? 0)) || "100%",
        }}
      >
        {fiboRenders}
        {channelRenders}
        {trendLineRenders}
        {rectangleRenders}
        {hlineHandle}
      </div>

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
