"use client";

export type ShapeAnchor = "a" | "b" | "a2" | "b2" | "mt" | "mb";

interface ShapeAnchorsProps {
  points: { key: ShapeAnchor; x: number; y: number }[];
  color: string;
  opacity?: number;
  /** When set, anchors are draggable */
  onPointerDown?: (anchor: ShapeAnchor, e: React.PointerEvent) => void;
}

export function ShapeAnchors({ points, color, opacity = 1, onPointerDown }: ShapeAnchorsProps) {
  return (
    <>
      {points.map((p) => (
        <circle
          key={p.key}
          cx={p.x}
          cy={p.y}
          r={5}
          fill="#ffffff"
          stroke={color}
          strokeWidth={2}
          opacity={opacity}
          style={{ pointerEvents: onPointerDown ? "all" : "none", cursor: "grab" }}
          onPointerDown={(e) => onPointerDown?.(p.key, e)}
        />
      ))}
    </>
  );
}
