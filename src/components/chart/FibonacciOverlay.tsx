"use client";

import { formatPrice } from "@/lib/format";

const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIBO_COLORS: Record<number, string> = {
  0: "#787b86",
  0.236: "#f44336",
  0.382: "#ff9800",
  0.5: "#4caf50",
  0.618: "#2196f3",
  0.786: "#9c27b0",
  1: "#787b86",
};

interface FibonacciOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  highPrice: number;
  lowPrice: number;
  isPreview: boolean;
}

export function FibonacciOverlay({
  aX,
  aY,
  bX,
  bY,
  highPrice,
  lowPrice,
  isPreview,
}: FibonacciOverlayProps) {
  const left = Math.min(aX, bX);
  const right = Math.max(aX, bX);
  const width = right - left;
  const height = Math.abs(bY - aY);
  const top = Math.min(aY, bY);

  // aY is the 0% level (start), bY is the 100% level (end)
  // Fibonacci retracement levels go from bY back towards aY
  const priceRange = highPrice - lowPrice;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      {/* Background rectangle */}
      <rect
        x={left - 20}
        y={top}
        width={width + 200}
        height={height}
        fill="rgba(33, 150, 243, 0.04)"
        stroke="none"
      />

      {/* Fibonacci levels */}
      {FIBO_LEVELS.map((level) => {
        const y = aY + (bY - aY) * level;
        const price = highPrice - priceRange * level;
        const color = FIBO_COLORS[level] ?? "#787b86";
        const pct = (level * 100).toFixed(1);

        return (
          <g key={level}>
            <line
              x1={left - 20}
              y1={y}
              x2={right + 120}
              y2={y}
              stroke={color}
              strokeWidth={level === 0 || level === 1 ? 1.5 : 1}
              strokeDasharray={level === 0.5 ? "6 3" : "none"}
              opacity={isPreview ? 0.5 : 0.8}
            />
            <text
              x={right + 125}
              y={y + 4}
              fill={color}
              fontSize={10}
              fontFamily="monospace"
            >
              {pct}% — {formatPrice(price)}
            </text>
          </g>
        );
      })}

      {/* Connecting line between the two points */}
      <line
        x1={aX}
        y1={aY}
        x2={bX}
        y2={bY}
        stroke="#2196f3"
        strokeWidth={1}
        strokeDasharray="4 2"
        opacity={isPreview ? 0.4 : 0.6}
      />
    </svg>
  );
}
