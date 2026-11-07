import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Macro Metals Monitor | Read the signal",
    template: "%s | Macro Metals Monitor",
  },
  description:
    "Independent macro analysis through gold, silver, oil, and the relationships between them.",
  openGraph: {
    siteName: "Macro Metals Monitor",
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: "/macro-metals-compass.svg",
    apple: "/macro-metals-compass.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
