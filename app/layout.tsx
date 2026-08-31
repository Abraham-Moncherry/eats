import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "eats",
  description: "A simple daily calorie and protein tracker.",
  applicationName: "eats",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "eats" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  // The browser tab sits on the browser's own chrome, so the favicon can follow the
  // colour scheme. The home screen icon cannot, so it uses the opaque tile.
  icons: {
    icon: [
      { url: "/eats-logo.png", media: "(prefers-color-scheme: light)" },
      { url: "/eats-logo-white.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/eats-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f3f1ea",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
