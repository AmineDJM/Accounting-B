import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Finly — la comptabilité crypto, pays par pays", template: "%s · Finly" },
  description:
    "Finly transforme l'historique d'un compte d'échange en écritures comptables, en fichier d'audit et en impôt calculé sous les règles du pays du dossier — France, Belgique, Allemagne, Autriche, Pays-Bas, Espagne, Italie, Portugal, Suisse et le Golfe. Rapprochement DAC8 et explicabilité de chaque montant.",
  applicationName: "Finly",
  keywords: ["comptabilité crypto", "FEC", "DAC8", "CARF", "DATEV", "SAF-T", "XAF", "expert-comptable", "plus-values crypto"],
};

/** The tab strip follows the page, so the chrome stops fighting the design. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
