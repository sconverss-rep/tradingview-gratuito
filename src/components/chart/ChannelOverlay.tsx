"use client";

interface ChannelOverlayProps {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  cX: number | null;
  cY: number | null;
  isPreview: boolean;
}

const CHANNEL_COLOR = "#2196f3";
const CHANNEL_FILL = "rgba(33, 150, 243, 0.08)";

export function ChannelOverlay({
  aX,
  aY,
  bX,
  bY,
  cX,
  cY,
  isPreview,
}: ChannelOverlayProps) {
  const opacity = isPreview ? 0.5 : 0.8;

  // Base line: A → B
  // If C is set, the parallel line is offset by the perpendicular distance from C to AB
  const hasThirdPoint = cX !== null && cY !== null;

  // Compute the offset for the parallel line
  let dX = 0;
  let dY = 0;
  if (hasThirdPoint && cX !== null && cY !== null) {
    // The offset is simply the perpendicular projection of C onto the AB direction
    // For a parallel channel, we shift AB by the vector from the AB line to C
    const abX = bX - aX;
    const abY = bY - aY;
    const abLen = Math.sqrt(abX * abX + abY * abY);

    if (abLen > 0) {
      // Normal vector (perpendicular to AB)
      const nX = -abY / abLen;
      const nY = abX / abLen;

      // Vector from A to C
      const acX = cX - aX;
      const acY = cY - aY;

      // Project AC onto the normal to get the perpendicular distance
      const dist = acX * nX + acY * nY;

      dX = nX * dist;
      dY = nY * dist;
    }
  }

  // Extended line points (extend beyond A and B for visual effect)
  const extendFactor = 0.3;
  const dirX = bX - aX;
  const dirY = bY - aY;

  const eaX = aX - dirX * extendFactor;
  const eaY = aY - dirY * extendFactor;
  const ebX = bX + dirX * extendFactor;
  const ebY = bY + dirY * extendFactor;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      style={{ overflow: "visible" }}
    >
      {/* Fill between lines */}
      {hasThirdPoint && (
        <polygon
          points={`${eaX},${eaY} ${ebX},${ebY} ${ebX + dX},${ebY + dY} ${eaX + dX},${eaY + dY}`}
          fill={CHANNEL_FILL}
          opacity={opacity}
        />
      )}

      {/* Base line A→B */}
      <line
        x1={eaX}
        y1={eaY}
        x2={ebX}
        y2={ebY}
        stroke={CHANNEL_COLOR}
        strokeWidth={1.5}
        opacity={opacity}
        strokeDasharray={isPreview ? "6 3" : "none"}
      />

      {/* Parallel line (offset by perpendicular distance to C) */}
      {hasThirdPoint && (
        <line
          x1={eaX + dX}
          y1={eaY + dY}
          x2={ebX + dX}
          y2={ebY + dY}
          stroke={CHANNEL_COLOR}
          strokeWidth={1.5}
          opacity={opacity}
          strokeDasharray={isPreview ? "6 3" : "none"}
        />
      )}

      {/* Center / median line */}
      {hasThirdPoint && (
        <line
          x1={eaX + dX / 2}
          y1={eaY + dY / 2}
          x2={ebX + dX / 2}
          y2={ebY + dY / 2}
          stroke={CHANNEL_COLOR}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={opacity * 0.5}
        />
      )}

      {/* Point markers */}
      <circle cx={aX} cy={aY} r={3} fill={CHANNEL_COLOR} opacity={opacity} />
      <circle cx={bX} cy={bY} r={3} fill={CHANNEL_COLOR} opacity={opacity} />
      {hasThirdPoint && cX !== null && cY !== null && (
        <circle cx={cX} cy={cY} r={3} fill={CHANNEL_COLOR} opacity={opacity} />
      )}
    </svg>
  );
}
