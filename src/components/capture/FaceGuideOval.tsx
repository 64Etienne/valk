"use client";

interface FaceGuideOvalProps {
  detected: boolean;
}

export function FaceGuideOval({ detected }: FaceGuideOvalProps) {
  const color = detected ? "#22c55e" : "#f59e0b";
  const glowColor = detected
    ? "rgba(34, 197, 94, 0.15)"
    : "rgba(245, 158, 11, 0.1)";

  return (
    <svg
      viewBox="0 0 200 280"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ width: "55vmin", height: "77vmin", maxWidth: 340, maxHeight: 476 }}
    >
      <ellipse
        cx="100"
        cy="140"
        rx="80"
        ry="120"
        fill={glowColor}
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={detected ? "none" : "8 6"}
        className="transition-all duration-300"
      />
      {/* Eye-level markers */}
      <line
        x1="40" y1="120" x2="60" y2="120"
        stroke={color} strokeWidth="1.5" opacity="0.5"
      />
      <line
        x1="140" y1="120" x2="160" y2="120"
        stroke={color} strokeWidth="1.5" opacity="0.5"
      />
    </svg>
  );
}
