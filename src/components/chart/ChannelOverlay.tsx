"use client";

export type ChannelAnchor = "a" | "b" | "a2" | "b2" | "mt" | "mb";

interface ChannelOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  /** Vertical offset (px) of the parallel line; null while the width isn't set yet */
  dY: number | null;
  isPreview: boolean;
  selected: boolean;
  onAnchorPointerDown?: (anchor: ChannelAnchor, e: React.PointerEvent) => void;
}

const CHANNEL_COLOR = "#2962ff";
const CHANNEL_FILL = "rgba(41, 98, 255, 0.15)";

export function ChannelOverlay({
  aX,
  aY,
  bX,
  bY,
  dY,
  isPreview,
  selected,
  onAnchorPointerDown,
}: ChannelOverlayProps) {
  const opacity = isPreview ? 0.7 : 1;
  const dash = isPreview ? "6 3" : "none";
  const hasWidth = dY !== null;
  const d = dY ?? 0;
  const mX = (aX + bX) / 2;
  const mY = (aY + bY) / 2;

  const anchors: { key: ChannelAnchor; x: number; y: number }[] = [
    { key: "a", x: aX, y: aY },
    { key: "b", x: bX, y: bY },
  ];
  if (hasWidth) {
    anchors.push(
      { key: "a2", x: aX, y: aY + d },
      { key: "b2", x: bX, y: bY + d },
      { key: "mt", x: mX, y: mY },
      { key: "mb", x: mX, y: mY + d },
    );
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      {hasWidth && (
        <polygon
          points={`${aX},${aY} ${bX},${bY} ${bX},${bY + d} ${aX},${aY + d}`}
          fill={CHANNEL_FILL}
          opacity={opacity}
        />
      )}

      <line x1={aX} y1={aY} x2={bX} y2={bY} stroke={CHANNEL_COLOR} strokeWidth={2} strokeDasharray={dash} opacity={opacity} />

      {hasWidth && (
        <>
          <line x1={aX} y1={aY + d} x2={bX} y2={bY + d} stroke={CHANNEL_COLOR} strokeWidth={2} strokeDasharray={dash} opacity={opacity} />
          <line
            x1={aX}
            y1={aY + d / 2}
            x2={bX}
            y2={bY + d / 2}
            stroke={CHANNEL_COLOR}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={opacity * 0.6}
          />
        </>
      )}

      {(selected || isPreview) &&
        anchors.map((p) => (
          <circle
            key={p.key}
            cx={p.x}
            cy={p.y}
            r={5}
            fill="#ffffff"
            stroke={CHANNEL_COLOR}
            strokeWidth={2}
            opacity={opacity}
            style={{ pointerEvents: onAnchorPointerDown && !isPreview ? "all" : "none", cursor: "grab" }}
            onPointerDown={(e) => onAnchorPointerDown?.(p.key, e)}
          />
        ))}
    </svg>
  );
}
