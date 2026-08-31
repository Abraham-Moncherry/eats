import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
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
  themeColor: "#0d0e0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={bodyFont.variable}>
      <body>{children}</body>
    </html>
  );
}
