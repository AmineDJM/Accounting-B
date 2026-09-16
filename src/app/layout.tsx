import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Chainbook — comptabilité crypto au format FEC", template: "%s · Chainbook" },
  description: "Importez vos comptes d'échange crypto, valorisez chaque opération en euros, générez un journal comptable conforme au PCG et un FEC prêt pour votre expert-comptable. Régime particulier (150 VH bis) inclus.",
  applicationName: "Chainbook",
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
