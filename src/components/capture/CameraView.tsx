"use client";

import { forwardRef } from "react";

interface CameraViewProps {
  className?: string;
  mirrored?: boolean;
}

export const CameraView = forwardRef<HTMLVideoElement, CameraViewProps>(
  ({ className = "", mirrored = true }, ref) => {
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-black ${className}`}>
        <video
          ref={ref}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
        />
      </div>
    );
  }
);
CameraView.displayName = "CameraView";
