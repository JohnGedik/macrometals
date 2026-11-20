import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { JsonLd } from "@/components/json-ld";
import { getLocale } from "@/lib/locale";
import { absoluteUrl, getSiteUrl } from "@/lib/seo";
import { Analytics } from "@vercel/analytics/next";
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
    metadataBase: new URL(getSiteUrl()),
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
  const organization = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": absoluteUrl("/#organization"),
        name: "Macro Metals Monitor",
        url: absoluteUrl("/"),
        logo: absoluteUrl("/macro-metals-compass.svg"),
      },
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        url: absoluteUrl("/"),
        name: "Macro Metals Monitor",
        publisher: { "@id": absoluteUrl("/#organization") },
        inLanguage: locale,
      },
    ],
  };

  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body>
        <JsonLd value={organization} />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
