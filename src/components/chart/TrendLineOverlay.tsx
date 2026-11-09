"use client";

import { ShapeAnchors, type ShapeAnchor } from "./ShapeAnchors";

interface TrendLineOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  isPreview: boolean;
  selected: boolean;
  onAnchorPointerDown?: (anchor: ShapeAnchor, e: React.PointerEvent) => void;
}

const LINE_COLOR = "#2962ff";

export function TrendLineOverlay({
  aX,
  aY,
  bX,
  bY,
  isPreview,
  selected,
  onAnchorPointerDown,
}: TrendLineOverlayProps) {
  const opacity = isPreview ? 0.7 : 1;

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
      {(selected || isPreview) && (
        <ShapeAnchors
          color={LINE_COLOR}
          opacity={opacity}
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
