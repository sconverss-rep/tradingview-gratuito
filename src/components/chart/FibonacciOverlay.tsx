"use client";

import { formatPrice } from "@/lib/format";
import { ShapeAnchors, type ShapeAnchor } from "./ShapeAnchors";

// TradingView-style retracement: 0 sits on the 2nd click, 1 on the 1st click,
// extension levels continue past 1.
export const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236];
const FIBO_COLORS: Record<number, string> = {
  0: "#787b86",
  0.236: "#f23645",
  0.382: "#ff9800",
  0.5: "#4caf50",
  0.618: "#089981",
  0.786: "#00bcd4",
  1: "#787b86",
  1.618: "#2962ff",
  2.618: "#f23645",
  3.618: "#9c27b0",
  4.236: "#e91e63",
};

interface FibonacciOverlayProps {
  /** First click (level 1) */
  aX: number;
  aY: number;
  aPrice: number;
  /** Second click (level 0) */
  bX: number;
  bY: number;
  bPrice: number;
  isPreview: boolean;
  selected: boolean;
  onAnchorPointerDown?: (anchor: ShapeAnchor, e: React.PointerEvent) => void;
}

export function FibonacciOverlay({
  aX,
  aY,
  aPrice,
  bX,
  bY,
  bPrice,
  isPreview,
  selected,
  onAnchorPointerDown,
}: FibonacciOverlayProps) {
  const left = Math.min(aX, bX);
  const right = Math.max(aX, bX);
  const levelY = (level: number) => bY + (aY - bY) * level;
  const levelPrice = (level: number) => bPrice + (aPrice - bPrice) * level;
  const fade = isPreview ? 0.6 : 1;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      {/* Bands between consecutive levels, tinted with the farther level's color */}
      {FIBO_LEVELS.slice(0, -1).map((level, i) => {
        const next = FIBO_LEVELS[i + 1];
        const y0 = levelY(level);
        const y1 = levelY(next);
        return (
          <rect
            key={`band-${level}`}
            x={left}
            y={Math.min(y0, y1)}
            width={right - left}
            height={Math.abs(y1 - y0)}
            fill={FIBO_COLORS[next]}
            opacity={0.2 * fade}
          />
        );
      })}

      {FIBO_LEVELS.map((level) => {
        const y = levelY(level);
        const color = FIBO_COLORS[level];
        return (
          <g key={level} opacity={fade}>
            <line x1={left} y1={y} x2={right} y2={y} stroke={color} strokeWidth={1.5} />
            <text
              x={left - 8}
              y={y}
              fill={color}
              fontSize={12}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              textAnchor="end"
              dominantBaseline="central"
            >
              {level} ({formatPrice(levelPrice(level))})
            </text>
          </g>
        );
      })}

      {/* Trend line between the two anchors */}
      <line
        x1={aX}
        y1={aY}
        x2={bX}
        y2={bY}
        stroke="#787b86"
        strokeWidth={1.5}
        strokeDasharray="7 6"
        opacity={fade}
      />

      {(selected || isPreview) && (
        <ShapeAnchors
          color="#2962ff"
          opacity={fade}
          onPointerDown={isPreview ? undefined : onAnchorPointerDown}
          points={[
            { key: "a", x: aX, y: aY },
            { key: "b", x: bX, y: bY },
            ...(isPreview ? [] : [{ key: "mt" as const, x: (aX + bX) / 2, y: (aY + bY) / 2 }]),
          ]}
        />
      )}
    </svg>
  );
}
