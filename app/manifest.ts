import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "eats",
    short_name: "eats",
    description: "A simple daily calorie and protein tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#f6f5f0",
    // Home screen icons carry their own opaque background: the platform decides the
    // wallpaper behind them and never tells the app whether it is light or dark.
    icons: [
      { src: "/eats-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/eats-icon-maskable.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
