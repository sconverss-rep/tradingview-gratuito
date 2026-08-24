"use client";

import type { Candle } from "@/lib/binance/types";
import { formatPrice, formatVolume } from "@/lib/format";

const NUM_ROWS = 40;
const POC_COLOR = "#ffb74d";
const VA_COLOR = "rgba(33, 150, 243, 0.55)";
const OUTSIDE_VA_COLOR = "rgba(33, 150, 243, 0.22)";
const VALUE_AREA_PCT = 0.7;

interface VolumeProfileOverlayProps {
  /** All candles currently visible on chart */
  candles: Candle[];
  /** Convert price → Y pixel coordinate */
  priceToY: (price: number) => number | null;
  /** Chart container width (to anchor bars on the right) */
  chartWidth: number;
  /** Chart container height */
  chartHeight: number;
}

interface Row {
  priceFrom: number;
  priceTo: number;
  volume: number;
  y: number;
  h: number;
}

function computeProfile(candles: Candle[], priceToY: (p: number) => number | null) {
  if (candles.length === 0)
    return { rows: [] as Row[], pocIdx: -1, vaHigh: -1, vaLow: -1 };

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  const priceRange = maxPrice - minPrice;
  if (priceRange <= 0)
    return { rows: [] as Row[], pocIdx: -1, vaHigh: -1, vaLow: -1 };

  const rowHeight = priceRange / NUM_ROWS;

  const rows: Row[] = [];
  for (let i = 0; i < NUM_ROWS; i++) {
    const priceFrom = minPrice + i * rowHeight;
    const priceTo = priceFrom + rowHeight;
    const y = priceToY(priceTo);
    const yBottom = priceToY(priceFrom);
    if (y === null || yBottom === null) continue;
    rows.push({
      priceFrom,
      priceTo,
      volume: 0,
      y,
      h: Math.max(1, yBottom - y),
    });
  }

  if (rows.length === 0)
    return { rows, pocIdx: -1, vaHigh: -1, vaLow: -1 };

  for (const c of candles) {
    const candleRange = c.high - c.low;
    if (candleRange <= 0) {
      const idx = Math.min(
        Math.max(0, Math.floor((c.close - minPrice) / rowHeight)),
        rows.length - 1,
      );
      rows[idx].volume += c.volume;
      continue;
    }
    for (let i = 0; i < rows.length; i++) {
      const overlap = Math.max(
        0,
        Math.min(c.high, rows[i].priceTo) - Math.max(c.low, rows[i].priceFrom),
      );
      if (overlap > 0) {
        rows[i].volume += (overlap / candleRange) * c.volume;
      }
    }
  }

  // POC
  let pocIdx = 0;
  let totalVol = 0;
  for (let i = 0; i < rows.length; i++) {
    totalVol += rows[i].volume;
    if (rows[i].volume > rows[pocIdx].volume) pocIdx = i;
  }

  // Value Area
  const targetVol = totalVol * VALUE_AREA_PCT;
  let vaVol = rows[pocIdx].volume;
  let vaHighIdx = pocIdx;
  let vaLowIdx = pocIdx;
  while (vaVol < targetVol && (vaHighIdx < rows.length - 1 || vaLowIdx > 0)) {
    const above = vaHighIdx < rows.length - 1 ? rows[vaHighIdx + 1].volume : -1;
    const below = vaLowIdx > 0 ? rows[vaLowIdx - 1].volume : -1;
    if (above >= below && above >= 0) {
      vaHighIdx++;
      vaVol += rows[vaHighIdx].volume;
    } else if (below >= 0) {
      vaLowIdx--;
      vaVol += rows[vaLowIdx].volume;
    } else break;
  }

  return { rows, pocIdx, vaHigh: vaHighIdx, vaLow: vaLowIdx };
}

export function VolumeProfileOverlay({
  candles,
  priceToY,
  chartWidth,
  chartHeight,
}: VolumeProfileOverlayProps) {
  const { rows, pocIdx, vaHigh, vaLow } = computeProfile(candles, priceToY);

  if (rows.length === 0 || pocIdx < 0) return null;

  const maxVol = Math.max(...rows.map((r) => r.volume));
  if (maxVol === 0) return null;

  // Bars grow from the right edge leftward (like TradingView)
  const priceScaleWidth = 70; // approximate right price-scale width
  const barMaxWidth = Math.min(chartWidth * 0.25, 200);
  const rightEdge = chartWidth - priceScaleWidth;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10"
      style={{ overflow: "visible" }}
    >
      {rows.map((row, i) => {
        const barWidth = (row.volume / maxVol) * barMaxWidth;
        const isPOC = i === pocIdx;
        const inVA = i >= vaLow && i <= vaHigh;

        let fill = OUTSIDE_VA_COLOR;
        if (isPOC) fill = POC_COLOR;
        else if (inVA) fill = VA_COLOR;

        return (
          <g key={i}>
            <rect
              x={rightEdge - barWidth}
              y={row.y}
              width={barWidth}
              height={Math.max(1, row.h - 0.5)}
              fill={fill}
              rx={1}
            />
            {/* POC dashed line + label */}
            {isPOC && (
              <>
                <line
                  x1={0}
                  y1={row.y + row.h / 2}
                  x2={rightEdge}
                  y2={row.y + row.h / 2}
                  stroke={POC_COLOR}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.5}
                />
                <text
                  x={rightEdge - barWidth - 6}
                  y={row.y + row.h / 2 + 3}
                  fill={POC_COLOR}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="end"
                >
                  POC {formatPrice((row.priceFrom + row.priceTo) / 2)}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* VAH / VAL labels */}
      {rows[vaHigh] && (
        <text
          x={rightEdge - 4}
          y={rows[vaHigh].y - 2}
          fill="#2196f3"
          fontSize={8}
          fontFamily="monospace"
          textAnchor="end"
          opacity={0.7}
        >
          VAH {formatPrice((rows[vaHigh].priceFrom + rows[vaHigh].priceTo) / 2)}
        </text>
      )}
      {rows[vaLow] && (
        <text
          x={rightEdge - 4}
          y={rows[vaLow].y + rows[vaLow].h + 9}
          fill="#2196f3"
          fontSize={8}
          fontFamily="monospace"
          textAnchor="end"
          opacity={0.7}
        >
          VAL {formatPrice((rows[vaLow].priceFrom + rows[vaLow].priceTo) / 2)}
        </text>
      )}
    </svg>
  );
}
