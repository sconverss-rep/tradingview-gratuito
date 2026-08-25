"use client";

interface RectangleOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  isPreview: boolean;
}

const RECT_COLOR = "#2962ff";
const RECT_FILL = "rgba(41, 98, 255, 0.12)";

export function RectangleOverlay({ aX, aY, bX, bY, isPreview }: RectangleOverlayProps) {
  const opacity = isPreview ? 0.6 : 1;
  const left = Math.min(aX, bX);
  const top = Math.min(aY, bY);
  const width = Math.abs(bX - aX);
  const height = Math.abs(bY - aY);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        fill={RECT_FILL}
        stroke={RECT_COLOR}
        strokeWidth={1.5}
        strokeDasharray={isPreview ? "6 3" : "none"}
        opacity={opacity}
      />
      <circle cx={aX} cy={aY} r={4} fill="#131722" stroke={RECT_COLOR} strokeWidth={1.5} opacity={opacity} />
      <circle cx={bX} cy={bY} r={4} fill="#131722" stroke={RECT_COLOR} strokeWidth={1.5} opacity={opacity} />
    </svg>
  );
}
