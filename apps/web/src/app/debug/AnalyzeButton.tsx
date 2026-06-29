"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnalyzeButton({ id, keyParam }: { id: string; keyParam: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/captures/${encodeURIComponent(id)}/analyze?key=${keyParam}`, { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-200 ring-1 ring-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
    >
      {busy ? "Analyse…" : "Analyser"}
    </button>
  );
}
