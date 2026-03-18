"use client";

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

function getColor(score: number): string {
  if (score <= 25) return "#22c55e";
  if (score <= 50) return "#f59e0b";
  if (score <= 75) return "#f97316";
  return "#ef4444";
}

export function ScoreGauge({ score, size = 120 }: ScoreGaugeProps) {
  const radius = 45;
  const circumference = Math.PI * radius;
  const progress = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const color = getColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox="0 0 100 60">
        {/* Background arc */}
        <path
          d="M 5 55 A 45 45 0 0 1 95 55"
          fill="none"
          stroke="#27272a"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d="M 5 55 A 45 45 0 0 1 95 55"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="text-2xl font-bold -mt-2" style={{ color }}>{score}</span>
    </div>
  );
}
