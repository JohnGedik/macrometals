import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isTurkish = locale === "tr";

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: {
      default: isTurkish ? "Macro Metals Monitor | Piyasanın sinyallerini okuyun" : "Macro Metals Monitor | Read the signal",
      template: "%s | Macro Metals Monitor",
    },
    description: isTurkish
      ? "Altın, gümüş, petrol ve aralarındaki ilişkiler üzerinden bağımsız makroekonomi analizleri."
      : "Independent macro analysis through gold, silver, oil, and the relationships between them.",
    openGraph: {
      siteName: "Macro Metals Monitor",
      type: "website",
      locale: isTurkish ? "tr_TR" : "en_US",
    },
    twitter: { card: "summary_large_image" },
    icons: {
      icon: "/macro-metals-compass.svg",
      apple: "/macro-metals-compass.svg",
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
