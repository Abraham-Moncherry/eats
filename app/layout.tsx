import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eats",
  description: "A simple daily calorie and protein tracker.",
  applicationName: "eats",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "eats" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/eats-logo-dark.png", apple: "/eats-logo-dark.png" },
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
