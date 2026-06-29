import Link from "next/link";
import { isAuthorizedKey } from "@/lib/observability/auth";
import { getStore } from "@/lib/observability/db";
import { AnalyzeButton } from "./AnalyzeButton";
import { GazeChart } from "./GazeChart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LEVEL_STYLES: Record<string, string> = {
  trace: "bg-zinc-700/40 text-zinc-300 ring-zinc-600/40",
  debug: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  info: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  error: "bg-red-500/20 text-red-300 ring-red-500/40",
};

function rel(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `il y a ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.round(m / 60)} h`;
}

function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0b0b12] text-zinc-200">
      <meta name="referrer" content="no-referrer" />
      <div className="mx-auto max-w-6xl px-6 pt-8 pb-28">
        <header className="mb-8 flex items-baseline justify-between border-b border-white/10 pb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-violet-300">
              Valk <span className="text-zinc-500">·</span> Observabilité
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Logs locaux (SQLite) — boîte noire de l&apos;app
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400 ring-1 ring-white/10">
            /debug
          </span>
        </header>
        {children}
      </div>
    </main>
  );
}

function Unauthorized() {
  return (
    <Shell>
      <div className="mx-auto mt-24 max-w-md rounded-2xl bg-white/5 p-8 text-center ring-1 ring-white/10">
        <p className="text-lg font-semibold text-zinc-200">401 — clé requise</p>
        <p className="mt-2 text-sm text-zinc-500">
          Ajoute <code className="rounded bg-black/40 px-1.5 py-0.5 text-violet-300">?key=…</code> à l&apos;URL
          (valeur de <code className="text-zinc-400">VALK_DEBUG_KEY</code>).
        </p>
      </div>
    </Shell>
  );
}

export default async function DebugPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; sid?: string }>;
}) {
  const { key, sid } = await searchParams;
  if (!isAuthorizedKey(key)) return <Unauthorized />;

  const store = getStore();
  const sessions = store.listSessions();
  const logs = sid ? store.getSessionLogs(sid) : [];
  const captures = store.listCaptures();
  const keyParam = encodeURIComponent(key ?? "");
  const href = (s: string) => `/debug?key=${keyParam}&sid=${encodeURIComponent(s)}`;

  return (
    <Shell>
      {captures.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Captures ({captures.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {captures.map((c) => (
              <div key={c.id} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-zinc-300">{c.id}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${
                      c.timeMap?.status === "verified"
                        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                        : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                    }`}
                  >
                    {c.timeMap?.status ?? "—"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>{c.size != null ? (c.size / (1024 * 1024)).toFixed(1) + " Mo" : "—"}</span>
                  {c.timeMap && (
                    <span className="font-mono">
                      a={c.timeMap.a.toFixed(3)} b={c.timeMap.b.toFixed(0)}
                    </span>
                  )}
                  <span>{rel(c.createdAt)}</span>
                </div>
                <a
                  href={`/api/captures/${encodeURIComponent(c.id)}/clip?key=${keyParam}`}
                  className="mt-2 inline-block text-xs text-violet-300 hover:underline"
                >
                  ▶ clip
                </a>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <AnalyzeButton id={c.id} keyParam={keyParam} />
                  {c.analysis && (
                    <span className="text-xs text-zinc-400">
                      sync {c.analysis.status} · r={c.analysis.r.toFixed(2)} · visage{" "}
                      {c.analysis.facePct.toFixed(0)}%
                      {c.analysis.signFlipped ? " · signe auto-aligné" : ""}
                    </span>
                  )}
                </div>
                {c.analysis && c.analysis.points.length > 0 && (
                  <div className="mt-2">
                    <GazeChart signal={c.analysis} />
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                      <span>
                        <span style={{ color: "#a78bfa" }}>■</span> stimulus
                      </span>
                      <span>
                        <span style={{ color: "#2dd4bf" }}>■</span> regard
                      </span>
                      <a
                        className="text-violet-300 hover:underline"
                        href={`/api/captures/${encodeURIComponent(c.id)}/overlay?key=${keyParam}`}
                      >
                        ▶ overlay
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        {/* Sessions */}
        <aside className="space-y-2">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Sessions ({sessions.length})
          </h2>
          {sessions.length === 0 && (
            <p className="rounded-xl bg-white/5 px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-white/10">
              Aucune session pour l&apos;instant.
            </p>
          )}
          {sessions.map((s) => {
            const active = s.sessionId === sid;
            return (
              <Link
                key={s.sessionId}
                href={href(s.sessionId)}
                className={`block rounded-xl px-4 py-3 ring-1 transition ${
                  active
                    ? "bg-violet-500/15 ring-violet-500/40"
                    : "bg-white/5 ring-white/10 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm text-zinc-200">{s.sessionId}</span>
                  <span className="shrink-0 rounded-full bg-black/30 px-2 py-0.5 text-xs text-zinc-400">
                    {s.logCount}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-zinc-400">
                    {s.device.platform}/{s.device.runtime}
                  </span>
                  <span>{rel(s.lastSeen)}</span>
                </div>
              </Link>
            );
          })}
        </aside>

        {/* Logs */}
        <section className="min-w-0">
          {!sid ? (
            <div className="flex h-full min-h-48 items-center justify-center rounded-2xl bg-white/5 text-sm text-zinc-500 ring-1 ring-white/10">
              Sélectionne une session pour voir ses logs.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between bg-white/5 px-4 py-3">
                <h2 className="font-mono text-sm text-zinc-300">{sid}</h2>
                <span className="text-xs text-zinc-500">{logs.length} entrées</span>
              </div>
              <div className="divide-y divide-white/5">
                {logs.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">Aucun log.</p>
                )}
                {logs.map((l) => (
                  <div key={l.id} className="grid grid-cols-[5.5rem_4rem_1fr] items-start gap-3 px-4 py-2 font-mono text-xs">
                    <span className="tabular-nums text-zinc-500">{clock(l.tsWall)}</span>
                    <span
                      className={`justify-self-start rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${
                        LEVEL_STYLES[l.level] ?? LEVEL_STYLES.info
                      }`}
                    >
                      {l.level}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-zinc-500">{l.category}</span>
                        <span className="text-zinc-100">{l.message}</span>
                      </div>
                      {l.data !== undefined && (
                        <pre className="mt-1 overflow-x-auto rounded bg-black/40 px-2 py-1 text-[11px] text-zinc-400">
                          {JSON.stringify(l.data)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
