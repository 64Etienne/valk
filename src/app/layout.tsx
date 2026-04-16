import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const inter = localFont({
  src: [
    {
      path: "./fonts/inter-var.woff2",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Valk — Analyse Oculaire par IA",
  description: "Analyse physiologique des yeux par IA. Aucune image ne quitte votre appareil.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Valk — Analyse Oculaire par IA",
    description: "Analyse physiologique des yeux par IA. Zéro image uploadée.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.variable} antialiased min-h-screen`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
