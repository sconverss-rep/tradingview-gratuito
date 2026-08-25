"use client";

interface TrendLineOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  isPreview: boolean;
}

const LINE_COLOR = "#2962ff";

export function TrendLineOverlay({ aX, aY, bX, bY, isPreview }: TrendLineOverlayProps) {
  const opacity = isPreview ? 0.6 : 1;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      <line
        x1={aX}
        y1={aY}
        x2={bX}
        y2={bY}
        stroke={LINE_COLOR}
        strokeWidth={2}
        strokeDasharray={isPreview ? "6 3" : "none"}
        opacity={opacity}
        strokeLinecap="round"
      />
      <circle cx={aX} cy={aY} r={4} fill="#131722" stroke={LINE_COLOR} strokeWidth={1.5} opacity={opacity} />
      <circle cx={bX} cy={bY} r={4} fill="#131722" stroke={LINE_COLOR} strokeWidth={1.5} opacity={opacity} />
    </svg>
  );
}
