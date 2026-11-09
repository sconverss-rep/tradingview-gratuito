"use client";

import { ShapeAnchors, type ShapeAnchor } from "./ShapeAnchors";

interface RectangleOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  isPreview: boolean;
  selected: boolean;
  onAnchorPointerDown?: (anchor: ShapeAnchor, e: React.PointerEvent) => void;
}

const RECT_COLOR = "#2962ff";
const RECT_FILL = "rgba(41, 98, 255, 0.12)";

export function RectangleOverlay({
  aX,
  aY,
  bX,
  bY,
  isPreview,
  selected,
  onAnchorPointerDown,
}: RectangleOverlayProps) {
  const opacity = isPreview ? 0.7 : 1;
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
      {(selected || isPreview) && (
        <ShapeAnchors
          color={RECT_COLOR}
          opacity={opacity}
          onPointerDown={isPreview ? undefined : onAnchorPointerDown}
          points={[
            { key: "a", x: aX, y: aY },
            { key: "b", x: bX, y: bY },
            ...(isPreview
              ? []
              : [
                  { key: "a2" as const, x: aX, y: bY },
                  { key: "b2" as const, x: bX, y: aY },
                  { key: "mt" as const, x: (aX + bX) / 2, y: (aY + bY) / 2 },
                ]),
          ]}
        />
      )}
    </svg>
  );
}
