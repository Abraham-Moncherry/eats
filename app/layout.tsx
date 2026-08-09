import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Bite",
  description: "A simple daily calorie and protein tracker.",
  applicationName: "Daily Bite",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Daily Bite" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f6f5f0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
