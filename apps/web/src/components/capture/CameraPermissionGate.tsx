"use client";

import { Camera, ShieldAlert, AlertTriangle } from "lucide-react";
import { Button } from "../ui/Button";

interface CameraPermissionGateProps {
  isActive: boolean;
  error: string | null;
  onRequestPermission: () => void;
  children: React.ReactNode;
}

export function CameraPermissionGate({
  isActive,
  error,
  onRequestPermission,
  children,
}: CameraPermissionGateProps) {
  if (isActive) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      {error ? (
        <>
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 mb-2">Accès caméra requis</h2>
            <p className="text-zinc-400 max-w-md">{error}</p>
          </div>
          <Button variant="secondary" onClick={onRequestPermission}>
            Réessayer
          </Button>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center">
            <Camera className="w-8 h-8 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 mb-2">Accès à la caméra</h2>
            <p className="text-zinc-400 max-w-md">
              Valk a besoin de votre caméra frontale pour analyser vos yeux.
              Aucune image ne quitte votre appareil.
            </p>
          </div>
          <Button onClick={onRequestPermission}>
            <Camera className="w-4 h-4" />
            Autoriser la caméra
          </Button>
          <p className="text-xs text-zinc-500">
            Le traitement est entièrement local. Seules des données numériques sont envoyées pour l'analyse.
          </p>
        </>
      )}
    </div>
  );
}
