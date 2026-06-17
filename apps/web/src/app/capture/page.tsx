"use client";

import dynamic from "next/dynamic";

const GuidedCapture = dynamic(
  () => import("@/components/capture/GuidedCapture").then((m) => m.GuidedCapture),
  { ssr: false, loading: () => (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-zinc-400 mt-4 text-sm">Chargement...</p>
      </div>
    </div>
  )}
);

export default function CapturePage() {
  return <GuidedCapture />;
}
