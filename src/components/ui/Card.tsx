import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ hover, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900 p-6 ${hover ? "transition-colors hover:bg-zinc-800/80 hover:border-zinc-700" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
