"use client";

import { Sun, Smartphone, Glasses, Monitor, Hand } from "lucide-react";
import { Button } from "../ui/Button";

interface CaptureInstructionsProps {
  onReady: () => void;
}

const instructions = [
  {
    icon: Sun,
    text: "Placez-vous dans un endroit bien éclairé et réglez la luminosité de l'écran au maximum",
    color: "text-amber-400",
  },
  {
    icon: Monitor,
    text: "Désactivez le filtre de lumière bleue (Night Shift, mode nuit)",
    color: "text-blue-400",
  },
  {
    icon: Glasses,
    text: "Retirez vos lunettes si possible",
    color: "text-violet-400",
  },
  {
    icon: Smartphone,
    text: "Tenez votre appareil à 20-30 cm de votre visage, caméra à hauteur des yeux",
    color: "text-green-400",
  },
  {
    icon: Hand,
    text: "Restez immobile pendant toute la capture (~35 secondes)",
    color: "text-zinc-300",
  },
];

export function CaptureInstructions({ onReady }: CaptureInstructionsProps) {
  return (
    <div className="absolute inset-0 bg-zinc-950/95 z-20 flex items-center justify-center overflow-y-auto">
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">
            Préparez la capture
          </h2>
          <p className="text-sm text-zinc-400">
            Pour des résultats fiables, suivez ces consignes :
          </p>
        </div>

        <ul className="space-y-4">
          {instructions.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <item.icon
                className={`w-5 h-5 mt-0.5 flex-shrink-0 ${item.color}`}
              />
              <span className="text-sm text-zinc-300">{item.text}</span>
            </li>
          ))}
        </ul>

        <Button onClick={onReady} size="lg" className="w-full">
          Je suis prêt(e)
        </Button>
      </div>
    </div>
  );
}
