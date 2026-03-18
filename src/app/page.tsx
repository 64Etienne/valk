import Link from "next/link";
import {
  Eye,
  Camera,
  Shield,
  BarChart3,
  AlertTriangle,
  Brain,
  Activity,
  Heart,
  ArrowRight,
  Scan,
} from "lucide-react";

const steps = [
  {
    icon: Camera,
    title: "Capture guidée",
    description: "12 secondes de capture vidéo guidée de vos yeux",
  },
  {
    icon: Shield,
    title: "Traitement local",
    description: "Analyse côté client. Aucune image ne quitte votre appareil",
  },
  {
    icon: BarChart3,
    title: "Résultats IA",
    description: "Interprétation scientifique par intelligence artificielle",
  },
];

const analyses = [
  {
    icon: Eye,
    title: "Fatigue",
    description: "PERCLOS, clignements",
  },
  {
    icon: Scan,
    title: "Réflexe pupillaire",
    description: "Réponse à la lumière",
  },
  {
    icon: Activity,
    title: "Nystagmus",
    description: "Mouvements involontaires",
  },
  {
    icon: Heart,
    title: "Santé oculaire",
    description: "Indicateurs visuels",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-[family-name:var(--font-inter)]">
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-20 md:pt-36 md:pb-28">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-6 flex items-center gap-3">
            <Eye className="h-10 w-10 text-violet-500 md:h-12 md:w-12" strokeWidth={1.5} />
            <Brain className="h-6 w-6 text-violet-400/60" strokeWidth={1.5} />
          </div>

          <h1 className="text-6xl font-bold tracking-tight md:text-8xl">
            <span className="bg-gradient-to-b from-violet-400 to-violet-600 bg-clip-text text-transparent">
              Valk
            </span>
          </h1>

          <p className="mt-4 text-lg font-medium tracking-wide text-violet-400 uppercase md:text-xl">
            Analyse oculaire par IA
          </p>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-zinc-400 md:text-lg">
            Évaluez la fatigue, les réflexes pupillaires et la santé oculaire
            en quelques secondes.{" "}
            <span className="text-zinc-300">
              Aucune image ne quitte votre appareil.
            </span>
          </p>

          <Link
            href="/capture"
            className="group mt-10 inline-flex items-center gap-2 rounded-full bg-violet-600 px-8 py-3.5 text-base font-semibold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98]"
          >
            Commencer l&apos;analyse
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-center text-sm font-semibold tracking-widest text-violet-400 uppercase">
            Comment ça marche
          </h2>
          <p className="mx-auto mb-12 max-w-md text-center text-zinc-500 md:mb-16">
            Trois étapes simples, entièrement côté client
          </p>

          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="group relative rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-colors duration-200 hover:border-zinc-700 md:p-8"
              >
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 transition-colors duration-200 group-hover:bg-violet-500/15">
                    <step.icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <span className="text-sm font-medium text-zinc-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-100">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Science Overview Section */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-center text-sm font-semibold tracking-widest text-violet-400 uppercase">
            Ce qui est analysé
          </h2>
          <p className="mx-auto mb-12 max-w-md text-center text-zinc-500 md:mb-16">
            Fondé sur la littérature scientifique en ophtalmologie et neurologie
          </p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {analyses.map((item) => (
              <div
                key={item.title}
                className="group flex flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center transition-colors duration-200 hover:border-zinc-700 md:p-6"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-400 transition-colors duration-200 group-hover:bg-violet-500/15">
                  <item.icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-zinc-100 md:text-base">
                  {item.title}
                </h3>
                <p className="text-xs leading-relaxed text-zinc-500 md:text-sm">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer Banner */}
      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 md:p-8">
          <div className="flex gap-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" strokeWidth={1.8} />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-amber-300">
                Avertissement
              </h3>
              <p className="text-sm leading-relaxed text-zinc-400">
                Valk est un outil <strong className="text-zinc-300">éducatif et informatif</strong>.
                Ce n&apos;est <strong className="text-zinc-300">PAS</strong> un
                dispositif médical et il ne remplace en aucun cas l&apos;avis
                d&apos;un professionnel de santé. Les résultats fournis sont
                indicatifs et ne constituent pas un diagnostic.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/60 px-6 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-zinc-500">
            Un projet éducatif
            <span className="mx-2 text-zinc-700">&bull;</span>
            <Link
              href="/about"
              className="text-zinc-400 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-violet-400 hover:decoration-violet-400/40"
            >
              Méthodologie
            </Link>
          </p>
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} Valk
          </p>
        </div>
      </footer>
    </div>
  );
}
