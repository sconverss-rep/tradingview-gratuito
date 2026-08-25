"use client";

import { formatPrice } from "@/lib/format";

const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIBO_COLORS: Record<number, string> = {
  0: "#787b86",
  0.236: "#f44336",
  0.382: "#ff9800",
  0.5: "#4caf50",
  0.618: "#00bcd4",
  0.786: "#2196f3",
  1: "#9c27b0",
};

interface FibonacciOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  highPrice: number;
  lowPrice: number;
  chartWidth: number;
  isPreview: boolean;
}

export function FibonacciOverlay({
  aX,
  aY,
  bX,
  bY,
  highPrice,
  lowPrice,
  chartWidth,
  isPreview,
}: FibonacciOverlayProps) {
  const left = Math.min(aX, bX);
  const right = Math.max(chartWidth, aX, bX);
  const priceRange = highPrice - lowPrice;
  const opacity = isPreview ? 0.55 : 0.9;

  const levelY = (level: number) => aY + (bY - aY) * level;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      {/* Colored bands between consecutive levels (rainbow theme) */}
      {FIBO_LEVELS.slice(0, -1).map((level, i) => {
        const nextLevel = FIBO_LEVELS[i + 1];
        const y0 = levelY(level);
        const y1 = levelY(nextLevel);
        const color = FIBO_COLORS[nextLevel] ?? "#787b86";
        return (
          <rect
            key={`band-${level}`}
            x={left}
            y={Math.min(y0, y1)}
            width={right - left}
            height={Math.abs(y1 - y0)}
            fill={color}
            opacity={isPreview ? 0.06 : 0.1}
          />
        );
      })}

      {/* Fibonacci levels */}
      {FIBO_LEVELS.map((level) => {
        const y = levelY(level);
        const price = highPrice - priceRange * level;
        const color = FIBO_COLORS[level] ?? "#787b86";
        const pct = (level * 100).toFixed(1);

        return (
          <g key={level}>
            <line
              x1={left}
              y1={y}
              x2={right}
              y2={y}
              stroke={color}
              strokeWidth={level === 0 || level === 1 ? 1.5 : 1}
              opacity={opacity}
            />
            <text
              x={right - 8}
              y={y - 4}
              fill={color}
              fontSize={11}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              textAnchor="end"
              opacity={opacity}
            >
              {pct}% — {formatPrice(price)}
            </text>
          </g>
        );
      })}

      {/* Connecting line + anchor markers between the two points */}
      <line
        x1={aX}
        y1={aY}
        x2={bX}
        y2={bY}
        stroke="#2962ff"
        strokeWidth={1}
        strokeDasharray="4 2"
        opacity={isPreview ? 0.5 : 0.7}
      />
      <circle cx={aX} cy={aY} r={4} fill="#131722" stroke="#2962ff" strokeWidth={1.5} opacity={opacity} />
      <circle cx={bX} cy={bY} r={4} fill="#131722" stroke="#2962ff" strokeWidth={1.5} opacity={opacity} />
    </svg>
  );
}
