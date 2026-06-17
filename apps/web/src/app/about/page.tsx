import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { ArrowLeft, Shield, BookOpen, FlaskConical, AlertTriangle, Eye } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-violet-400 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Link>
          <h1 className="text-3xl font-bold text-zinc-100">Méthodologie</h1>
          <p className="text-zinc-400 mt-2">Comment Valk analyse vos données oculaires</p>
        </div>

        {/* Privacy */}
        <Card>
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Vie privée</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Valk traite toutes les images localement sur votre appareil via MediaPipe Face Landmarker.
                Aucune image, aucune vidéo ne quitte jamais votre appareil. Seules des mesures numériques
                (environ 10 Ko de JSON) sont envoyées au serveur pour interprétation par IA.
              </p>
            </div>
          </div>
        </Card>

        {/* Protocol */}
        <Card>
          <div className="flex items-start gap-3">
            <Eye className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Protocole de capture</h2>
              <div className="space-y-3 text-sm text-zinc-400">
                <div>
                  <h3 className="text-zinc-200 font-medium">Phase 1 — Baseline (3s)</h3>
                  <p>Regard fixe sur un point central. Mesure : taille des pupilles, couleur sclérale, ouverture des paupières, fréquence des clignements.</p>
                </div>
                <div>
                  <h3 className="text-zinc-200 font-medium">Phase 2 — Réflexe lumineux (5s)</h3>
                  <p>Flash lumineux via écran blanc suivi de récupération en noir. Mesure : latence de constriction, amplitude, vitesse, temps de re-dilatation (PLR).</p>
                </div>
                <div>
                  <h3 className="text-zinc-200 font-medium">Phase 3 — Poursuite oculaire (5s)</h3>
                  <p>Suivi d&apos;un point mobile horizontal. Mesure : gain de poursuite lisse, comptage de saccades, indices de nystagmus (HGN).</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Scientific basis */}
        <Card>
          <div className="flex items-start gap-3">
            <FlaskConical className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Bases scientifiques</h2>
              <div className="space-y-2 text-sm text-zinc-400">
                {[
                  { measure: "Rougeur sclérale", method: "Analyse couleur LAB (canal a*)", ref: "PMC3949462", confidence: "Haute" },
                  { measure: "Jaunissement scléral", method: "Analyse couleur LAB (canal b*)", ref: "AI neonatal jaundice detection", confidence: "Haute" },
                  { measure: "PERCLOS (fatigue)", method: "% temps yeux >80% fermés", ref: "NHTSA/FHWA 1994", confidence: "Haute" },
                  { measure: "Fréquence clignements", method: "Eye Aspect Ratio (EAR)", ref: "Stern et al. 1994", confidence: "Modérée-Haute" },
                  { measure: "Réflexe pupillaire", method: "Flash écran + mesure constriction", ref: "IACP DRE protocol", confidence: "Modérée-Haute" },
                  { measure: "Taille pupillaire", method: "Iris landmarks MediaPipe", ref: "DRE protocol", confidence: "Modérée" },
                  { measure: "Nystagmus (HGN)", method: "Suivi point mobile + oscillations", ref: "Burns & Moskowitz 1977", confidence: "Modérée" },
                  { measure: "Hippus pupillaire", method: "FFT sur série temporelle", ref: "MDPI Bioengineering 2023", confidence: "Modérée" },
                ].map(({ measure, method, ref, confidence }) => (
                  <div key={measure} className="grid grid-cols-[1fr_1fr_auto] gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-200">{measure}</span>
                    <span>{method}</span>
                    <span className="text-violet-400 text-xs">{confidence}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* What we don't do */}
        <Card>
          <div className="flex items-start gap-3">
            <BookOpen className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Ce que Valk ne fait PAS</h2>
              <ul className="space-y-1 text-sm text-zinc-400">
                <li>• Iridologie (pseudoscience)</li>
                <li>• Couleur d&apos;iris → personnalité (pseudoscience)</li>
                <li>• Diagnostic médical définitif</li>
                <li>• Remplacement d&apos;un examen médical professionnel</li>
                <li>• Mesure précise d&apos;alcoolémie (seul un éthylotest certifié le peut)</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Disclaimer */}
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="font-medium text-amber-400">Avertissement : </span>
              Valk est un outil éducatif et informatif. Ce n&apos;est PAS un dispositif médical, PAS un
              éthylotest, PAS un outil de diagnostic. Les résultats ne doivent PAS être utilisés pour des
              décisions médicales, légales ou de sécurité. Ne conduisez jamais si vous suspectez une
              altération de vos capacités, quel que soit le résultat affiché.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
