import type { Metadata } from "next";
import localFont from "next/font/local";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

const thmanyahSans = localFont({
  src: [
    { path: "./fonts/thmanyahsans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/thmanyahsans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/thmanyahsans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const thmanyahSerifDisplay = localFont({
  src: [
    { path: "./fonts/thmanyahserifdisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/thmanyahserifdisplay-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

const thmanyahSerifText = localFont({
  src: [
    { path: "./fonts/thmanyahseriftext-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/thmanyahseriftext-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-text",
  display: "swap",
});

/*
  improc — Dar Makkah visual system (DESIGN.md)
  World: Islamic manuscript (girih). North Star: The Teacher's Board.
  Colors: parchment #f8f4ec / ink #2a1f10 / gold #b0884b / lapis #23456b /
  red #a33b2e / rule #e6dccb. Font stacks: Thmanyah (Serif Display/Serif Text/Sans)
  with system fallbacks until font files are wired.
  Rules honored across pages: Gold Ration (gold <=10%), Board (no pure white/black),
  One Display (one display heading per page), Flat Board (no shadows).
  RTL is structural (dir=rtl), not a mirror of an LTR design.
*/

export const metadata: Metadata = {
  title: "دار مكة",
  description: "منصة اختبارات ومسابقات قرآنية",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${thmanyahSans.variable} ${thmanyahSerifDisplay.variable} ${thmanyahSerifText.variable} antialiased`}>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
